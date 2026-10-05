/**
 * Ported from apps/box/src/__tests__/simple.test.ts + the initialise path of contractIntegration.test.ts
 * (the mobile suite mocked ethers wholesale; here a fake EIP-1193 provider drives the real ethers v5).
 */
import { describe, expect, test, vi } from 'vitest';
import { ContractService } from '../contractService';
import { getChainConfigByName, LOCAL_DEV_CONFIG, CONTRACT_ADDRESSES, isSupportedChain } from '../config';
import { POOL_STORAGE_ABI, REWARD_ENGINE_ABI, FULA_TOKEN_ABI } from '../abis';
import { bytes32ToPeerId } from '../../utils/peerIdConversion';

const ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

function fakeEip1193(chainIdHex = '0x79f99296') {
  return {
    request: vi.fn(async ({ method }: { method: string }) => {
      switch (method) {
        case 'eth_chainId':
          return chainIdHex;
        case 'eth_accounts':
        case 'eth_requestAccounts':
          return [ACCOUNT];
        case 'net_version':
          return String(parseInt(chainIdHex, 16));
        default:
          return null;
      }
    }),
  };
}

describe('Contract configuration', () => {
  test('local + skale + base configs', () => {
    expect(getChainConfigByName('local').name).toBe('Hardhat Local');
    expect(LOCAL_DEV_CONFIG.chainId).toBe('0x7a69');
    const skale = getChainConfigByName('skale');
    expect(skale.chainId).toBe('0x79f99296');
    const base = getChainConfigByName('base');
    expect(base.chainId).toBe('0x2105');
    expect(CONTRACT_ADDRESSES.skale.contracts.poolStorage).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(isSupportedChain('0x2105')).toBe(true);
    expect(isSupportedChain('0x1')).toBe(false);
  });
});

describe('Contract ABIs', () => {
  test('required pool functions exist (request/approval governance model)', () => {
    const names = POOL_STORAGE_ABI.filter((i: { type: string }) => i.type === 'function').map((i: { name?: string }) => i.name);
    expect(names).toEqual(expect.arrayContaining(['createPool', 'joinPoolRequest', 'removeMemberPeerId', 'getPoolMembers']));
  });
  test('required reward functions exist', () => {
    const names = REWARD_ENGINE_ABI.filter((i: { type: string }) => i.type === 'function').map((i: { name?: string }) => i.name);
    expect(names).toEqual(expect.arrayContaining(['claimRewards', 'getUnclaimedRewards', 'totalRewardsClaimed']));
    expect(FULA_TOKEN_ABI.length).toBeGreaterThan(0);
  });
});

describe('ContractService', () => {
  test('initialize wraps the EIP-1193 provider in a Web3Provider with the "any" network (survives in-place switches)', async () => {
    const service = new ContractService('skale');
    await expect(service.initialize(fakeEip1193())).resolves.toBeUndefined();
    const provider = service.getProvider();
    expect(provider).not.toBeNull();
    expect(provider!.anyNetwork).toBe(true);
    expect(service.chain).toBe('skale');
  });

  test('accepts AppKit-style { provider } wrappers and returns the connected account', async () => {
    const service = new ContractService('skale');
    await service.initialize({ provider: fakeEip1193() });
    expect(await service.getConnectedAccount()).toBe(ACCOUNT);
  });

  test('a provider that throws propagates a ContractError', async () => {
    const service = new ContractService('base');
    await service.initialize(fakeEip1193('0x2105'));
    const bad = new ContractService('base');
    await expect(bad.initialize(null)).rejects.toBeDefined();
  });
});

describe('ContractService.leavePool', () => {
  const OTHER = '0x4d8d118769e887B8E1D679fED89080e0Cef0EFC5';
  const CREATOR = '0x6149AD603617fE5DbcbbE93C2bf2caA19DE7a57d';
  const KEY = `0x${'ab'.repeat(32)}`;

  /** A service on `chain` whose wallet is ACCOUNT, with the chain reads and the read-only provider stubbed. */
  async function leaveService(
    chain: 'skale' | 'base',
    opts: { isMember?: boolean; memberAddress?: string; creator?: string; simulated?: string; send?: () => unknown } = {},
  ) {
    const eip1193 = fakeEip1193(chain === 'base' ? '0x2105' : '0x79f99296');
    const sent: Array<Record<string, string>> = [];
    const baseRequest = eip1193.request;
    eip1193.request = vi.fn(async (args: { method: string; params?: unknown[] }) => {
      if (args.method === 'eth_sendTransaction') {
        sent.push(args.params![0] as Record<string, string>);
        return opts.send ? opts.send() : '0xhash';
      }
      return baseRequest(args);
    }) as typeof eip1193.request;
    const service = new ContractService(chain);
    await service.initialize(eip1193);
    service.isPeerIdMemberOfPool = vi.fn(async () => ({
      isMember: opts.isMember ?? true,
      memberAddress: opts.memberAddress ?? ACCOUNT,
    }));
    service.getPool = vi.fn(async () => ({ creator: opts.creator ?? CREATOR }));
    const readOnly = {
      call: vi.fn(async () => opts.simulated ?? '0x'),
      waitForTransaction: vi.fn(async () => ({ status: 1 })),
    };
    (service as unknown as { readOnlyProvider: unknown }).readOnlyProvider = readOnly;
    const peerId = await bytes32ToPeerId(KEY);
    return { service, readOnly, sent, peerId };
  }

  test('requires the Blox cluster peer id (never falls back to the wallet address)', async () => {
    const { service, sent } = await leaveService('skale');
    await expect(service.leavePool('1', '')).rejects.toThrow('PeerId is required');
    expect(sent).toHaveLength(0);
  });

  test('not a member → readable error, nothing sent', async () => {
    const { service, peerId, sent } = await leaveService('skale', { isMember: false });
    await expect(service.leavePool('1', peerId)).rejects.toThrow(
      'This Blox is not a member of pool 1 on SKALE Europa Hub.',
    );
    expect(sent).toHaveLength(0);
  });

  test('joined with another wallet → names that wallet, nothing sent', async () => {
    const { service, peerId, sent } = await leaveService('base', { memberAddress: OTHER });
    await expect(service.leavePool('1', peerId)).rejects.toThrow(
      `This Blox joined pool 1 with wallet ${OTHER}. Connect that wallet to leave.`,
    );
    expect(sent).toHaveLength(0);
  });

  test('the pool creator may remove a peer that another wallet joined', async () => {
    const { service, peerId, sent } = await leaveService('skale', { memberAddress: OTHER, creator: ACCOUNT });
    await service.leavePool('1', peerId);
    expect(sent).toHaveLength(1);
  });

  test('simulates and sends removeMemberPeerId(pool, bytes32(cluster peer)) from the wallet', async () => {
    const { service, peerId, readOnly, sent } = await leaveService('skale');
    await service.leavePool('1', peerId);
    const to = CONTRACT_ADDRESSES.skale.contracts.poolStorage;
    const data = `0x3d71233a${'1'.padStart(64, '0')}${'ab'.repeat(32)}`;
    // `from` matters: the contract checks msg.sender, so a simulation without it always reverts.
    expect(readOnly.call).toHaveBeenCalledWith({ from: ACCOUNT, to, data });
    expect(sent).toEqual([{ from: ACCOUNT, to, data, gas: '0x0249f0', value: '0x0' }]);
    expect(readOnly.waitForTransaction).toHaveBeenCalledWith('0xhash');
  });

  test('revert data returned by the simulation (Base RPCs) stops the send', async () => {
    const { service, peerId, sent } = await leaveService('base', { simulated: '0x2e29b7c5' });
    await expect(service.leavePool('1', peerId)).rejects.toThrow('Leaving pool 1 would fail (OCA).');
    expect(sent).toHaveLength(0);
  });

  test('wallet errors: missing gas names the chain token; a rejection says so', async () => {
    const noGas = await leaveService('base', {
      send: () => {
        throw Object.assign(new Error('insufficient funds for gas * price + value'), { code: -32000 });
      },
    });
    await expect(noGas.service.leavePool('1', noGas.peerId)).rejects.toThrow(
      'Not enough ETH on Base to pay the network fee. Top up your wallet and try again.',
    );
    const noFuel = await leaveService('skale', {
      send: () => {
        throw Object.assign(new Error('insufficient funds'), { code: -32000 });
      },
    });
    await expect(noFuel.service.leavePool('1', noFuel.peerId)).rejects.toThrow('Not enough sFUEL on SKALE');
    const rejected = await leaveService('skale', {
      send: () => {
        throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
      },
    });
    await expect(rejected.service.leavePool('1', rejected.peerId)).rejects.toThrow('Transaction was rejected by user.');
  });
});

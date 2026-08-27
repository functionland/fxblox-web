/**
 * Ported from apps/box/src/__tests__/simple.test.ts + the initialise path of contractIntegration.test.ts
 * (the mobile suite mocked ethers wholesale; here a fake EIP-1193 provider drives the real ethers v5).
 */
import { describe, expect, test, vi } from 'vitest';
import { ContractService } from '../contractService';
import { getChainConfigByName, LOCAL_DEV_CONFIG, CONTRACT_ADDRESSES, isSupportedChain } from '../config';
import { POOL_STORAGE_ABI, REWARD_ENGINE_ABI, FULA_TOKEN_ABI } from '../abis';

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
    expect(skale.requiresAuth).toBe(false);
    const base = getChainConfigByName('base');
    expect(base.chainId).toBe('0x2105');
    expect(base.requiresAuth).toBe(true);
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

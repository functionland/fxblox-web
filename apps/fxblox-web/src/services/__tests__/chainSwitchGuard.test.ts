import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TBlox } from '@/models';
import type { SupportedChain } from '@/contracts/types';
import { checkChainSwitchAllowed, type PoolReader } from '@/services/chainSwitchGuard';
import { bytes32ToPeerId } from '@/utils/peerIdConversion';

// Real cluster peer ids (CIDv1 Ed25519) derived from fixed 32-byte keys, so peerIdToBytes32 round-trips.
const KEY_A = `0x${'11'.repeat(32)}`;
const KEY_B = `0x${'22'.repeat(32)}`;
const KEY_C = `0x${'33'.repeat(32)}`;

const revert = () => Object.assign(new Error('call revert exception'), { code: 'CALL_EXCEPTION' });

interface ChainState {
  pools: string[];
  members?: Record<string, string[]>; // poolId → bytes32 peer ids
  pending?: Record<string, string[]>;
  accountsInAnyPool?: string[];
  failWith?: Error;
}

function fakeReader(state: ChainState): PoolReader & { calls: number } {
  const reader = {
    calls: 0,
    async poolIds(index: number) {
      reader.calls++;
      if (state.failWith) throw state.failWith;
      const id = state.pools[index];
      if (id === undefined) throw revert();
      return id;
    },
    async pools(poolId: string) {
      return { name: `Pool-${poolId}` };
    },
    async isPeerIdMemberOfPool(poolId: string, peer: string): Promise<[boolean, string]> {
      reader.calls++;
      return [Boolean(state.members?.[poolId]?.includes(peer)), '0x0'];
    },
    async joinRequests(poolId: string, peer: string) {
      reader.calls++;
      return { status: state.pending?.[poolId]?.includes(peer) ? 1 : 0 };
    },
    async isMemberOfAnyPool(account: string) {
      reader.calls++;
      return Boolean(state.accountsInAnyPool?.includes(account));
    },
  };
  return reader;
}

async function bloxsWith(entries: { kubo: string; name: string; clusterKey?: string }[]) {
  const bloxs: Record<string, TBlox> = {};
  const cluster: Record<string, string | undefined> = {};
  for (const e of entries) {
    const clusterPeerId = e.clusterKey ? await bytes32ToPeerId(e.clusterKey) : undefined;
    bloxs[e.kubo] = { peerId: e.kubo, name: e.name, clusterPeerId };
    cluster[e.kubo] = clusterPeerId;
  }
  return { bloxs, getClusterPeerId: (kubo: string) => cluster[kubo] };
}

const readers = (skale: ChainState, base: ChainState) => {
  const map = { skale: fakeReader(skale), base: fakeReader(base) };
  return { map, readerFor: (chain: SupportedChain) => map[chain] };
};

describe('checkChainSwitchAllowed', () => {
  afterEach(() => vi.useRealTimers());

  it('no Bloxes → ok without any RPC', async () => {
    const { map, readerFor } = readers({ pools: ['1'] }, { pools: ['1'] });
    expect(await checkChainSwitchAllowed('skale', 'base', { bloxs: {}, getClusterPeerId: () => undefined, readerFor })).toEqual({
      ok: true,
    });
    expect(map.skale.calls + map.base.calls).toBe(0);
  });

  it('allows the switch when no Blox is in (or waiting for) a pool on the current chain', async () => {
    const input = await bloxsWith([{ kubo: 'k1', name: 'Blox A', clusterKey: KEY_A }]);
    // Joined on Base only (e.g. fresh install defaulting to SKALE) — never blocked from going to Base.
    const { readerFor } = readers({ pools: ['1', '2'] }, { pools: ['1'], members: { '1': [KEY_A] } });
    expect(await checkChainSwitchAllowed('skale', 'base', { ...input, readerFor })).toEqual({ ok: true });
  });

  it('blocks when a Blox is a member of a pool on the current chain, naming the Blox and pool', async () => {
    const input = await bloxsWith([
      { kubo: 'k1', name: 'Blox A', clusterKey: KEY_A },
      { kubo: 'k2', name: 'Blox B', clusterKey: KEY_B },
    ]);
    const { readerFor } = readers({ pools: ['1', '2'], members: { '2': [KEY_B] } }, { pools: ['1'] });
    expect(await checkChainSwitchAllowed('skale', 'base', { ...input, readerFor })).toEqual({
      ok: false,
      reason: 'member',
      poolId: '2',
      poolName: 'Pool-2',
      bloxName: 'Blox B',
    });
  });

  it('blocks on a pending join request too, in both directions', async () => {
    const input = await bloxsWith([{ kubo: 'k1', name: 'Blox A', clusterKey: KEY_A }]);
    const { readerFor } = readers({ pools: ['1'] }, { pools: ['1'], pending: { '1': [KEY_A] } });
    expect(await checkChainSwitchAllowed('base', 'skale', { ...input, readerFor })).toMatchObject({
      ok: false,
      reason: 'pending',
      poolId: '1',
      bloxName: 'Blox A',
    });
  });

  it('a Blox already in a pool on the target chain does not block (member on both chains)', async () => {
    const input = await bloxsWith([{ kubo: 'k1', name: 'Blox A', clusterKey: KEY_A }]);
    const { readerFor } = readers({ pools: ['1'], members: { '1': [KEY_A] } }, { pools: ['1'], members: { '1': [KEY_A] } });
    expect(await checkChainSwitchAllowed('skale', 'base', { ...input, readerFor })).toEqual({ ok: true });
  });

  it('keeps the block if the target chain cannot be read', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const input = await bloxsWith([{ kubo: 'k1', name: 'Blox A', clusterKey: KEY_A }]);
    const { readerFor } = readers(
      { pools: ['1'], members: { '1': [KEY_A] } },
      { pools: ['1'], failWith: Object.assign(new Error('bad gateway'), { code: 'SERVER_ERROR' }) },
    );
    expect(await checkChainSwitchAllowed('skale', 'base', { ...input, readerFor })).toMatchObject({ ok: false, reason: 'member' });
  });

  it('an RPC failure (not a revert) is unverified, never ok', async () => {
    const input = await bloxsWith([{ kubo: 'k1', name: 'Blox A', clusterKey: KEY_A }]);
    const { readerFor } = readers(
      { pools: ['1'], failWith: Object.assign(new Error('missing response'), { code: 'SERVER_ERROR' }) },
      { pools: [] },
    );
    expect(await checkChainSwitchAllowed('skale', 'base', { ...input, readerFor })).toMatchObject({
      ok: false,
      reason: 'unverified',
      detail: 'missing response',
    });
  });

  it('pool id 0 ends the enumeration like a revert', async () => {
    const input = await bloxsWith([{ kubo: 'k1', name: 'Blox A', clusterKey: KEY_A }]);
    const { readerFor } = readers({ pools: ['1', '0', '2'], members: { '2': [KEY_A] } }, { pools: [] });
    expect(await checkChainSwitchAllowed('skale', 'base', { ...input, readerFor })).toEqual({ ok: true });
  });

  it('a Blox without a known cluster peer id falls back to the account; no account → unverified', async () => {
    const input = await bloxsWith([
      { kubo: 'k1', name: 'Blox A', clusterKey: KEY_A },
      { kubo: 'k2', name: 'Old Blox' },
    ]);
    const { readerFor } = readers({ pools: ['1'], accountsInAnyPool: ['0xMEMBER'] }, { pools: [] });
    expect(await checkChainSwitchAllowed('skale', 'base', { ...input, account: '0xNOBODY', readerFor })).toEqual({ ok: true });
    expect(await checkChainSwitchAllowed('skale', 'base', { ...input, account: '0xMEMBER', readerFor })).toMatchObject({
      ok: false,
      reason: 'unverified',
      bloxName: 'Old Blox',
    });
    expect(await checkChainSwitchAllowed('skale', 'base', { ...input, account: null, readerFor })).toMatchObject({
      ok: false,
      reason: 'unverified',
      bloxName: 'Old Blox',
    });
  });

  it('a confirmed block wins over an unknown Blox', async () => {
    const input = await bloxsWith([
      { kubo: 'k1', name: 'Blox A', clusterKey: KEY_A },
      { kubo: 'k3', name: 'Old Blox' },
      { kubo: 'k4', name: 'Blox C', clusterKey: KEY_C },
    ]);
    const { readerFor } = readers({ pools: ['1'], members: { '1': [KEY_C] } }, { pools: [] });
    expect(await checkChainSwitchAllowed('skale', 'base', { ...input, readerFor })).toMatchObject({
      ok: false,
      reason: 'member',
      bloxName: 'Blox C',
    });
  });

  it('times out as unverified', async () => {
    vi.useFakeTimers();
    const input = await bloxsWith([{ kubo: 'k1', name: 'Blox A', clusterKey: KEY_A }]);
    const hanging: PoolReader = {
      poolIds: () => new Promise(() => undefined),
      pools: async () => ({ name: '' }),
      isPeerIdMemberOfPool: async () => [false, ''],
      joinRequests: async () => ({ status: 0 }),
      isMemberOfAnyPool: async () => false,
    };
    const result = checkChainSwitchAllowed('skale', 'base', { ...input, readerFor: () => hanging, timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toEqual({ ok: false, reason: 'unverified', detail: 'timed out' });
  });
});

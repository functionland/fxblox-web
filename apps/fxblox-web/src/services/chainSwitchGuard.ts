/**
 * Pre-check before changing `useSettingsStore.selectedChain`. A Blox that is a pool member (or has a pending join
 * request) on the chain being left would be stranded — the app only reads and acts on the selected chain — so such a
 * switch is refused, unless that Blox is also already in a pool (or pending) on the target chain.
 *
 * Unlike `poolReadService` (which treats any RPC error as "end of list" / "not a member"), every read here is strict:
 * only a contract revert (`CALL_EXCEPTION`, verified on both chains for `poolIds(i)` past the end) ends the pool
 * enumeration; any other failure makes the result `unverified`, which the UI turns into a "switch anyway?" warning.
 */
import { ethers } from 'ethers';
import type { TBlox } from '@/models';
import type { SupportedChain } from '@/contracts/types';
import { POOL_STORAGE_ABI } from '@/contracts/abis';
import { getChainConfigByName } from '@/contracts/config';
import { peerIdToBytes32 } from '@/utils/peerIdConversion';

/** Join-request status value for a request still waiting for votes (as read by `usePoolsStore.getPools`). */
const JOIN_REQUEST_PENDING = 1;
const DEFAULT_TIMEOUT_MS = 20_000;

export type ChainSwitchCheck =
  | { ok: true }
  | { ok: false; reason: 'member' | 'pending'; poolId: string; poolName: string; bloxName: string }
  | { ok: false; reason: 'unverified'; bloxName?: string; detail: string };

/** The subset of the PoolStorage contract the guard reads. */
export interface PoolReader {
  poolIds(index: number): Promise<ethers.BigNumberish>;
  pools(poolId: string): Promise<{ name: string }>;
  isPeerIdMemberOfPool(poolId: string, peerIdBytes32: string): Promise<[boolean, string]>;
  joinRequests(poolId: string, peerIdBytes32: string): Promise<{ status: ethers.BigNumberish }>;
  isMemberOfAnyPool(account: string): Promise<boolean>;
}

export interface ChainSwitchGuardInput {
  /** `useBloxsStore.bloxs`. */
  bloxs: Record<string, TBlox>;
  /** `useBloxsStore.getClusterPeerIdForBlox` — undefined when the cluster peer id is unknown. */
  getClusterPeerId: (bloxPeerId: string) => string | undefined;
  /** Wallet account, else the manual-signature address. */
  account?: string | null;
  timeoutMs?: number;
  /** Test seam; defaults to a read-only `ethers.Contract` on the chain's public RPC. */
  readerFor?: (chain: SupportedChain) => PoolReader;
}

interface CheckedBlox {
  name: string;
  peerIdBytes32: string;
}

interface PoolHit {
  blox: CheckedBlox;
  reason: 'member' | 'pending';
  poolId: string;
}

const defaultReader = (chain: SupportedChain): PoolReader => {
  const config = getChainConfigByName(chain);
  const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
  return new ethers.Contract(config.contracts.poolStorage, POOL_STORAGE_ABI, provider) as unknown as PoolReader;
};

const isRevert = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'CALL_EXCEPTION';

/** All pool ids: `poolIds(i)` until id 0 or a revert past the end. Any other error propagates. */
async function enumeratePoolIds(reader: PoolReader): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; ; index++) {
    let id: ethers.BigNumber;
    try {
      id = ethers.BigNumber.from(await reader.poolIds(index));
    } catch (error) {
      if (isRevert(error)) return ids;
      throw error;
    }
    if (id.isZero()) return ids;
    ids.push(id.toString());
  }
}

/** One hit per Blox that is a member of, or has a pending request to, some pool on the reader's chain. */
async function findPoolHits(reader: PoolReader, bloxs: CheckedBlox[]): Promise<PoolHit[]> {
  const hits = new Map<string, PoolHit>();
  for (const poolId of await enumeratePoolIds(reader)) {
    await Promise.all(
      bloxs
        .filter((blox) => !hits.has(blox.peerIdBytes32))
        .map(async (blox) => {
          const [isMember] = await reader.isPeerIdMemberOfPool(poolId, blox.peerIdBytes32);
          if (isMember) {
            hits.set(blox.peerIdBytes32, { blox, reason: 'member', poolId });
            return;
          }
          const request = await reader.joinRequests(poolId, blox.peerIdBytes32);
          if (ethers.BigNumber.from(request.status).eq(JOIN_REQUEST_PENDING)) {
            hits.set(blox.peerIdBytes32, { blox, reason: 'pending', poolId });
          }
        }),
    );
  }
  return [...hits.values()];
}

const errorDetail = (error: unknown): string => (error instanceof Error ? error.message : String(error));

async function runCheck(fromChain: SupportedChain, toChain: SupportedChain, input: ChainSwitchGuardInput): Promise<ChainSwitchCheck> {
  const readerFor = input.readerFor ?? defaultReader;
  const known: CheckedBlox[] = [];
  const unknown: string[] = [];
  for (const blox of Object.values(input.bloxs)) {
    const clusterPeerId = input.getClusterPeerId(blox.peerId);
    if (!clusterPeerId) {
      unknown.push(blox.name);
      continue;
    }
    try {
      known.push({ name: blox.name, peerIdBytes32: await peerIdToBytes32(clusterPeerId) });
    } catch {
      unknown.push(blox.name);
    }
  }
  if (known.length === 0 && unknown.length === 0) return { ok: true };

  const fromReader = readerFor(fromChain);
  let hits: PoolHit[];
  try {
    hits = known.length > 0 ? await findPoolHits(fromReader, known) : [];
  } catch (error) {
    return { ok: false, reason: 'unverified', detail: errorDetail(error) };
  }

  // A Blox already in a pool (or pending) on the target chain is not stranded by the switch — e.g. a fresh install
  // defaults to SKALE while the Blox has joined on Base too. If the target can't be read, the confirmed hit stands.
  if (hits.length > 0) {
    try {
      const onTarget = new Set(
        (await findPoolHits(readerFor(toChain), hits.map((hit) => hit.blox))).map((hit) => hit.blox.peerIdBytes32),
      );
      hits = hits.filter((hit) => !onTarget.has(hit.blox.peerIdBytes32));
    } catch (error) {
      console.warn('chainSwitchGuard: target-chain check failed; keeping the block', error);
    }
  }

  const [hit] = hits;
  if (hit) {
    let poolName = `#${hit.poolId}`;
    try {
      poolName = (await fromReader.pools(hit.poolId)).name || poolName;
    } catch {
      // Keep the id-based name.
    }
    return { ok: false, reason: hit.reason, poolId: hit.poolId, poolName, bloxName: hit.blox.name };
  }

  // Bloxes whose cluster peer id is unknown can't be checked per peer. If the account is not a member of any pool,
  // nothing it joined can be stranded; otherwise (or with no account) the user decides.
  if (unknown.length > 0) {
    if (!input.account) return { ok: false, reason: 'unverified', bloxName: unknown[0], detail: 'cluster peer id unknown' };
    try {
      if (await fromReader.isMemberOfAnyPool(input.account)) {
        return { ok: false, reason: 'unverified', bloxName: unknown[0], detail: 'cluster peer id unknown' };
      }
    } catch (error) {
      return { ok: false, reason: 'unverified', bloxName: unknown[0], detail: errorDetail(error) };
    }
  }

  return { ok: true };
}

/** Whether the app may switch from `fromChain` to `toChain` (see the module comment). Never throws. */
export async function checkChainSwitchAllowed(
  fromChain: SupportedChain,
  toChain: SupportedChain,
  input: ChainSwitchGuardInput,
): Promise<ChainSwitchCheck> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ChainSwitchCheck>((resolve) => {
    timer = setTimeout(
      () => resolve({ ok: false, reason: 'unverified', detail: 'timed out' }),
      input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([
      runCheck(fromChain, toChain, input).catch(
        (error): ChainSwitchCheck => ({ ok: false, reason: 'unverified', detail: errorDetail(error) }),
      ),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

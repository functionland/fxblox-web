/**
 * Two-step pool-join state (step 1 = Blox `joinPool`, step 2 = contract / join-server), persisted via the KV adapter
 * so a partial join survives a reload and is re-sent with "Re-send Join". Keys are per chain, per pool AND per Blox:
 * pool ids repeat across chains, so a SKALE pool's progress must never be read for the Base pool with the same id
 * (step 1 — telling the Blox the new chain — would be skipped). SKALE keeps the mobile AsyncStorage key
 * `joinState_<poolId>_<bloxPeerId>` (in-flight joins survive the upgrade); other chains add the chain name.
 */
import { kvStore, type KeyValueStore } from '@/platform/kvStore';
import type { SupportedChain } from '@/contracts/types';

export interface JoinState {
  step1Complete: boolean;
  step2Complete: boolean;
  step1Error?: string;
  step2Error?: string;
}

export const EMPTY_JOIN_STATE: JoinState = { step1Complete: false, step2Complete: false };

export const joinStateKey = (poolId: string | number, bloxPeerId: string, chain: SupportedChain): string =>
  chain === 'skale' ? `joinState_${poolId}_${bloxPeerId}` : `joinState_${chain}_${poolId}_${bloxPeerId}`;

export async function loadJoinState(
  poolId: string | number,
  bloxPeerId: string,
  chain: SupportedChain,
  store: KeyValueStore = kvStore,
): Promise<JoinState> {
  try {
    const stored = await store.getItem(joinStateKey(poolId, bloxPeerId, chain));
    if (!stored) return { ...EMPTY_JOIN_STATE };
    const parsed = JSON.parse(stored) as Partial<JoinState> | null;
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_JOIN_STATE };
    return {
      step1Complete: Boolean(parsed.step1Complete),
      step2Complete: Boolean(parsed.step2Complete),
      step1Error: typeof parsed.step1Error === 'string' ? parsed.step1Error : undefined,
      step2Error: typeof parsed.step2Error === 'string' ? parsed.step2Error : undefined,
    };
  } catch (error) {
    console.error('Error loading join state:', error);
    return { ...EMPTY_JOIN_STATE };
  }
}

export async function saveJoinState(
  poolId: string | number,
  bloxPeerId: string,
  chain: SupportedChain,
  state: JoinState,
  store: KeyValueStore = kvStore,
): Promise<void> {
  try {
    await store.setItem(joinStateKey(poolId, bloxPeerId, chain), JSON.stringify(state));
  } catch (error) {
    console.error('Error saving join state:', error);
  }
}

export async function clearJoinState(
  poolId: string | number,
  bloxPeerId: string,
  chain: SupportedChain,
  store: KeyValueStore = kvStore,
): Promise<void> {
  try {
    await store.removeItem(joinStateKey(poolId, bloxPeerId, chain));
  } catch (error) {
    console.error('Error clearing join state:', error);
  }
}

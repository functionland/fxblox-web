/**
 * Two-step pool-join state (step 1 = Blox `joinPool`, step 2 = contract / join-server), persisted under the
 * mobile AsyncStorage key `joinState_<poolId>_<bloxPeerId>` via the KV adapter so a partial join survives a
 * reload and is re-sent with "Re-send Join". Keys are per pool AND per Blox (multi-Blox invariant).
 */
import { kvStore, type KeyValueStore } from '@/platform/kvStore';

export interface JoinState {
  step1Complete: boolean;
  step2Complete: boolean;
  step1Error?: string;
  step2Error?: string;
}

export const EMPTY_JOIN_STATE: JoinState = { step1Complete: false, step2Complete: false };

export const joinStateKey = (poolId: string | number, bloxPeerId: string): string =>
  `joinState_${poolId}_${bloxPeerId}`;

export async function loadJoinState(
  poolId: string | number,
  bloxPeerId: string,
  store: KeyValueStore = kvStore,
): Promise<JoinState> {
  try {
    const stored = await store.getItem(joinStateKey(poolId, bloxPeerId));
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
  state: JoinState,
  store: KeyValueStore = kvStore,
): Promise<void> {
  try {
    await store.setItem(joinStateKey(poolId, bloxPeerId), JSON.stringify(state));
  } catch (error) {
    console.error('Error saving join state:', error);
  }
}

export async function clearJoinState(
  poolId: string | number,
  bloxPeerId: string,
  store: KeyValueStore = kvStore,
): Promise<void> {
  try {
    await store.removeItem(joinStateKey(poolId, bloxPeerId));
  } catch (error) {
    console.error('Error clearing join state:', error);
  }
}

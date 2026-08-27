/**
 * One `createJSONStorage` over the KV store (idb-keyval `fxblox-kv`) for all six zustand stores. The persisted
 * envelope `{ state, version }` and the key names (`userProfileSlice`, `bloxsModelSlice`, `modeSlice`,
 * `PoolsModelSlice`, `PluginsModelSlice`, `dAppsSlice`) are identical to the mobile AsyncStorage adapter, so
 * every store's `migrate` body is untouched and a recorded mobile blob hydrates 1:1 (tested).
 */
import { createJSONStorage, type PersistStorage, type StateStorage } from 'zustand/middleware';
import { kvStore, type KeyValueStore } from '@/platform/kvStore';

export const PERSIST_KEYS = {
  userProfile: 'userProfileSlice',
  bloxs: 'bloxsModelSlice',
  settings: 'modeSlice',
  pools: 'PoolsModelSlice',
  plugins: 'PluginsModelSlice',
  dApps: 'dAppsSlice',
} as const;

let backing: KeyValueStore = kvStore;

/** Test hook: swap the backing KV before the stores are (re)imported. */
export function _setPersistBackingForTests(kv: KeyValueStore): void {
  backing = kv;
}

export const idbStateStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return await backing.getItem(name);
    } catch (error) {
      console.error('Error getting item from IndexedDB:', error);
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await backing.setItem(name, value);
    } catch (error) {
      console.error('Error setting item in IndexedDB:', error);
    }
  },
  removeItem: async (name) => {
    try {
      await backing.removeItem(name);
    } catch (error) {
      console.error('Error removing item from IndexedDB:', error);
    }
  },
};

/**
 * `onRehydrateStorage` factory: marks the store hydrated on success AND on failure (zustand hands us
 * `state === undefined` + the error when getItem/migrate threw). Without the fallback a corrupt blob would leave
 * `_hasHydrated` false forever and strand the RootGate.
 */
export function rehydrateHandler<S extends { setHasHydrated: (v: boolean) => void }>(name: string, markHydrated: () => void) {
  return () => (state: S | undefined, error?: unknown) => {
    if (error) console.error(`[persist] rehydrating "${name}" failed; continuing with defaults`, error);
    if (state) state.setHasHydrated(true);
    else markHydrated();
  };
}

export function zustandIdbStorage<S>(): PersistStorage<S> {
  const storage = createJSONStorage<S>(() => idbStateStorage);
  if (!storage) throw new Error('zustandIdbStorage: createJSONStorage returned undefined');
  return storage;
}

interface HydratableStore {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (cb: () => void) => () => void;
  };
}

/** Resolves once every given store has finished (re)hydrating — the RootGate's `_hasHydrated` wait. */
export function waitForHydration(stores: HydratableStore[], timeoutMs = 10_000): Promise<void> {
  return Promise.all(
    stores.map(
      (s) =>
        new Promise<void>((resolve) => {
          if (s.persist.hasHydrated()) return resolve();
          const timer = setTimeout(resolve, timeoutMs);
          const off = s.persist.onFinishHydration(() => {
            clearTimeout(timer);
            off();
            resolve();
          });
        }),
    ),
  ).then(() => undefined);
}

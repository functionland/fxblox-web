// Ported from apps/box/src/stores/dAppsSettingsStore.ts. The mobile `setAuth` called `fula.setAuth`, which does
// not exist in react-native-fula (a latent bug); that call is REMOVED. `setAuth` keeps its signature for the
// ConnectedDApps screen: it funds the dApp account when one is given and resolves `true`.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { blockchain } from '@/lib/fula';
import type { TDApp } from '@/models';
import { PERSIST_KEYS, rehydrateHandler, zustandIdbStorage } from './persist/idbStorage';

interface DAppsSliceActions {
  setHasHydrated: (isHydrated: boolean) => void;
  setAuth: (args: { peerId: string; allow: boolean; accountId?: string }) => Promise<boolean>;
  addOrUpdateDApp: (dApp: Partial<TDApp>) => Partial<TDApp> | null;
  removeDApp: (bloxPeerId: string, peerId: string) => void;
  reset: () => void;
}

interface DAppsSliceModel {
  _hasHydrated: boolean;
  /** dApps keyed by blox peerId */
  connectedDApps: Record<string, TDApp[]>;
}

export interface DAppsSlice extends DAppsSliceModel, DAppsSliceActions {}

const initialState: DAppsSliceModel = {
  _hasHydrated: false,
  connectedDApps: {},
};

export const useDAppsStore = create<DAppsSlice>()(
  persist(
    (set, get) => ({
      ...initialState,
      setHasHydrated: (isHydrated) => {
        set({ _hasHydrated: isHydrated });
      },
      setAuth: async ({ accountId = '' }) => {
        try {
          if (accountId && accountId != '') {
            await blockchain.accountFund(accountId);
          }
          // fula.setAuth does not exist (mobile bug) — authorization is recorded locally via addOrUpdateDApp.
          return true;
        } catch (error) {
          console.log('setAuth: ', error);
          throw error;
        }
      },
      addOrUpdateDApp: (dApp) => {
        if (dApp?.bloxPeerId) {
          const dApps = get().connectedDApps;
          const bloxDApps = [...(dApps[dApp.bloxPeerId] || [])];

          const existingDAppIndex = bloxDApps.findIndex((app) => app.peerId === dApp.peerId);
          if (existingDAppIndex !== -1) {
            bloxDApps[existingDAppIndex] = { ...(bloxDApps[existingDAppIndex] as TDApp), ...dApp };
          } else if (dApp?.name) {
            bloxDApps.push(dApp as TDApp);
          }

          set({ connectedDApps: { ...dApps, [dApp.bloxPeerId]: bloxDApps } });
          return dApp;
        }
        return null;
      },
      removeDApp: (bloxPeerId, peerId) => {
        const dApps = get().connectedDApps;
        const bloxDApps = dApps[bloxPeerId];
        if (bloxDApps) {
          set({ connectedDApps: { ...dApps, [bloxPeerId]: bloxDApps.filter((dApp) => dApp.peerId !== peerId) } });
        }
      },
      reset: () => {
        set(initialState);
      },
    }),
    {
      name: PERSIST_KEYS.dApps,
      version: 1,
      storage: zustandIdbStorage<Partial<DAppsSlice>>(),
      onRehydrateStorage: rehydrateHandler<DAppsSlice>(PERSIST_KEYS.dApps, () => useDAppsStore.setState({ _hasHydrated: true })),
      partialize: (state): Partial<DAppsSlice> => ({
        connectedDApps: state.connectedDApps,
      }),
    },
  ),
);

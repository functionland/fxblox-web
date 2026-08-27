// Ported from apps/box/src/stores/usePluginsStore.ts — imports + storage only. Keeps `inFlightListActivePlugins`
// keyed `${peerId}:${initFulaGen}`, per-blox keying and `partialize: () => ({})`.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { fxblox, fula } from '@/lib/fula';
import { useBloxsStore } from './useBloxsStore';
import { PERSIST_KEYS, rehydrateHandler, zustandIdbStorage } from './persist/idbStorage';

interface OperationResult {
  success: boolean;
  message: string;
}

/**
 * In-flight `listActivePlugins` call, keyed by `${peerId}:${initFulaGen}`. Collapses concurrent fetches for the
 * same blox so the always-mounted plugins sheet plus the active screen don't fan out redundant calls.
 */
let inFlightListActivePlugins: { key: string; promise: Promise<OperationResult> } | null = null;

export type PluginsFetchStatus = 'idle' | 'loading' | 'loaded' | 'error';

interface PluginsActionSlice {
  setHasHydrated: (isHydrated: boolean) => void;
  listActivePlugins: () => Promise<OperationResult>;
  installPlugin: (pluginName: string, params: string) => Promise<OperationResult>;
  uninstallPlugin: (pluginName: string) => Promise<OperationResult>;
  getInstallStatus: (pluginName: string) => Promise<OperationResult>;
  getInstallOutput: (pluginName: string, params: string) => Promise<OperationResult>;
  updatePlugin: (pluginName: string) => Promise<OperationResult>;
  removePluginsForBlox: (peerId: string) => void;
  reset: () => void;
}

interface PluginsModel {
  _hasHydrated: boolean;
  /** Installed-plugin names keyed by blox peerId (per-DEVICE fact — never a single global list). */
  activePluginsByBlox: Record<string, string[]>;
  activePluginsStatusByBlox: Record<string, PluginsFetchStatus>;
  lastOperation: { action: string; status: boolean; message: string };
}

export interface PluginsModelSlice extends PluginsModel, PluginsActionSlice {}

const initialState: PluginsModel = {
  _hasHydrated: false,
  activePluginsByBlox: {},
  activePluginsStatusByBlox: {},
  lastOperation: { action: '', status: false, message: '' },
};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const msgString = (msg: unknown): string => (typeof msg === 'string' ? msg : JSON.stringify(msg));

export const usePluginsStore = create<PluginsModelSlice>()(
  persist(
    (set, get) => ({
      ...initialState,
      setHasHydrated: (isHydrated) => {
        set({ _hasHydrated: isHydrated });
      },
      listActivePlugins: async (): Promise<OperationResult> => {
        // Resolve WHICH blox this fetch is for, and the client epoch, BEFORE the call (audit M2/M3 + ABA).
        const Helper = await import('@/utils/helper');
        const capturedPeerId = useBloxsStore.getState().currentBloxPeerId;
        const startGen = Helper.getInitFulaGen();

        if (!capturedPeerId) {
          return { success: false, message: 'No blox selected' };
        }

        // Collapse concurrent fetches for the same blox+generation (assignment below is synchronous after this).
        const key = `${capturedPeerId}:${startGen}`;
        const existing = inFlightListActivePlugins;
        if (existing && existing.key === key) {
          return existing.promise;
        }

        const stillValid = () => useBloxsStore.getState().currentBloxPeerId === capturedPeerId && Helper.getInitFulaGen() === startGen;

        const statusOf = () => get().activePluginsStatusByBlox[capturedPeerId];
        const setStatus = (status: PluginsFetchStatus) => {
          set({ activePluginsStatusByBlox: { ...get().activePluginsStatusByBlox, [capturedPeerId]: status } });
        };

        // Surface 'error' only when there is no good list yet for this blox.
        const markError = () => {
          if (stillValid() && statusOf() !== 'loaded') setStatus('error');
        };

        const run = async (): Promise<OperationResult> => {
          if (stillValid() && statusOf() !== 'loaded') setStatus('loading');

          try {
            const ready = await fula.isReady(false);
            if (!ready) {
              markError();
              return { success: false, message: 'Failed to list active plugins: Fula is not ready yet' };
            }

            const result = await fxblox.listActivePlugins();

            // Drop superseded / late responses.
            if (!stillValid()) {
              return { success: true, message: 'Active plugins response dropped (blox switched mid-call)' };
            }

            if (result.status) {
              const next: string[] = result.msg && Array.isArray(result.msg) ? result.msg : [];
              const prevMap = get().activePluginsByBlox;
              const prev = prevMap[capturedPeerId];
              // Reference-stable update: keep the SAME array instance when contents are unchanged.
              const same = Array.isArray(prev) && prev.length === next.length && prev.every((p, i) => p === next[i]);
              set({
                activePluginsByBlox: same ? prevMap : { ...prevMap, [capturedPeerId]: next },
                activePluginsStatusByBlox: { ...get().activePluginsStatusByBlox, [capturedPeerId]: 'loaded' },
              });
              return { success: true, message: next.length ? 'Active plugins listed successfully' : 'No active plugins found' };
            } else {
              markError();
              return { success: false, message: `Failed to list active plugins: ${msgString(result.msg)}` };
            }
          } catch (error) {
            markError();
            return { success: false, message: `Error listing active plugins: ${messageOf(error)}` };
          }
        };

        const promise = run();
        inFlightListActivePlugins = { key, promise };
        try {
          return await promise;
        } finally {
          if (inFlightListActivePlugins && inFlightListActivePlugins.key === key) {
            inFlightListActivePlugins = null;
          }
        }
      },
      installPlugin: async (pluginName: string, params: string): Promise<OperationResult> => {
        try {
          const result = await fxblox.installPlugin(pluginName, params);
          set({ lastOperation: { action: 'install', status: result.status, message: result.msg } });
          if (result.status) {
            await get().listActivePlugins();
            return { success: true, message: result.msg };
          } else {
            return { success: false, message: result.msg };
          }
        } catch (error) {
          return { success: false, message: `Error installing plugin: ${messageOf(error)}` };
        }
      },
      uninstallPlugin: async (pluginName: string): Promise<OperationResult> => {
        try {
          const result = await fxblox.uninstallPlugin(pluginName);
          set({ lastOperation: { action: 'uninstall', status: result.status, message: result.msg } });
          if (result.status) {
            await get().listActivePlugins();
            return { success: true, message: result.msg };
          } else {
            return { success: false, message: result.msg };
          }
        } catch (error) {
          return { success: false, message: `Error uninstalling plugin: ${messageOf(error)}` };
        }
      },
      getInstallStatus: async (pluginName: string): Promise<OperationResult> => {
        try {
          const result = await fxblox.getInstallStatus(pluginName);
          if (result.status) {
            if (result.msg == 'No Status' || result.msg == null) {
              return { success: true, message: '' };
            }
            return { success: true, message: result.msg };
          } else {
            return { success: false, message: result.msg };
          }
        } catch (error) {
          return { success: false, message: `Error getting install status: ${messageOf(error)}` };
        }
      },
      getInstallOutput: async (pluginName: string, params: string): Promise<OperationResult> => {
        try {
          const result = await fxblox.getInstallOutput(pluginName, params);
          if (result.status) {
            return { success: true, message: JSON.stringify(result.msg) };
          } else {
            return { success: false, message: JSON.stringify(result.msg) };
          }
        } catch (error) {
          return { success: false, message: `Error getting install output: ${messageOf(error)}` };
        }
      },
      updatePlugin: async (pluginName: string): Promise<OperationResult> => {
        try {
          const result = await fxblox.updatePlugin(pluginName);
          if (result.status) {
            await get().listActivePlugins();
            return { success: true, message: result.msg };
          } else {
            return { success: false, message: result.msg };
          }
        } catch (error) {
          return { success: false, message: `Error updating plugin: ${messageOf(error)}` };
        }
      },
      removePluginsForBlox: (peerId: string) => {
        const nextByBlox = { ...get().activePluginsByBlox };
        delete nextByBlox[peerId];
        const nextStatus = { ...get().activePluginsStatusByBlox };
        delete nextStatus[peerId];
        set({ activePluginsByBlox: nextByBlox, activePluginsStatusByBlox: nextStatus });
      },
      reset: () => {
        set(initialState);
      },
    }),
    {
      name: PERSIST_KEYS.plugins,
      // v0→v1: plugin install state is per-blox LIVE truth; nothing is persisted and the stale v0 blob is dropped.
      version: 1,
      storage: zustandIdbStorage<Partial<PluginsModelSlice>>(),
      onRehydrateStorage: rehydrateHandler<PluginsModelSlice>(PERSIST_KEYS.plugins, () => usePluginsStore.setState({ _hasHydrated: true })),
      partialize: (): Partial<PluginsModelSlice> => ({}),
      migrate: () => ({}),
    },
  ),
);

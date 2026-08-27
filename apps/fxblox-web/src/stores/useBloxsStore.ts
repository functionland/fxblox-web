// Ported from apps/box/src/stores/useBloxsStore.ts — imports + storage only. VERBATIM: switchGeneration,
// latestSwitchPeerId, resolveConnStatus, waitForBloxStatusSettled, the M2/M3 stillValid() guards,
// checkAllBloxStatus under withFulaSweepLock, version:3 + migrations (see AUDIT_multi_device.md).
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TBlox, TBloxFreeSpace, TBloxFolderSize, TBloxConectionStatus, TBloxProperty } from '@/models';
import { blockchain, fula, fxblox } from '@/lib/fula';
import type { BloxFreeSpaceResponse, GetFolderPathResponse, GetDatastoreSizeResponse } from '@/lib/fula';
import { useUserProfileStore } from './useUserProfileStore';
import { PERSIST_KEYS, rehydrateHandler, zustandIdbStorage } from './persist/idbStorage';

let switchGeneration = 0;
let latestSwitchPeerId: string | null = null;

/**
 * Map a connection-probe result to the per-blox status to display, MIRRORING the lower-level
 * `useUserProfileStore.checkBloxConnection` classification instead of collapsing every non-connected result to
 * a red 'DISCONNECTED' (audit M2/S3). Returns the status to write, or null to leave the prior status as-is.
 */
export const resolveConnStatus = (connected: boolean, lowerStatus: string | undefined): TBloxConectionStatus | null => {
  if (connected) {
    return 'CONNECTED';
  }
  if (lowerStatus === 'DISCONNECTED' || lowerStatus === 'NO INTERNET' || lowerStatus === 'NO CLIENT') {
    return lowerStatus;
  }
  // Cancelled / unknown (lower-level left 'CHECKING'): don't overwrite.
  return null;
};

export async function waitForBloxStatusSettled(peerId: string, get: () => BloxsModelSlice, timeoutMs = 60000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = get().bloxsConnectionStatus[peerId];
    // Settled = any terminal verdict; only CHECKING / SWITCHING (and an unset status) are in-progress.
    if (status && status !== 'CHECKING' && status !== 'SWITCHING') return;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

interface BloxsActionSlice {
  setHasHydrated: (isHydrated: boolean) => void;
  update: (model: Partial<BloxsModel>) => void;
  addBlox: (blox: TBlox) => void;
  updateBlox: (blox: Partial<TBlox> & Pick<TBlox, 'peerId'>) => void;
  removeBlox: (peerId: string) => void;
  updateBloxPropertyInfo: (peerId: string, info: TBloxProperty) => void;
  updateBloxSpaceInfo: (peerId: string, info: TBloxFreeSpace) => void;
  updateFolderSizeInfo: (peerId: string, info: TBloxFolderSize) => void;
  reset: () => void;
  setCurrentBloxPeerId: (peerId: string) => void;
  switchToBlox: (peerId: string) => Promise<void>;

  getClusterPeerIdForBlox: (peerId: string) => string | undefined;
  getCurrentClusterPeerId: () => string | undefined;

  getBloxSpace: (updateStore?: boolean) => Promise<TBloxFreeSpace>;
  getFolderSize: (updateStore?: boolean) => Promise<TBloxFolderSize>;
  checkBloxConnection: (maxTries?: number, waitBetweenRetries?: number) => Promise<boolean>;
  checkAllBloxStatus: () => Promise<void>;
}

interface BloxsModel {
  _hasHydrated: boolean;
  bloxs: Record<string, TBlox>;
  bloxsSpaceInfo?: Record<string, TBloxFreeSpace>;
  folderSizeInfo?: Record<string, TBloxFolderSize>;
  bloxsPropertyInfo?: Record<string, TBloxProperty>;
  bloxsConnectionStatus: Record<string, TBloxConectionStatus>;
  currentBloxPeerId?: string;
  isChainSynced: boolean;
  syncProgress: number;
  /** Transient flag: set to 'switch' during switchToBlox to prevent double initFula */
  _initFulaSource: 'switch' | null;
  /** Transient flag: true while checkAllBloxStatus is running */
  _isCheckingAllStatus: boolean;
}

export interface BloxsModelSlice extends BloxsModel, BloxsActionSlice {}

const inittalState: BloxsModel = {
  _hasHydrated: false,
  bloxs: {},
  bloxsSpaceInfo: {},
  bloxsPropertyInfo: {},
  bloxsConnectionStatus: {},
  currentBloxPeerId: undefined,
  isChainSynced: false,
  syncProgress: 0,
  _initFulaSource: null,
  _isCheckingAllStatus: false,
};

export const useBloxsStore = create<BloxsModelSlice>()(
  persist(
    (set, get) => ({
      ...inittalState,
      setHasHydrated: (isHydrated) => {
        set({ _hasHydrated: isHydrated });
      },
      setCurrentBloxPeerId: (peerId: string) => {
        set({ currentBloxPeerId: peerId });
      },
      getClusterPeerIdForBlox: (peerId: string) => {
        const blox = get().bloxs[peerId];
        const stored = blox?.clusterPeerId;
        // If clusterPeerId equals kubo peerId, it's a stale migration default — not real
        return stored && stored !== peerId ? stored : undefined;
      },
      getCurrentClusterPeerId: () => {
        const { currentBloxPeerId, bloxs } = get();
        if (!currentBloxPeerId) return undefined;
        const stored = bloxs[currentBloxPeerId]?.clusterPeerId;
        return stored && stored !== currentBloxPeerId ? stored : undefined;
      },
      update: (model) => {
        set({ ...model });
      },
      addBlox: (blox) => {
        const { bloxs: currentBloxs } = get();
        set({ bloxs: { ...currentBloxs, [blox.peerId]: { ...blox } } });
      },
      updateBlox: (blox) => {
        const { bloxs: currentBloxs } = get();
        const existing = currentBloxs[blox.peerId];
        set({
          bloxs: {
            ...currentBloxs,
            [blox.peerId]: { ...(existing ?? { peerId: blox.peerId, name: '' }), ...blox },
          },
        });
      },
      removeBlox: (peerId: string) => {
        const { bloxs, bloxsPropertyInfo, bloxsSpaceInfo, folderSizeInfo, bloxsConnectionStatus, currentBloxPeerId } = get();

        // Build NEW objects rather than mutating the refs returned by get(); clear EVERY per-blox map (audit H2).
        const nextBloxs = { ...bloxs };
        delete nextBloxs[peerId];
        const nextPropertyInfo = { ...(bloxsPropertyInfo ?? {}) };
        delete nextPropertyInfo[peerId];
        const nextSpaceInfo = { ...(bloxsSpaceInfo ?? {}) };
        delete nextSpaceInfo[peerId];
        const nextFolderSizeInfo = { ...(folderSizeInfo ?? {}) };
        delete nextFolderSizeInfo[peerId];
        const nextConnectionStatus = { ...bloxsConnectionStatus };
        delete nextConnectionStatus[peerId];

        // If we removed the currently-selected blox, repoint to the first remaining one (or undefined).
        let nextCurrentBloxPeerId = currentBloxPeerId;
        if (currentBloxPeerId === peerId) {
          const remaining = Object.keys(nextBloxs);
          nextCurrentBloxPeerId = remaining.length > 0 ? remaining[0] : undefined;
        }

        set({
          bloxs: nextBloxs,
          bloxsPropertyInfo: nextPropertyInfo,
          bloxsSpaceInfo: nextSpaceInfo,
          folderSizeInfo: nextFolderSizeInfo,
          bloxsConnectionStatus: nextConnectionStatus,
          currentBloxPeerId: nextCurrentBloxPeerId,
        });

        // Drop the removed blox's cached plugin state too (dynamic import avoids a store↔store cycle).
        import('./usePluginsStore')
          .then(({ usePluginsStore }) => usePluginsStore.getState().removePluginsForBlox(peerId))
          .catch(() => {});
      },
      reset: () => {
        set({ ...inittalState });
      },
      getBloxSpace: async (updateStore = true) => {
        try {
          const Helper = await import('@/utils/helper');
          await Helper.waitForFulaInit();
          await fula.isReady(false);
          // Capture the target blox + client epoch BEFORE the call (audit M3).
          const capturedPeerId = get().currentBloxPeerId;
          const startGen = Helper.getInitFulaGen();
          let bloxSpace: BloxFreeSpaceResponse = await blockchain.bloxFreeSpace();
          console.log('bloxSpace', bloxSpace);
          const emptyBloxSpace: BloxFreeSpaceResponse = { size: 0, avail: 0, used: 0, used_percentage: 0 };
          if (updateStore) {
            if (!bloxSpace?.size) {
              bloxSpace = emptyBloxSpace;
            }
            // Only attribute the result if the selection AND the client are still the ones we queried.
            const stillValid = get().currentBloxPeerId === capturedPeerId && Helper.getInitFulaGen() === startGen;
            if (stillValid && capturedPeerId) {
              set({
                bloxsSpaceInfo: {
                  ...get().bloxsSpaceInfo,
                  [capturedPeerId]: { ...bloxSpace } as TBloxFreeSpace,
                },
              });
            }
          }
          return bloxSpace as TBloxFreeSpace;
        } catch (error) {
          console.log(error);
          throw error;
        }
      },
      getFolderSize: async (updateStore = true) => {
        try {
          const Helper = await import('@/utils/helper');
          await Helper.waitForFulaInit();
          await fula.isReady(false);
          // Capture target blox + client epoch before the calls (audit M3).
          const capturedPeerId = get().currentBloxPeerId;
          const startGen = Helper.getInitFulaGen();
          let folderSizeInfo_tmp: TBloxFolderSize = { fula: '-1', chain: '-1', fulaCount: '-1', userOwnData: '-1' };
          let chainFolderInfo: GetFolderPathResponse = { size: '-1', folder_path: '/uniondrive/chain' };
          const chainFolderSize = await fxblox.getFolderSize('/uniondrive/chain');
          let userOwnDataFolderInfo: GetFolderPathResponse = { size: '-1', folder_path: '/uniondrive/ipfs_datastore_local' };
          const userOwnDataFolderSize = await fxblox.getFolderSize('/uniondrive/ipfs_datastore_local');
          let fulaFolderInfo: GetDatastoreSizeResponse = { size: '-1', folder_path: '', count: '-1', storage_max: '', version: '' };
          const fulaFolderSize = await fxblox.getDatastoreSize();

          if (updateStore) {
            if (chainFolderSize?.size) {
              chainFolderInfo = chainFolderSize;
            }
            if (fulaFolderSize?.size) {
              fulaFolderInfo = fulaFolderSize;
            }
            if (userOwnDataFolderSize?.size) {
              userOwnDataFolderInfo = userOwnDataFolderSize;
            }
            folderSizeInfo_tmp = {
              fula: fulaFolderInfo.size,
              fulaCount: fulaFolderInfo.count,
              chain: chainFolderInfo.size,
              userOwnData: userOwnDataFolderInfo.size,
            };
            const stillValid = get().currentBloxPeerId === capturedPeerId && Helper.getInitFulaGen() === startGen;
            if (stillValid && capturedPeerId) {
              set({
                folderSizeInfo: {
                  ...get().folderSizeInfo,
                  [capturedPeerId]: { ...folderSizeInfo_tmp },
                },
              });
            }
          }
          return folderSizeInfo_tmp;
        } catch (error) {
          console.log(error);
          throw error;
        }
      },
      updateBloxPropertyInfo: (peerId, info) => {
        const { bloxsPropertyInfo } = get();
        set({ bloxsPropertyInfo: { ...bloxsPropertyInfo, [peerId]: { ...info } } });
      },
      updateFolderSizeInfo: (peerId, info) => {
        const { folderSizeInfo } = get();
        set({ folderSizeInfo: { ...folderSizeInfo, [peerId]: { ...info } } });
      },
      updateBloxSpaceInfo: (peerId, info) => {
        const { bloxsSpaceInfo } = get();
        set({ bloxsSpaceInfo: { ...bloxsSpaceInfo, [peerId]: { ...info } } });
      },
      checkBloxConnection: async (maxTries?: number, waitBetweenRetries?: number) => {
        // Capture the target blox + client epoch once so a switch / re-init during the async check can't write
        // status under the wrong blox (audit M2).
        const peerId = get().currentBloxPeerId;
        if (!peerId) {
          return false;
        }
        const Helper = await import('@/utils/helper');
        const startGen = Helper.getInitFulaGen();
        // Remember the status before we flip it to CHECKING so a superseded check can restore it.
        const priorStatus = get().bloxsConnectionStatus[peerId];

        const stillValid = () => get().currentBloxPeerId === peerId && Helper.getInitFulaGen() === startGen;

        // Restore the pre-check status when superseded (no phantom CHECKING spinner; never resurrect a removed blox).
        const restorePriorIfSuperseded = () => {
          if (!stillValid() && get().bloxsConnectionStatus[peerId] === 'CHECKING') {
            const next = { ...get().bloxsConnectionStatus };
            if (priorStatus === undefined) delete next[peerId];
            else next[peerId] = priorStatus;
            set({ bloxsConnectionStatus: next });
          }
        };

        try {
          set({ bloxsConnectionStatus: { ...get().bloxsConnectionStatus, [peerId]: 'CHECKING' } });
          console.log('Geting blox connection status');
          const connected = await useUserProfileStore.getState().checkBloxConnection(maxTries, waitBetweenRetries);

          // Only attribute the result if no switch / re-init interfered (audit M2 / S3).
          if (stillValid()) {
            const lowerStatus = useUserProfileStore.getState().bloxConnectionStatus;
            const resolved = resolveConnStatus(connected, lowerStatus);
            if (resolved) {
              set({ bloxsConnectionStatus: { ...get().bloxsConnectionStatus, [peerId]: resolved } });
            }
            // resolved === null: a NEWER same-peer check owns the final write; leaving 'CHECKING' is correct.
          } else {
            restorePriorIfSuperseded();
          }
          return connected;
        } catch {
          if (stillValid()) {
            set({ bloxsConnectionStatus: { ...get().bloxsConnectionStatus, [peerId]: 'DISCONNECTED' } });
          } else {
            restorePriorIfSuperseded();
          }
          return false;
        }
      },
      switchToBlox: async (peerId: string) => {
        const { currentBloxPeerId, bloxsConnectionStatus } = get();

        // If already on this Blox, no need to switch
        if (currentBloxPeerId === peerId) {
          console.log('Already connected to this Blox:', peerId);
          return;
        }

        console.log('Switching from Blox:', currentBloxPeerId, 'to:', peerId);

        // Increment generation so any in-flight switch is cancelled
        const myGeneration = ++switchGeneration;

        const setFulaIsReady = useUserProfileStore.getState().setFulaIsReady;

        // === Fast phase (synchronous — returns immediately) ===
        setFulaIsReady(false);
        latestSwitchPeerId = peerId;
        set({
          _initFulaSource: 'switch',
          currentBloxPeerId: peerId,
          bloxsConnectionStatus: { ...bloxsConnectionStatus, [peerId]: 'SWITCHING' },
        });

        // Mark this specific peerId as DISCONNECTED, but only if a newer generation hasn't already claimed this
        // same peerId (A→B→A case).
        const setDisconnected = () => {
          if (switchGeneration !== myGeneration && latestSwitchPeerId === peerId) {
            return;
          }
          set({ bloxsConnectionStatus: { ...get().bloxsConnectionStatus, [peerId]: 'DISCONNECTED' } });
        };

        // === Background phase (fire-and-forget) ===
        (async () => {
          try {
            // Debounce: rapid switches (A→B→C) only dispatch client calls for the final target.
            await new Promise((resolve) => setTimeout(resolve, 300));
            if (switchGeneration !== myGeneration) {
              console.log('Switch to', peerId, 'debounced (newer switch pending)');
              setDisconnected();
              return;
            }

            const Helper = await import('@/utils/helper');

            // Reset any in-progress initFula so we can start immediately.
            Helper.resetInitFula();
            if (switchGeneration !== myGeneration) {
              console.log('Switch to', peerId, 'superseded after resetInitFula');
              setDisconnected();
              return;
            }

            const { password, signiture } = useUserProfileStore.getState();
            if (!password || !signiture) {
              console.error('Missing credentials for Blox switch');
              setFulaIsReady(false);
              setDisconnected();
              return;
            }

            console.log('Re-initializing Fula connection for new Blox:', peerId);
            await Helper.initFula({
              password,
              signiture,
              bloxPeerId: peerId,
              shouldCancel: () => switchGeneration !== myGeneration,
            });

            if (switchGeneration !== myGeneration) {
              console.log('Switch to', peerId, 'superseded after initFula');
              setDisconnected();
              return;
            }

            // Mark fula as ready FOR this specific blox (audit M4/S2).
            setFulaIsReady(true, peerId);

            set({ bloxsConnectionStatus: { ...get().bloxsConnectionStatus, [peerId]: 'CHECKING' } });

            // Call the lower-level check directly so we manage status for THIS peerId. 1 try / 5 s.
            const connected = await useUserProfileStore.getState().checkBloxConnection(1, 5);

            if (switchGeneration !== myGeneration) {
              console.log('Switch to', peerId, 'superseded after checkBloxConnection');
              setDisconnected();
              return;
            }

            // Mirror the lower-level classification; this write MUST be terminal (waitForBloxStatusSettled
            // blocks on it), so fall back to DISCONNECTED rather than leaving CHECKING.
            const lowerStatus = useUserProfileStore.getState().bloxConnectionStatus;
            set({
              bloxsConnectionStatus: {
                ...get().bloxsConnectionStatus,
                [peerId]: resolveConnStatus(connected, lowerStatus) ?? 'DISCONNECTED',
              },
            });

            console.log('Blox switch completed. Connected:', connected);
          } catch (error) {
            console.error('Failed to switch to Blox:', peerId, error);
            setDisconnected();
            if (switchGeneration === myGeneration) {
              useUserProfileStore.getState().setFulaIsReady(false);
            }
          }
        })();
      },
      checkAllBloxStatus: async () => {
        // Re-entry guard: never run two sweeps at once (audit M1).
        if (get()._isCheckingAllStatus) {
          console.log('checkAllBloxStatus: already running, skipping re-entry');
          return;
        }
        if (Object.keys(get().bloxs).length === 0) return;

        set({ _isCheckingAllStatus: true });

        try {
          const Helper = await import('@/utils/helper');
          // Serialize against any other sweep over the single shared client (audit M1). switchToBlox /
          // checkBloxConnection are invoked INSIDE and do NOT take this lock, so there is no self-deadlock.
          await Helper.withFulaSweepLock(async () => {
            const originalBloxPeerId = get().currentBloxPeerId;
            const bloxList = Object.keys(get().bloxs);

            // 1. Check current blox first (no switching needed)
            if (originalBloxPeerId && get().bloxs[originalBloxPeerId]) {
              await get().checkBloxConnection(1, 5);
            }

            // 2. For each non-current blox, switch + check
            for (const peerId of bloxList) {
              if (peerId === originalBloxPeerId) continue;
              await get().switchToBlox(peerId);
              await waitForBloxStatusSettled(peerId, get);
            }

            // 3. Switch back to original blox
            if (originalBloxPeerId && get().currentBloxPeerId !== originalBloxPeerId) {
              await get().switchToBlox(originalBloxPeerId);
              await waitForBloxStatusSettled(originalBloxPeerId, get);
            }
          });
        } finally {
          set({ _isCheckingAllStatus: false });
        }
      },
    }),
    {
      name: PERSIST_KEYS.bloxs,
      version: 3,
      storage: zustandIdbStorage<Partial<BloxsModelSlice>>(),
      onRehydrateStorage: rehydrateHandler<BloxsModelSlice>(PERSIST_KEYS.bloxs, () => useBloxsStore.setState({ _hasHydrated: true })),
      partialize: (state): Partial<BloxsModelSlice> => ({
        bloxs: state.bloxs,
        bloxsSpaceInfo: state.bloxsSpaceInfo,
        bloxsPropertyInfo: state.bloxsPropertyInfo,
        currentBloxPeerId: state.currentBloxPeerId,
      }),
      migrate: async (persistedState, version) => {
        let bloxsModel = persistedState as Partial<BloxsModelSlice>;
        try {
          if (version === 1) {
            if (persistedState) {
              type LegacyBlox = TBlox & { freeSpace?: TBloxFreeSpace; propertyInfo?: TBloxProperty };
              const bloxs = Object.values((bloxsModel?.bloxs || {}) as Record<string, LegacyBlox>);
              const bloxsSapceInfo = bloxs.reduce(
                (obj, blox) => {
                  obj[blox?.peerId] = { ...blox?.freeSpace } as TBloxFreeSpace;
                  return obj;
                },
                {} as Record<string, TBloxFreeSpace>,
              );
              const bloxsPropertyInfo = bloxs.reduce(
                (obj, blox) => {
                  obj[blox?.peerId] = { ...blox?.propertyInfo } as TBloxProperty;
                  return obj;
                },
                {} as Record<string, TBloxProperty>,
              );
              bloxsModel = {
                ...bloxsModel,
                bloxsPropertyInfo: { ...bloxsPropertyInfo },
                bloxsSpaceInfo: { ...bloxsSapceInfo },
              };
            }
          }
          if (version <= 2) {
            // v2→v3: set clusterPeerId = peerId for existing bloxes (the old shared peerID is the cluster peerID)
            const migratedBloxs: Record<string, TBlox> = {};
            for (const [key, blox] of Object.entries(bloxsModel?.bloxs || {})) {
              migratedBloxs[key] = { ...blox, clusterPeerId: blox.clusterPeerId || blox.peerId };
            }
            bloxsModel = { ...bloxsModel, bloxs: migratedBloxs };
          }
        } catch (error) {
          console.log(error);
        }
        return bloxsModel;
      },
    },
  ),
);

/** Test hook: read the module-level switch generation (invariant tests). */
export const _switchState = () => ({ switchGeneration, latestSwitchPeerId });

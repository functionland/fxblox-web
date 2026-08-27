// Ported from apps/box/src/stores/useUserProfileStore.ts — fula → @/lib/fula; KeyChain → platform/secureStore;
// NetInfo/axios probe → platform/network.isOnline(); storage → shared IDB adapter; `logout()` implemented.
// version:1, migrate, partialize and the generation guards are VERBATIM.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { blockchain, fula } from '@/lib/fula';
import type { TAccount, TBloxFreeSpace } from '@/models';
import * as KeyChain from '@/platform/secureStore';
import { isOnline } from '@/platform/network';
import { useBloxsStore } from './useBloxsStore';
import { useSettingsStore } from './useSettingsStore';
import { PERSIST_KEYS, rehydrateHandler, zustandIdbStorage } from './persist/idbStorage';

type BloxConectionStatus = 'CONNECTED' | 'CHECKING' | 'DISCONNECTED' | 'NO INTERNET' | 'NO CLIENT';

interface UserProfileActions {
  setHasHydrated: (isHydrated: boolean) => void;
  setKeyChainValue: (service: KeyChain.Service, value: string) => Promise<void>;
  loadAllCredentials: () => Promise<void>;
  setWalletId: (walletId: string, clearSigniture?: boolean) => Promise<void>;
  setManualSignatureWalletAddress: (address: string) => void;
  setAppPeerId: (peerId: string | undefined) => void;
  setBloxPeerIds: (peerIds: string[] | undefined) => void;
  createAccount: ({ seed }: { seed: string }) => Promise<TAccount>;
  getEarnings: (account?: string) => Promise<void>;
  getContractRewards: () => Promise<void>;
  claimRewards: (poolId?: string) => Promise<void>;
  getBloxSpace: () => Promise<TBloxFreeSpace>;
  /** Web: wipes the SecureStore, resets every store and disconnects the wallet. */
  logout: () => Promise<boolean>;
  setFulaIsReady: (value: boolean, peerId?: string) => void;
  checkBloxConnection: (maxTries?: number, waitBetweenRetries?: number) => Promise<boolean>;
  reset: () => void;
  checkFulaReadiness: (maxAttempts?: number) => Promise<void>;
  setFulaReinitCount: (count: number) => void;
  setUseLocalIp: (localIp: string) => void;
}

export interface UserProfileSlice {
  _hasHydrated: boolean;
  walletId?: string | undefined;
  /** Password is a phrase the user enters to create the DID and make the signature */
  password?: string | undefined;
  /** signiture is the result of signing the password chain code with the wallet */
  signiture?: string | undefined;
  address?: string | undefined;
  /** wallet address entered by the user when signing manually */
  manualSignatureWalletAddress?: string | undefined;
  fulaPeerId?: string | undefined;
  fulaRoodCID?: string | undefined;
  appPeerId?: string | undefined;
  bloxPeerIds?: string[] | undefined;
  accounts: TAccount[];
  earnings: string;
  activeAccount?: TAccount | undefined;
  bloxSpace: TBloxFreeSpace | undefined;
  fulaIsReady: boolean;
  /**
   * The blox peerId the shared client is currently ready FOR. Consumers that act on readiness for the selected
   * blox must check `fulaIsReady && fulaReadyForPeerId === currentBloxPeerId` (audit M4/S2). Transient.
   */
  fulaReadyForPeerId?: string | undefined;
  bloxConnectionStatus: BloxConectionStatus;
  fulaReinitCount: number;
  useLocalIp: string | undefined;
  lastFulaReinitTime: number;
}

export type UserProfileStore = UserProfileSlice & UserProfileActions;

// Generation counter for cancelling stale checkBloxConnection calls
let connectionCheckGeneration = 0;

const initialState: UserProfileSlice = {
  _hasHydrated: false,
  bloxPeerIds: [],
  accounts: [],
  earnings: '0.0',
  bloxSpace: undefined,
  fulaIsReady: false,
  fulaReadyForPeerId: undefined,
  bloxConnectionStatus: 'CHECKING',
  appPeerId: undefined,
  fulaRoodCID: undefined,
  fulaPeerId: undefined,
  signiture: undefined,
  password: undefined,
  address: undefined,
  manualSignatureWalletAddress: undefined,
  walletId: undefined,
  fulaReinitCount: 0,
  useLocalIp: 'scan',
  lastFulaReinitTime: 0,
};

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : typeof error === 'string' ? error : String(error));

export const useUserProfileStore = create<UserProfileStore>()(
  persist(
    (set, get) => {
      let readinessPromise: Promise<void> | null = null; // Shared promise for tracking execution
      return {
        ...initialState,
        checkFulaReadiness: async (maxAttempts = 3): Promise<void> => {
          // If a readiness check is already running, wait for it to finish
          if (readinessPromise) {
            console.log('checkFulaReadiness is already running. Waiting...');
            try {
              await Promise.race([
                readinessPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for readiness')), 5000)),
              ]);
            } catch (error) {
              console.error(messageOf(error));
            }
            return;
          }

          readinessPromise = new Promise<void>((resolve, reject) => {
            (async () => {
              try {
                let attempts = 0;
                const checkInterval = 3000;

                const check = async () => {
                  if (!(await isOnline())) {
                    console.log('Internet is not connected, waiting for connection...');
                    set({ fulaIsReady: false, fulaReadyForPeerId: undefined });
                    resolve();
                    return;
                  }

                  const ready = await fula.isReady(false);
                  console.log('ready is : ' + ready);

                  if (ready || attempts >= maxAttempts) {
                    // Keep per-blox readiness consistent with the global flag (audit M4/S2).
                    const readyPeerId = useBloxsStore.getState().currentBloxPeerId;
                    set({
                      fulaIsReady: ready,
                      fulaReadyForPeerId: ready ? readyPeerId : undefined,
                    });

                    if (attempts >= maxAttempts && !ready) {
                      const currentLocalIp = get().useLocalIp;
                      if (currentLocalIp && currentLocalIp !== 'scan' && currentLocalIp !== 'delete') {
                        set({ useLocalIp: 'delete' });
                        console.log(`useLocalIp was updated to "delete" from "${currentLocalIp}"`);
                      } else if (!currentLocalIp || currentLocalIp === '') {
                        set({ useLocalIp: 'scan' });
                      } else {
                        set((state) => ({ fulaReinitCount: state.fulaReinitCount + 1 }));
                      }
                      reject(new Error('could not initialize fula'));
                    }
                    resolve();
                  } else {
                    console.log('Fula is not ready yet, retrying...');
                    attempts++;
                    setTimeout(check, checkInterval);
                  }
                };

                await check();
              } catch (error) {
                console.error('Error in checkFulaReadiness:', error);
                reject(error);
              } finally {
                readinessPromise = null;
              }
            })();
          });

          return readinessPromise;
        },
        setHasHydrated: (isHydrated) => {
          set({ _hasHydrated: isHydrated });
        },
        setUseLocalIp: (localIp: string) => {
          set({ useLocalIp: localIp });
        },
        loadAllCredentials: async () => {
          const password = (await KeyChain.load(KeyChain.Service.DIDPassword)) || undefined;
          const fulaPeerId = (await KeyChain.load(KeyChain.Service.FULAPeerId)) || undefined;
          const fulaRoodCID = (await KeyChain.load(KeyChain.Service.FULARootCID)) || undefined;
          const signiture = (await KeyChain.load(KeyChain.Service.Signiture)) || undefined;
          const address = (await KeyChain.load(KeyChain.Service.Address)) || undefined;
          set({
            password: password?.password,
            fulaPeerId: fulaPeerId?.password,
            fulaRoodCID: fulaRoodCID?.password,
            signiture: signiture?.password,
            address: address?.password,
          });
        },
        setKeyChainValue: async (service, value) => {
          switch (service) {
            case KeyChain.Service.DIDPassword: {
              const dIDPassword = (await KeyChain.save('DIDPassword', value, service)) || undefined;
              set({ password: dIDPassword?.password });
              break;
            }
            case KeyChain.Service.FULAPeerId: {
              const fULAPeerId = (await KeyChain.save('FULAPeerId', value, service)) || undefined;
              set({ fulaPeerId: fULAPeerId?.password });
              break;
            }
            case KeyChain.Service.FULARootCID: {
              const fULARootCID = (await KeyChain.save('FULARootCID', value, service)) || undefined;
              set({ fulaRoodCID: fULARootCID?.password });
              break;
            }
            case KeyChain.Service.Signiture: {
              const signiture = (await KeyChain.save('Signiture', value, service)) || undefined;
              set({ signiture: signiture?.password });
              break;
            }
            case KeyChain.Service.Address: {
              const address = (await KeyChain.save('Address', value, service)) || undefined;
              set({ address: address?.password });
              break;
            }
            default:
              break;
          }
        },
        setWalletId: async (walletId, clearSigniture) => {
          if (clearSigniture) {
            await KeyChain.reset(KeyChain.Service.DIDPassword);
            await KeyChain.reset(KeyChain.Service.Signiture);
            await KeyChain.reset(KeyChain.Service.Address);
            set({ walletId, password: undefined, signiture: undefined, address: undefined });
          } else {
            set({ walletId });
          }
        },
        setManualSignatureWalletAddress: (address) => {
          set({ manualSignatureWalletAddress: address });
        },
        setAppPeerId: (peerId) => {
          set({ appPeerId: peerId });
        },
        setBloxPeerIds: (peerIds) => {
          set({ bloxPeerIds: peerIds });
        },
        setFulaReinitCount: (count: number) => {
          set({ fulaReinitCount: count });
        },
        createAccount: async ({ seed }) => {
          const { fulaIsReady } = get();
          if (!fulaIsReady) {
            console.log('Fula is not ready. Please wait...');
          }
          const accounts = get().accounts;
          await fula.isReady(false);
          const account = await blockchain.createAccount(`/${seed}`);
          set({ accounts: [account, ...accounts] });
          return account;
        },
        /**
         * Fetches the FULA token balance for the specified account address (read-only RPC; ethers lazy-loaded).
         */
        getEarnings: async (account?: string) => {
          try {
            if (!account) {
              throw new Error('Account address is required for balance query');
            }
            const selectedChain = useSettingsStore.getState().selectedChain;
            const [{ ethers }, { getChainConfigByName }, { FULA_TOKEN_ABI }] = await Promise.all([
              import('ethers'),
              import('@/contracts/config'),
              import('@/contracts/abis'),
            ]);
            const chainConfig = getChainConfigByName(selectedChain);
            const readOnlyProvider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);
            const tokenContract = new ethers.Contract(chainConfig.contracts.fulaToken, FULA_TOKEN_ABI, readOnlyProvider);
            console.log('Getting FULA token balance for account:', account);
            const [balance, decimals] = await Promise.all([tokenContract.balanceOf(account), tokenContract.decimals()]);
            const fulaBalance = ethers.utils.formatUnits(balance, decimals);
            set({ earnings: fulaBalance });
          } catch (error) {
            console.error('Error getting FULA token balance:', error);
            set({ earnings: 'NaN' });
            throw error;
          }
        },
        getContractRewards: async () => {
          try {
            const selectedChain = useSettingsStore.getState().selectedChain;
            const { getContractService } = await import('@/contracts/contractService');
            const contractService = getContractService(selectedChain);
            const account = await contractService.getConnectedAccount();
            const totalRewards = await contractService.getTotalRewards(account);
            set({ earnings: totalRewards });
          } catch (error) {
            console.error('Error getting contract rewards:', error);
            set({ earnings: 'NaN' });
            throw error;
          }
        },
        claimRewards: async (poolId?: string) => {
          try {
            const selectedChain = useSettingsStore.getState().selectedChain;
            const { getContractService } = await import('@/contracts/contractService');
            const contractService = getContractService(selectedChain);
            let target = poolId;
            if (!target) {
              const account = await contractService.getConnectedAccount();
              const userPool = await contractService.getUserPool(account);
              if (!userPool.poolId || userPool.poolId === '0') {
                throw new Error('User is not in any pool');
              }
              target = userPool.poolId;
            }
            await contractService.claimRewards(target);
            await get().getContractRewards();
          } catch (error) {
            console.error('Error claiming rewards:', error);
            throw error;
          }
        },
        logout: async () => {
          // Clear every secret + per-user store; disconnect the wallet (lazy AppKit import so the wallet chunk
          // is not pulled in by a store that may run before the wallet route mounts).
          try {
            await KeyChain.wipe();
          } catch (e) {
            console.warn('logout: secure store wipe failed', e);
          }
          try {
            const { disconnectWallet } = await import('@/wallet/appkit');
            await disconnectWallet();
          } catch (e) {
            console.warn('logout: wallet disconnect failed', e);
          }
          try {
            const { resetInitFula } = await import('@/utils/helper');
            resetInitFula();
            await fula.shutdown().catch(() => undefined);
          } catch {
            /* ignore */
          }
          get().reset();
          useBloxsStore.getState().reset();
          try {
            const [{ usePoolsStore }, { usePluginsStore }, { useDAppsStore }] = await Promise.all([
              import('./usePoolsStore'),
              import('./usePluginsStore'),
              import('./dAppsSettingsStore'),
            ]);
            usePoolsStore.getState().reset();
            usePluginsStore.getState().reset();
            useDAppsStore.getState().reset();
          } catch (e) {
            console.warn('logout: store reset failed', e);
          }
          return true;
        },
        getBloxSpace: async () => {
          const { fulaIsReady } = get();
          if (!fulaIsReady) {
            console.log('Fula is not ready. Please wait...');
          }
          await fula.isReady(false);
          const bloxSpace = await blockchain.bloxFreeSpace();
          console.log('bloxSpace', bloxSpace);
          set({ bloxSpace: { ...bloxSpace } as TBloxFreeSpace });
          return bloxSpace as TBloxFreeSpace;
        },
        setFulaIsReady: (value: boolean, peerId?: string) => {
          if (!value) {
            // A switch/re-init is starting (or failed): clear readiness for any blox.
            set({ fulaIsReady: false, fulaReadyForPeerId: undefined });
            return;
          }
          // Mark ready FOR a specific blox; drop stale late readiness (audit M4/S2).
          const target = peerId ?? useBloxsStore.getState().currentBloxPeerId;
          if (target && target !== useBloxsStore.getState().currentBloxPeerId) {
            return;
          }
          set({ fulaIsReady: true, fulaReadyForPeerId: target });
        },
        checkBloxConnection: async (maxTries = 3, waitBetweenRetries = 15): Promise<boolean> => {
          // Increment generation to cancel any in-flight connection checks
          const myGeneration = ++connectionCheckGeneration;

          const delay = (seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

          const isCancelled = () => {
            if (connectionCheckGeneration !== myGeneration) {
              console.log('checkBloxConnection cancelled (generation changed)');
              return true;
            }
            return false;
          };

          const handleMaxRetriesReached = () => {
            const lastReinitTime = get().lastFulaReinitTime || 0;
            const now = Date.now();

            // Don't reinit more than once per 2 minutes
            if (now - lastReinitTime < 120000) {
              console.log('Skipping reinit - cooldown active (2 min cooldown)');
              set({ bloxConnectionStatus: 'DISCONNECTED' });
              return;
            }

            set({ lastFulaReinitTime: now });

            const currentLocalIp = get().useLocalIp;
            if (currentLocalIp && currentLocalIp !== 'scan' && currentLocalIp !== 'delete') {
              set({ useLocalIp: 'delete' });
            } else if (!currentLocalIp || currentLocalIp === '') {
              set({ useLocalIp: 'scan' });
            } else {
              set((state) => ({ fulaReinitCount: state.fulaReinitCount + 1 }));
            }
            console.error('Max retries reached without success.');
          };

          const attemptConnection = async (attempt: number): Promise<boolean> => {
            if (isCancelled()) return false;

            console.log('checkBloxConnection attempt ' + attempt);

            try {
              set({ bloxConnectionStatus: 'CHECKING' });

              // Check network connectivity
              if (!(await isOnline())) {
                console.error('Network check failed: Internet is not connected.');
                set({ bloxConnectionStatus: 'NO INTERNET' });
                return false;
              }

              if (isCancelled()) return false;

              // Check Fula readiness
              const { fulaIsReady } = get();
              if (!fulaIsReady) {
                console.warn('Fula is not ready.');
                set({ bloxConnectionStatus: 'NO CLIENT' });
                return false;
              }

              // Check Blox connection
              const connected = await fula.checkConnection();
              console.log(`checkBloxConnection attempt ${attempt}, connected: ${connected}`);

              if (isCancelled()) return false;

              if (connected) {
                set({ bloxConnectionStatus: 'CONNECTED' });
                return true;
              }

              if (attempt < maxTries) {
                console.log(`Attempt ${attempt} failed, retrying after ${waitBetweenRetries} seconds...`);
                await delay(waitBetweenRetries);
                if (isCancelled()) return false;
                return attemptConnection(attempt + 1);
              } else {
                handleMaxRetriesReached();
                set({ bloxConnectionStatus: 'DISCONNECTED' });
                return false;
              }
            } catch (error) {
              console.error(`Error during connection attempt ${attempt}:`, messageOf(error));
              set({ bloxConnectionStatus: 'DISCONNECTED' });
              return false;
            }
          };

          try {
            return await attemptConnection(1);
          } catch (error) {
            console.error('checkBloxConnection failed:', messageOf(error));
            set({ bloxConnectionStatus: 'DISCONNECTED' });
            return false;
          }
        },

        reset: () => {
          set(initialState);
        },
      };
    },
    {
      name: PERSIST_KEYS.userProfile,
      version: 1,
      storage: zustandIdbStorage<Partial<UserProfileStore>>(),
      onRehydrateStorage: rehydrateHandler<UserProfileStore>(PERSIST_KEYS.userProfile, () => useUserProfileStore.setState({ _hasHydrated: true })),
      partialize: (state): Partial<UserProfileStore> => ({
        walletId: state.walletId,
        bloxPeerIds: state.bloxPeerIds,
        appPeerId: state.appPeerId,
        accounts: state.accounts,
        activeAccount: state.activeAccount,
        fulaReinitCount: state.fulaReinitCount,
        manualSignatureWalletAddress: state.manualSignatureWalletAddress,
      }),
      migrate: async (persistedState, version) => {
        // This store and useBloxsStore import each other, and hydration can start before the cycle has finished
        // evaluating (observed under Vitest's module runner, which hands back the partial module for a cyclic
        // import()). Native ESM awaits the cycle; the one-macrotask retry only ever runs in that runner.
        let bloxsModule = await import('./useBloxsStore');
        if (!bloxsModule.useBloxsStore) {
          await new Promise((r) => setTimeout(r, 0));
          bloxsModule = await import('./useBloxsStore');
        }
        const { setState } = bloxsModule.useBloxsStore;
        try {
          if (version === 0) {
            if (persistedState) {
              const userPrfoile = persistedState as UserProfileSlice;
              const bloxs =
                userPrfoile?.bloxPeerIds?.reduce(
                  (obj, peerId, index) => {
                    obj[peerId] = { peerId, name: `Blox Unit #${index}` };
                    return obj;
                  },
                  {} as Record<string, { peerId: string; name: string }>,
                ) || {};
              setState({ bloxs });
            }
          }
        } catch (error) {
          console.log(error);
        }
        return persistedState as Partial<UserProfileStore>;
      },
    },
  ),
);

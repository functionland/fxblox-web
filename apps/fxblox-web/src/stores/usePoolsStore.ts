// Ported from apps/box/src/stores/usePoolsStore.ts — imports + storage only.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { blockchain, fula } from '@/lib/fula';
import type { TPool } from '@/models';
import { useUserProfileStore } from './useUserProfileStore';
import { useSettingsStore } from './useSettingsStore';
import { useBloxsStore } from './useBloxsStore';
import { PERSIST_KEYS, rehydrateHandler, zustandIdbStorage } from './persist/idbStorage';

export interface PoolJoinResponse {
  account: string;
  poolID: number;
}

export interface PoolLeaveResponse {
  account: string;
  poolID: number;
}

interface PoolsActionSlice {
  setHasHydrated: (isHydrated: boolean) => void;
  getPools: () => Promise<void>;
  joinPool: (poolID: number) => Promise<PoolJoinResponse>;
  forceRejoinPool: (poolID: number) => Promise<PoolJoinResponse>;
  leavePool: (poolID: number) => Promise<PoolLeaveResponse>;
  cancelPoolJoin: (poolID: number) => Promise<void>;
  reset: () => void;
  setDirty: () => void;
}

interface PoolsModel {
  _hasHydrated: boolean;
  pools: PoolData[];
  dirty: boolean;
  enableInteraction: boolean;
}

export interface PoolData extends TPool {
  requested: boolean;
  joined: boolean;
  numVotes: number;
  numVoters: number;
  replicationFactor?: number;
}

export interface PoolsModelSlice extends PoolsModel, PoolsActionSlice {}

const initialState: PoolsModel = {
  _hasHydrated: false,
  pools: [],
  dirty: false,
  enableInteraction: true,
};

const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

export const usePoolsStore = create<PoolsModelSlice>()(
  persist(
    (set) => ({
      ...initialState,
      setHasHydrated: (isHydrated) => {
        set({ _hasHydrated: isHydrated });
      },
      getPools: async () => {
        try {
          const selectedChain = useSettingsStore.getState().selectedChain;
          const { getContractService } = await import('@/contracts/contractService');
          const contractService = getContractService(selectedChain);
          const accountId = useUserProfileStore.getState().address;

          set({ enableInteraction: !!accountId });

          const poolIds = await contractService.getAllPoolIds();
          const pools: PoolData[] = [];

          for (const poolId of poolIds) {
            const pool = await contractService.getPool(poolId);
            const participants: string[] = await contractService.getPoolMembers(poolId);

            let joined = false;
            let requested = false;
            let numVotes = 0;
            const numVoters = participants.length;

            const clusterPeerId = useBloxsStore.getState().getCurrentClusterPeerId();
            if (clusterPeerId) {
              try {
                const peerMembership = await contractService.isPeerIdMemberOfPool(poolId, clusterPeerId);
                joined = peerMembership.isMember;
              } catch {
                joined = false;
              }
            }

            if (!joined && accountId) {
              try {
                const joinRequest = await contractService.getJoinRequest(poolId, accountId);
                if (joinRequest && joinRequest.status === 1) {
                  requested = true;
                  numVotes = (joinRequest.approvals || 0) + (joinRequest.rejections || 0);
                }
              } catch {
                // No join request
              }
            }

            pools.push({
              poolID: pool.id,
              owner: pool.creator ?? '',
              name: pool.name,
              region: pool.region,
              parent: '',
              participants,
              replicationFactor: 1,
              requested,
              joined,
              numVotes,
              numVoters,
            });
          }

          set({ pools, dirty: false });
        } catch (error) {
          console.error('Error getting pools:', error);
          set({ pools: [] as PoolData[], dirty: false });
          throw error;
        }
      },
      joinPool: async (poolID: number) => {
        let blockchainResponse: PoolJoinResponse | null = null;
        let blockchainError: Error | null = null;

        try {
          await fula.isReady(false);
          const selectedChain = useSettingsStore.getState().selectedChain;

          try {
            blockchainResponse = await blockchain.joinPoolWithChain(poolID, selectedChain);
            console.log('joinPoolWithChain response:', blockchainResponse);
          } catch (error) {
            blockchainError = toError(error);
            console.log('joinPoolWithChain error:', blockchainError);
          }

          set({ dirty: true });

          if (blockchainResponse) {
            return blockchainResponse;
          }
          if (blockchainError) {
            throw blockchainError;
          }
          throw new Error('Unknown error in joinPool');
        } catch (error) {
          console.log('joinPool: ', error);
          throw error;
        }
      },
      forceRejoinPool: async (poolID: number) => {
        try {
          await fula.isReady(false);
          const selectedChain = useSettingsStore.getState().selectedChain;
          const response = await blockchain.joinPoolWithChain(poolID, selectedChain);
          set({ dirty: true });
          return response;
        } catch (error) {
          console.log('forceRejoinPool error:', error);
          throw error;
        }
      },
      cancelPoolJoin: async (poolID: number) => {
        try {
          const selectedChain = useSettingsStore.getState().selectedChain;
          const { getContractService } = await import('@/contracts/contractService');
          const contractService = getContractService(selectedChain);
          const clusterPeerId = useBloxsStore.getState().getCurrentClusterPeerId();

          if (!clusterPeerId) {
            throw new Error('Cluster peer ID is not available — ensure blox is connected');
          }

          await contractService.cancelJoinRequest(poolID.toString(), clusterPeerId);
          set({ dirty: true });
        } catch (error) {
          console.log('cancelPoolJoin error:', error);
          throw error;
        }
      },
      leavePool: async (poolID: number) => {
        let blockchainResponse: PoolLeaveResponse | null = null;
        let blockchainError: Error | null = null;

        try {
          await fula.isReady(false);
          const selectedChain = useSettingsStore.getState().selectedChain;

          try {
            blockchainResponse = await blockchain.leavePoolWithChain(poolID, selectedChain);
          } catch (error) {
            blockchainError = toError(error);
            console.log('leavePoolWithChain error:', blockchainError);
          }

          try {
            const { getContractService } = await import('@/contracts/contractService');
            const contractService = getContractService(selectedChain);
            const clusterPeerId = useBloxsStore.getState().getCurrentClusterPeerId();
            if (!clusterPeerId) {
              throw new Error('Cluster peer ID is not available — ensure blox is connected');
            }
            await contractService.leavePool(poolID.toString(), clusterPeerId);
          } catch (contractError) {
            console.log('contractService.leavePool error:', contractError);
          }

          set({ dirty: true });

          if (blockchainResponse) {
            return blockchainResponse;
          }
          if (blockchainError) {
            throw blockchainError;
          }
          throw new Error('Unknown error in leavePool');
        } catch (error) {
          console.log('leavePool error:', error);
          throw error;
        }
      },
      setDirty: () => {
        set({ dirty: true });
      },
      reset: () => {
        set(initialState);
      },
    }),
    {
      name: PERSIST_KEYS.pools,
      storage: zustandIdbStorage<Partial<PoolsModelSlice>>(),
      onRehydrateStorage: rehydrateHandler<PoolsModelSlice>(PERSIST_KEYS.pools, () => usePoolsStore.setState({ _hasHydrated: true })),
      partialize: (state): Partial<PoolsModelSlice> => ({
        pools: state.pools,
      }),
    },
  ),
);

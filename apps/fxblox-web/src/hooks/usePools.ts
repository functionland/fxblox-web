/* eslint-disable @typescript-eslint/no-explicit-any */
// Ported from apps/box/src/hooks/usePools.ts. `leavePoolViaAPI` / `cancelJoinRequestViaAPI` are REMOVED —
// pools.fx.land has no `/leave` or `/cancel`; callers use the contract calls below (gas on Base; SKALE is
// zero-gas — the confirm dialog shows the chain + an estimated fee).
import { useState, useEffect, useCallback } from 'react';
import { usePoolOperations } from './useContractIntegration';
import { useWalletNetwork } from './useWalletNetwork';
import type { PoolInfo, UserPoolInfo, JoinRequest } from '@/contracts/types';
import { PoolApiService, type JoinPoolRequest } from '@/services/poolApiService';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useBloxsStore } from '@/stores/useBloxsStore';

export interface PoolData extends PoolInfo {
  requested: boolean;
  joined: boolean;
  numVotes: number;
  numVoters: number;
  hasActiveJoinRequest?: boolean;
  userIsMember?: boolean;
  /** Legacy alias of poolId kept for the ported PoolCard. */
  poolID?: string;
}

export interface PoolsState {
  pools: PoolData[];
  userPool: UserPoolInfo | null;
  loading: boolean;
  error: string | null;
  enableInteraction: boolean;
  userIsMemberOfAnyPool: boolean;
  userMemberPools: string[];
  userActiveRequests: string[];
}

export const usePools = () => {
  const poolOperations = usePoolOperations();
  const { contractService, connectedAccount, isReady } = poolOperations;
  const { isOnCorrectNetwork } = useWalletNetwork();
  const selectedChain = useSettingsStore((state) => state.selectedChain);
  const currentBloxPeerId = useBloxsStore((state) => state.currentBloxPeerId);
  const bloxs = useBloxsStore((state) => state.bloxs);
  const storedClusterPeerId = currentBloxPeerId ? bloxs[currentBloxPeerId]?.clusterPeerId : undefined;
  const currentClusterPeerId = storedClusterPeerId && storedClusterPeerId !== currentBloxPeerId ? storedClusterPeerId : undefined;

  const [state, setState] = useState<PoolsState>({
    pools: [],
    userPool: null,
    loading: false,
    error: null,
    enableInteraction: false,
    userIsMemberOfAnyPool: false,
    userMemberPools: [],
    userActiveRequests: [],
  });

  const checkUserMembership = useCallback(async () => {
    if (!isReady || !contractService || !connectedAccount) {
      return { isMemberOfAnyPool: false, memberPools: [] as string[], activeRequests: [] as string[] };
    }
    try {
      const { poolId, requestPoolId } = await contractService.getUserPool(connectedAccount, currentClusterPeerId);
      return {
        isMemberOfAnyPool: poolId !== '0' && poolId !== '',
        memberPools: poolId !== '0' && poolId !== '' ? [poolId] : [],
        activeRequests: requestPoolId !== '0' && requestPoolId !== '' ? [requestPoolId] : [],
      };
    } catch (error) {
      console.error('Error checking user membership:', error);
      return { isMemberOfAnyPool: false, memberPools: [] as string[], activeRequests: [] as string[] };
    }
  }, [isReady, contractService, connectedAccount, currentClusterPeerId]);

  const loadPools = useCallback(async () => {
    if (!isReady || !contractService || !connectedAccount || !isOnCorrectNetwork) {
      setState((prev) => ({ ...prev, enableInteraction: false, loading: false }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const poolList = await contractService.listPools(0, 25);

      let membershipInfo;
      try {
        membershipInfo = await checkUserMembership();
      } catch (error) {
        console.error('Error in membership check:', error);
        membershipInfo = { isMemberOfAnyPool: false, memberPools: [], activeRequests: [] };
      }

      let requested = false;
      let joined = false;
      let numVotes = 0;
      let poolIdOfInterest = '';
      let userPool: UserPoolInfo | null = null;

      try {
        userPool = await contractService.getUserPool(connectedAccount, currentClusterPeerId);
        if (userPool && userPool.poolId !== '0') {
          requested = true;
          joined = true;
          poolIdOfInterest = userPool.poolId;
        } else if (userPool && userPool.requestPoolId !== '0') {
          poolIdOfInterest = userPool.requestPoolId;
          const joinRequestInfo: JoinRequest = await contractService.getJoinRequest(userPool.requestPoolId, connectedAccount);
          numVotes = Number(joinRequestInfo.positive_votes) + Number(joinRequestInfo.negative_votes);
          requested = true;
          joined = false;
        }

        setState((prev) => ({
          ...prev,
          enableInteraction: true,
          userIsMemberOfAnyPool: membershipInfo.isMemberOfAnyPool,
          userMemberPools: membershipInfo.memberPools,
          userActiveRequests: membershipInfo.activeRequests,
        }));
      } catch (error) {
        console.log('Error getting user pool info:', error);
        setState((prev) => ({ ...prev, enableInteraction: false }));
      }

      const transformedPools = poolList.map((pool) => {
        const isUserPool = pool.poolId === poolIdOfInterest;
        const joinInfo = {
          requested: isUserPool ? requested : false,
          joined: isUserPool ? joined : false,
          numVotes: isUserPool ? numVotes : 0,
          numVoters: pool.participants?.length || 0,
        };
        return {
          poolId: pool.poolId,
          poolID: pool.poolId,
          name: pool.name,
          region: pool.region,
          parent: pool.parent,
          participants: pool.participants,
          replicationFactor: pool.replicationFactor,
          ...joinInfo,
        } as PoolData;
      });

      setState((prev) => ({ ...prev, pools: transformedPools, userPool, loading: false, error: null }));
    } catch (error: any) {
      console.error('Error loading pools:', error);
      setState((prev) => ({
        ...prev,
        pools: [],
        userPool: null,
        error: error.message || 'Failed to load pools',
        loading: false,
        enableInteraction: false,
      }));
    }
  }, [isReady, contractService, connectedAccount, isOnCorrectNetwork, currentClusterPeerId, checkUserMembership]);

  // API-based join pool function (pools.fx.land /join)
  const joinPoolViaAPI = useCallback(
    async (poolId: string, _poolName: string): Promise<{ success: boolean; message: string; transactionHash?: string }> => {
      if (!connectedAccount || !currentClusterPeerId) {
        return { success: false, message: 'Wallet not connected or Blox peer ID not available' };
      }
      try {
        const request: JoinPoolRequest = {
          peerId: currentClusterPeerId,
          kuboPeerId: currentBloxPeerId,
          account: connectedAccount,
          chain: selectedChain,
          poolId: parseInt(poolId, 10),
        };
        const response = await PoolApiService.joinPool(request);
        if (response.status === 'ok') {
          await loadPools();
          return { success: true, message: response.msg, transactionHash: response.transactionHash };
        }
        return { success: false, message: response.msg };
      } catch (error) {
        console.error('Error joining pool via API:', error);
        return { success: false, message: error instanceof Error ? error.message : 'Unknown error occurred' };
      }
    },
    [connectedAccount, currentBloxPeerId, currentClusterPeerId, selectedChain, loadPools],
  );

  const joinPool = useCallback(
    async (poolId: string) => {
      if (!currentClusterPeerId) {
        throw new Error('Current Blox peer ID is not available');
      }
      const result = await poolOperations.joinPool(poolId, currentClusterPeerId);
      if (result !== null) {
        await loadPools();
      }
      return result;
    },
    [poolOperations, loadPools, currentClusterPeerId],
  );

  const leavePool = useCallback(
    async (poolId: string) => {
      if (!currentClusterPeerId) {
        throw new Error('Current Blox peer ID is not available');
      }
      const result = await poolOperations.leavePool(poolId, currentClusterPeerId);
      if (result !== null) {
        setTimeout(() => {
          void loadPools();
        }, 1000);
      }
      return result;
    },
    [poolOperations, loadPools, currentClusterPeerId],
  );

  const cancelJoinRequest = useCallback(
    async (poolId: string) => {
      if (!currentClusterPeerId) {
        throw new Error('Current Blox peer ID is not available');
      }
      const result = await poolOperations.cancelJoinRequest(poolId, currentClusterPeerId);
      if (result !== null) {
        await loadPools();
      }
      return result;
    },
    [poolOperations, loadPools, currentClusterPeerId],
  );

  const voteJoinRequest = useCallback(
    async (poolId: string, peerId: string, vote: boolean) => {
      if (!currentClusterPeerId) {
        throw new Error('Current Blox peer ID is not available');
      }
      const result = await poolOperations.voteJoinRequest(poolId, peerId, currentClusterPeerId, vote);
      if (result !== null) {
        await loadPools();
      }
      return result;
    },
    [poolOperations, loadPools, currentClusterPeerId],
  );

  useEffect(() => {
    if (isReady && isOnCorrectNetwork) {
      void loadPools();
    }
  }, [isReady, isOnCorrectNetwork, loadPools]);

  useEffect(() => {
    if (connectedAccount && isReady && isOnCorrectNetwork) {
      void loadPools();
    }
  }, [connectedAccount, isReady, isOnCorrectNetwork, loadPools]);

  return {
    ...state,
    ...poolOperations,
    loadPools,
    checkUserMembership,
    joinPool,
    leavePool,
    cancelJoinRequest,
    voteJoinRequest,
    joinPoolViaAPI,
    userPoolId: state.userPool?.poolId || null,
    userRequestPoolId: state.userPool?.requestPoolId || null,
    isInPool: state.userPool?.poolId !== '0',
    hasPendingRequest: state.userPool?.requestPoolId !== '0',
  };
};

export const usePool = (poolId: string) => {
  const { contractService, isReady } = usePoolOperations();
  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPool = useCallback(async () => {
    if (!isReady || !contractService || !poolId) return;
    setLoading(true);
    setError(null);
    try {
      const poolData = await contractService.getPool(poolId);
      setPool(poolData);
    } catch (error: any) {
      console.error('Error loading pool:', error);
      setError(error.message || 'Failed to load pool');
      setPool(null);
    } finally {
      setLoading(false);
    }
  }, [isReady, contractService, poolId]);

  useEffect(() => {
    void loadPool();
  }, [loadPool]);

  return { pool, loading, error, loadPool };
};

export const useJoinRequest = (poolId: string, account: string) => {
  const { contractService, isReady } = usePoolOperations();
  const [joinRequest, setJoinRequest] = useState<JoinRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadJoinRequest = useCallback(async () => {
    if (!isReady || !contractService || !poolId || !account) return;
    setLoading(true);
    setError(null);
    try {
      const requestData = await contractService.getJoinRequest(poolId, account);
      setJoinRequest(requestData);
    } catch (error: any) {
      console.error('Error loading join request:', error);
      setError(error.message || 'Failed to load join request');
      setJoinRequest(null);
    } finally {
      setLoading(false);
    }
  }, [isReady, contractService, poolId, account]);

  useEffect(() => {
    void loadJoinRequest();
  }, [loadJoinRequest]);

  return { joinRequest, loading, error, loadJoinRequest };
};

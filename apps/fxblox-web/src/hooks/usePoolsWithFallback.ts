/* eslint-disable @typescript-eslint/no-explicit-any */
// Ported from apps/box/src/hooks/usePoolsWithFallback.ts. `leavePoolViaAPI` / `cancelJoinRequestViaAPI` REMOVED
// (no such routes on pools.fx.land); leave/cancel go through the contract (`usePools`).
import { useState, useEffect, useCallback } from 'react';
import { usePoolOperations } from './useContractIntegration';
import type { PoolInfo, UserPoolInfo } from '@/contracts/types';
import { PoolApiService, type JoinPoolRequest } from '@/services/poolApiService';
import { getPoolReadService } from '@/services/poolReadService';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useBloxsStore } from '@/stores/useBloxsStore';
import { useUserProfileStore } from '@/stores/useUserProfileStore';
import { useWallet } from '@/wallet/useWallet';
import type { PoolData, PoolsState } from './usePools';

export type { PoolData, PoolsState };

export const usePoolsWithFallback = () => {
  const poolOperations = usePoolOperations();
  const selectedChain = useSettingsStore((state) => state.selectedChain);
  const currentBloxPeerId = useBloxsStore((state) => state.currentBloxPeerId);
  const bloxs = useBloxsStore((state) => state.bloxs);
  const storedClusterPeerId = currentBloxPeerId ? bloxs[currentBloxPeerId]?.clusterPeerId : undefined;
  const currentClusterPeerId = storedClusterPeerId && storedClusterPeerId !== currentBloxPeerId ? storedClusterPeerId : undefined;
  const manualSignatureWalletAddress = useUserProfileStore((state) => state.manualSignatureWalletAddress);
  const { account: walletAccount } = useWallet();

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

  // Always use the RPC read service for reads — works with a connected wallet AND a manual signature.
  const effectiveAccount = walletAccount || manualSignatureWalletAddress;

  const checkUserMembership = useCallback(async () => {
    if (!effectiveAccount) {
      return { isMemberOfAnyPool: false, memberPools: [] as string[], activeRequests: [] as string[] };
    }
    try {
      const poolReadService = getPoolReadService(selectedChain);
      const userPoolInfo = await poolReadService.getUserPoolInfo(effectiveAccount, currentClusterPeerId);
      return {
        isMemberOfAnyPool: userPoolInfo.poolId !== '0' && userPoolInfo.poolId !== '',
        memberPools: userPoolInfo.poolId !== '0' && userPoolInfo.poolId !== '' ? [userPoolInfo.poolId] : [],
        activeRequests: userPoolInfo.requestPoolId !== '0' && userPoolInfo.requestPoolId !== '' ? [userPoolInfo.requestPoolId] : [],
      };
    } catch (error) {
      console.error('Error checking user membership:', error);
      return { isMemberOfAnyPool: false, memberPools: [] as string[], activeRequests: [] as string[] };
    }
  }, [effectiveAccount, selectedChain, currentClusterPeerId]);

  const loadPools = useCallback(async () => {
    if (!effectiveAccount) {
      setState((prev) => ({ ...prev, enableInteraction: false, loading: false }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const poolReadService = getPoolReadService(selectedChain);
      const poolList: PoolInfo[] = await poolReadService.listPools(0, 25);

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
        userPool = await poolReadService.getUserPoolInfo(effectiveAccount, currentClusterPeerId);
        if (userPool && userPool.poolId !== '0') {
          requested = true;
          joined = true;
          poolIdOfInterest = userPool.poolId;
        } else if (userPool && userPool.requestPoolId !== '0') {
          poolIdOfInterest = userPool.requestPoolId;
          try {
            const joinRequestInfo = await poolReadService.getJoinRequest(userPool.requestPoolId, effectiveAccount);
            numVotes = Number(joinRequestInfo.positive_votes) + Number(joinRequestInfo.negative_votes);
            requested = true;
            joined = false;
          } catch (error) {
            console.error('Error getting join request:', error);
          }
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
  }, [effectiveAccount, selectedChain, currentClusterPeerId, checkUserMembership]);

  const joinPoolViaAPI = useCallback(
    async (poolId: string, _poolName: string): Promise<{ success: boolean; message: string; transactionHash?: string }> => {
      if (!effectiveAccount || !currentClusterPeerId) {
        return { success: false, message: 'Wallet not connected or Blox peer ID not available' };
      }
      try {
        const request: JoinPoolRequest = {
          peerId: currentClusterPeerId,
          kuboPeerId: currentBloxPeerId,
          account: effectiveAccount,
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
    [effectiveAccount, currentBloxPeerId, currentClusterPeerId, selectedChain, loadPools],
  );

  useEffect(() => {
    if (effectiveAccount) {
      void loadPools();
    }
  }, [effectiveAccount, loadPools]);

  return {
    ...state,
    ...poolOperations,
    connectedAccount: effectiveAccount || poolOperations.connectedAccount,
    loadPools,
    checkUserMembership,
    joinPoolViaAPI,
    userPoolId: state.userPool?.poolId || null,
    userRequestPoolId: state.userPool?.requestPoolId || null,
    isInPool: state.userPool?.poolId !== '0',
    hasPendingRequest: state.userPool?.requestPoolId !== '0',
  };
};

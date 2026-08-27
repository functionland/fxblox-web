/* eslint-disable @typescript-eslint/no-explicit-any */
// Ported VERBATIM (import paths) from apps/box/src/hooks/useClaimableTokens.ts
import { useState, useEffect, useCallback } from 'react';
import { useContractIntegration } from './useContractIntegration';
import { useBloxsStore } from '@/stores/useBloxsStore';
import { usePools } from './usePools';
import { useUserProfileStore } from '@/stores/useUserProfileStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { ethers } from 'ethers';
import { getChainConfigByName } from '@/contracts/config';
import { REWARD_ENGINE_ABI } from '@/contracts/abis';
import { peerIdToBytes32 } from '@/utils/peerIdConversion';

export interface ClaimableRewardsState {
  unclaimedMining: string;
  unclaimedStorage: string;
  totalUnclaimed: string;
  lastClaimedTimestamp: number;
  timeSinceLastClaim: number;
  loading: boolean;
  error: string | null;
  canClaim: boolean;
}

export const useClaimableTokens = () => {
  const { contractService, isReady, connectedAccount } = useContractIntegration();
  const currentBloxPeerId = useBloxsStore((state) => state.currentBloxPeerId);
  const bloxs = useBloxsStore((state) => state.bloxs);
  // Use ipfs-cluster peerID for all reward operations — never fall back to the kubo peerId.
  const storedClusterPeerId = currentBloxPeerId ? bloxs[currentBloxPeerId]?.clusterPeerId : undefined;
  const currentClusterPeerId = storedClusterPeerId && storedClusterPeerId !== currentBloxPeerId ? storedClusterPeerId : undefined;
  const { userPoolId } = usePools();
  const manualSignatureWalletAddress = useUserProfileStore((state) => state.manualSignatureWalletAddress);
  const selectedChain = useSettingsStore((state) => state.selectedChain);

  const [state, setState] = useState<ClaimableRewardsState>({
    unclaimedMining: '0',
    unclaimedStorage: '0',
    totalUnclaimed: '0',
    lastClaimedTimestamp: 0,
    timeSinceLastClaim: 0,
    loading: false,
    error: null,
    canClaim: false,
  });

  const effectiveAccount = isReady ? connectedAccount : connectedAccount || manualSignatureWalletAddress;
  const useReadOnlyService = !isReady && !!manualSignatureWalletAddress;

  const fetchClaimableTokens = useCallback(async () => {
    if (!currentClusterPeerId || !effectiveAccount || !userPoolId) {
      setState((prev) => ({
        ...prev,
        unclaimedMining: '0',
        unclaimedStorage: '0',
        totalUnclaimed: '0',
        lastClaimedTimestamp: 0,
        timeSinceLastClaim: 0,
        canClaim: false,
        loading: false,
        error: null,
      }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      let unclaimedRewards: any;
      let claimedInfo: any;

      if (contractService && isReady) {
        unclaimedRewards = await contractService.getUnclaimedRewards(effectiveAccount, currentClusterPeerId, userPoolId);
        claimedInfo = await contractService.getClaimedRewardsInfo(effectiveAccount, currentClusterPeerId, userPoolId);
      } else if (useReadOnlyService) {
        const chainConfig = getChainConfigByName(selectedChain);
        const readOnlyProvider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);
        const rewardContract = new ethers.Contract(chainConfig.contracts.rewardEngine, REWARD_ENGINE_ABI, readOnlyProvider);

        const peerIdBytes32 = await peerIdToBytes32(currentClusterPeerId);

        const [unclaimedMining, unclaimedStorage] = await rewardContract.getUnclaimedRewards(effectiveAccount, peerIdBytes32, userPoolId);

        unclaimedRewards = {
          unclaimedMining: ethers.utils.formatEther(unclaimedMining),
          unclaimedStorage: ethers.utils.formatEther(unclaimedStorage),
          totalUnclaimed: ethers.utils.formatEther(unclaimedMining.add(unclaimedStorage)),
        };

        const [lastClaimedTimestamp] = await rewardContract.getClaimedRewardsInfo(effectiveAccount, peerIdBytes32, userPoolId);
        const now = Math.floor(Date.now() / 1000);
        const timeSinceLastClaim = Math.max(0, now - lastClaimedTimestamp.toNumber());
        claimedInfo = { lastClaimedTimestamp: lastClaimedTimestamp.toNumber(), timeSinceLastClaim };
      } else {
        throw new Error('No service available for fetching rewards');
      }

      const canClaim = parseFloat(unclaimedRewards.totalUnclaimed) > 0;

      setState({
        unclaimedMining: unclaimedRewards.unclaimedMining,
        unclaimedStorage: unclaimedRewards.unclaimedStorage,
        totalUnclaimed: unclaimedRewards.totalUnclaimed,
        lastClaimedTimestamp: claimedInfo.lastClaimedTimestamp,
        timeSinceLastClaim: claimedInfo.timeSinceLastClaim,
        loading: false,
        error: null,
        canClaim,
      });
    } catch (error: any) {
      console.error('Error fetching claimable rewards:', error);

      let errorMessage = 'Failed to fetch claimable rewards';
      let shouldShowError = true;

      if (error.message?.includes('NotPoolMember') || error.errorName === 'NotPoolMember') {
        shouldShowError = false;
      } else if (error.message?.includes('underlying network changed')) {
        errorMessage = 'Network changed during operation. Please refresh and try again.';
      } else if (error.message?.includes('timeout')) {
        errorMessage = 'Request timed out. Please try again.';
      } else if (error.message?.includes('connection') || error.message?.includes('fetch')) {
        errorMessage = 'Connection failed. Please check your network and try again.';
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      setState({
        unclaimedMining: '0',
        unclaimedStorage: '0',
        totalUnclaimed: '0',
        lastClaimedTimestamp: 0,
        timeSinceLastClaim: 0,
        loading: false,
        error: shouldShowError ? errorMessage : null,
        canClaim: false,
      });
    }
  }, [contractService, isReady, currentClusterPeerId, effectiveAccount, userPoolId, useReadOnlyService, selectedChain]);

  const claimTokens = useCallback(async () => {
    if (!contractService || !isReady || !currentClusterPeerId || !userPoolId || !state.canClaim) {
      throw new Error('Cannot claim rewards: contract not ready or no claimable amount');
    }
    try {
      await contractService.claimRewardsForPeer(currentClusterPeerId, userPoolId);
      await fetchClaimableTokens();
      return true;
    } catch (error) {
      console.error('Error claiming rewards:', error);
      throw error;
    }
  }, [contractService, isReady, currentClusterPeerId, userPoolId, state.canClaim, fetchClaimableTokens]);

  useEffect(() => {
    void fetchClaimableTokens();
  }, [fetchClaimableTokens]);

  return {
    ...state,
    fetchClaimableTokens,
    claimTokens,
    formattedTotalUnclaimed: parseFloat(state.totalUnclaimed).toFixed(4),
    formattedUnclaimedMining: parseFloat(state.unclaimedMining).toFixed(4),
    formattedUnclaimedStorage: parseFloat(state.unclaimedStorage).toFixed(4),
    formattedTimeSinceLastClaim: state.timeSinceLastClaim > 0 ? `${Math.floor(state.timeSinceLastClaim / 86400)} days ago` : 'Never claimed',
  };
};

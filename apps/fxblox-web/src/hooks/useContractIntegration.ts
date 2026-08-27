/* eslint-disable @typescript-eslint/no-explicit-any */
// Ported from apps/box/src/hooks/useContractIntegration.ts — `useToast` → platform/notify, AppKit hook names.
import { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '@/wallet/useWallet';
import { useToast } from '@/platform/notify';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUserProfileStore } from '@/stores/useUserProfileStore';
import { useWalletNetwork } from './useWalletNetwork';
import { getContractService, type ContractService, resetContractService } from '@/contracts/contractService';
import type { SupportedChain } from '@/contracts/types';
import { CHAIN_DISPLAY_NAMES } from '@/contracts/config';

// Global flag to track if the "Contracts Connected" notification has been shown
let contractsConnectedNotificationShown = false;

export const resetContractsConnectedNotification = () => {
  contractsConnectedNotificationShown = false;
};

export interface ContractIntegrationState {
  isInitialized: boolean;
  isInitializing: boolean;
  error: string | null;
  contractService: ContractService | null;
  connectedAccount: string | null;
  retryCount: number;
  canRetry: boolean;
}

export const useContractIntegration = (options?: { showConnectedNotification?: boolean }) => {
  const { provider, account } = useWallet();
  const { queueToast } = useToast();
  const { isOnCorrectNetwork } = useWalletNetwork();
  const selectedChain = useSettingsStore((state) => state.selectedChain);
  const manualSignatureWalletAddress = useUserProfileStore((state) => state.manualSignatureWalletAddress);
  const initializedChainRef = useRef<SupportedChain | null>(null);
  const showConnectedNotification = options?.showConnectedNotification ?? false;

  // Use wallet account if available, otherwise fallback to manually signed wallet address
  const effectiveAccount = account || manualSignatureWalletAddress;

  const [state, setState] = useState<ContractIntegrationState>({
    isInitialized: false,
    isInitializing: false,
    error: null,
    contractService: null,
    connectedAccount: null,
    retryCount: 0,
    canRetry: true,
  });

  const initializationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initializeContracts = useCallback(
    async (chain: SupportedChain) => {
      if (!provider || !effectiveAccount) {
        setState((prev) => ({ ...prev, isInitialized: false, error: 'Wallet not connected', contractService: null, connectedAccount: null }));
        return;
      }

      if (state.isInitializing) {
        return;
      }

      if (state.isInitialized && initializedChainRef.current === chain) {
        return;
      }

      setState((prev) => ({ ...prev, isInitializing: true, error: null }));

      try {
        resetContractService();
        const service = getContractService(chain);
        await service.initialize(provider);
        const connectedAccount = await service.getConnectedAccount();

        setState({
          isInitialized: true,
          isInitializing: false,
          error: null,
          contractService: service,
          connectedAccount,
          retryCount: 0,
          canRetry: true,
        });

        initializedChainRef.current = service.chain;

        if (service.chain !== chain) {
          console.warn(`Chain mismatch after initialization: requested ${chain}, got ${service.chain}`);
        }

        if (showConnectedNotification && !contractsConnectedNotificationShown) {
          contractsConnectedNotificationShown = true;
          queueToast({ type: 'success', title: 'Contracts Connected', message: `Connected to ${CHAIN_DISPLAY_NAMES[service.chain]} contracts` });
        }
      } catch (error: any) {
        console.error('Contract initialization failed:', error);

        let errorMessage = error.message || 'Failed to connect to contracts';
        let toastTitle = 'Contract Connection Failed';
        const currentRetryCount = state.retryCount + 1;
        const maxRetries = 3;
        const canRetry = currentRetryCount < maxRetries;

        if (error.message?.includes('underlying network changed')) {
          errorMessage = 'Network changed during initialization. Please try again.';
          toastTitle = 'Network Changed';
        } else if (error.message?.includes('timeout')) {
          errorMessage = 'Connection timed out. Please try again.';
          toastTitle = 'Connection Timeout';
        } else if (error.message?.includes('connection') || error.message?.includes('fetch')) {
          errorMessage = 'Connection failed. Please check your network and try again.';
          toastTitle = 'Connection Failed';
        }

        setState({
          isInitialized: false,
          isInitializing: false,
          error: errorMessage,
          contractService: null,
          connectedAccount: null,
          retryCount: currentRetryCount,
          canRetry,
        });

        initializedChainRef.current = null;

        if (canRetry && (error.message?.includes('timeout') || error.message?.includes('network'))) {
          const retryDelay = Math.min(1000 * Math.pow(2, currentRetryCount), 10000);
          queueToast({
            type: 'warning',
            title: toastTitle,
            message: `${errorMessage} Retrying in ${retryDelay / 1000}s... (${currentRetryCount}/${maxRetries})`,
          });
          setTimeout(() => {
            void initializeContracts(chain);
          }, retryDelay);
        } else {
          queueToast({
            type: 'error',
            title: toastTitle,
            message: canRetry ? `${errorMessage} You can try again manually.` : `${errorMessage} Maximum retries reached.`,
          });
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [provider, account, effectiveAccount, queueToast, state.retryCount, state.isInitializing, state.isInitialized, showConnectedNotification],
  );

  const switchChain = useCallback(
    async (newChain: SupportedChain) => {
      try {
        initializedChainRef.current = null;
        setState((prev) => ({ ...prev, isInitialized: false, contractService: null, connectedAccount: null }));
        await initializeContracts(newChain);
      } catch (error: any) {
        console.error('Chain switch failed:', error);
        queueToast({ type: 'error', title: 'Chain Switch Failed', message: error.message || 'Failed to switch chains' });
      }
    },
    [initializeContracts, queueToast],
  );

  const retryInitialization = useCallback(() => {
    if (state.canRetry) {
      setState((prev) => ({ ...prev, error: null, retryCount: 0, canRetry: true }));
      void initializeContracts(selectedChain);
    }
  }, [state.canRetry, initializeContracts, selectedChain]);

  const executeContractCall = useCallback(
    async <T,>(operation: () => Promise<T>, operationName: string): Promise<T | null> => {
      if (!state.isInitialized || !state.contractService) {
        queueToast({ type: 'error', title: 'Contract Not Ready', message: 'Please connect your wallet and initialize contracts first' });
        return null;
      }

      try {
        const result = await operation();
        queueToast({ type: 'success', title: 'Transaction Successful', message: `${operationName} completed successfully` });
        return result;
      } catch (error: any) {
        console.error(`executeContractCall: ${operationName} failed:`, error);

        let errorMessage = error.message || `${operationName} failed`;
        if (error.code === 'INSUFFICIENT_FUNDS') {
          errorMessage = 'Insufficient funds for transaction';
        } else if (error.code === 'USER_REJECTED') {
          errorMessage = 'Transaction was rejected by user';
        } else if (error.reason) {
          errorMessage = error.reason;
        }

        queueToast({ type: 'error', title: 'Transaction Failed', message: errorMessage });
        return null;
      }
    },
    [state.isInitialized, state.contractService, queueToast],
  );

  // Smart automatic initialization — safe when no network switch is needed
  useEffect(() => {
    // Clear state when wallet disconnects (both connected wallet and manual signature)
    if (!effectiveAccount || !provider) {
      setState({
        isInitialized: false,
        isInitializing: false,
        error: null,
        contractService: null,
        connectedAccount: null,
        retryCount: 0,
        canRetry: true,
      });
      initializedChainRef.current = null;
      resetContractsConnectedNotification();
      return;
    }

    // Reset contract state when chain changes
    if (state.isInitialized && initializedChainRef.current !== selectedChain) {
      setState({
        isInitialized: false,
        isInitializing: false,
        error: null,
        contractService: null,
        connectedAccount: null,
        retryCount: 0,
        canRetry: true,
      });
      initializedChainRef.current = null;
      resetContractsConnectedNotification();
    }

    // If a network switch is required, DO NOT perform any contract operations
    const shouldShowSwitchButton = account && provider && selectedChain && !isOnCorrectNetwork;
    if (shouldShowSwitchButton) {
      if (initializationTimeoutRef.current) {
        clearTimeout(initializationTimeoutRef.current);
      }
      if (!state.error || !state.error.includes('NETWORK_SWITCH_REQUIRED')) {
        setState((prev) => ({
          ...prev,
          isInitialized: false,
          isInitializing: false,
          error: 'NETWORK_SWITCH_REQUIRED: Please use the notification to switch networks',
          contractService: null,
          connectedAccount: null,
        }));
      }
      return;
    }

    const needsInitialization =
      effectiveAccount && provider && selectedChain && isOnCorrectNetwork && !state.isInitializing && !state.isInitialized && initializedChainRef.current !== selectedChain;

    if (needsInitialization) {
      if (initializationTimeoutRef.current) {
        clearTimeout(initializationTimeoutRef.current);
      }
      initializationTimeoutRef.current = setTimeout(() => {
        initializeContracts(selectedChain).catch((error: any) => {
          console.error('Contract initialization failed:', error);
          setState((prev) => ({
            ...prev,
            isInitialized: false,
            isInitializing: false,
            error: error.message || 'Contract initialization failed',
            contractService: null,
            connectedAccount: null,
          }));
        });
      }, 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, effectiveAccount, provider, selectedChain, isOnCorrectNetwork, state.isInitialized, state.isInitializing]);

  useEffect(() => {
    return () => {
      if (initializationTimeoutRef.current) {
        clearTimeout(initializationTimeoutRef.current);
      }
    };
  }, []);

  return {
    ...state,
    initializeContracts,
    switchChain,
    retryInitialization,
    executeContractCall,
    isReady: state.isInitialized && !!state.contractService,
    canExecute: state.isInitialized && !!state.contractService && !!state.connectedAccount,
  };
};

export const usePoolOperations = () => {
  const contractIntegration = useContractIntegration({ showConnectedNotification: false });
  const { executeContractCall, contractService } = contractIntegration;

  const joinPool = useCallback(
    async (poolId: string, peerId?: string) => executeContractCall(() => contractService!.joinPool(poolId, peerId), 'Join Pool'),
    [executeContractCall, contractService],
  );

  const leavePool = useCallback(
    async (poolId: string, peerId?: string) => executeContractCall(() => contractService!.leavePool(poolId, peerId), 'Leave Pool'),
    [executeContractCall, contractService],
  );

  const cancelJoinRequest = useCallback(
    async (poolId: string, peerId?: string) => executeContractCall(() => contractService!.cancelJoinRequest(poolId, peerId), 'Cancel Join Request'),
    [executeContractCall, contractService],
  );

  const voteJoinRequest = useCallback(
    async (poolId: string, peerId: string, voterPeerId: string, vote: boolean) =>
      executeContractCall(() => contractService!.voteJoinRequest(poolId, peerId, voterPeerId, vote), 'Vote on Join Request'),
    [executeContractCall, contractService],
  );

  const claimRewards = useCallback(
    async (poolId: string) => executeContractCall(() => contractService!.claimRewards(poolId), 'Claim Rewards'),
    [executeContractCall, contractService],
  );

  return {
    ...contractIntegration,
    joinPool,
    leavePool,
    cancelJoinRequest,
    voteJoinRequest,
    claimRewards,
  };
};

export const useRewardOperations = () => {
  const contractIntegration = useContractIntegration();
  const { contractService } = contractIntegration;

  const getTotalRewards = useCallback(
    async (account: string) => {
      if (!contractService) return null;
      try {
        return await contractService.getTotalRewards(account);
      } catch (error) {
        console.error('Error getting total rewards:', error);
        return null;
      }
    },
    [contractService],
  );

  const getClaimableRewards = useCallback(
    async (account: string, poolId: string) => {
      if (!contractService) return null;
      try {
        return await contractService.getClaimableRewards(account, poolId);
      } catch (error) {
        console.error('Error getting claimable rewards:', error);
        return null;
      }
    },
    [contractService],
  );

  return {
    ...contractIntegration,
    getTotalRewards,
    getClaimableRewards,
  };
};

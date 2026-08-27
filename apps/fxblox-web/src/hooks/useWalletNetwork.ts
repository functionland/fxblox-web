// Ported from apps/box/src/hooks/useWalletNetwork.ts — AppKit web hooks.
import { useCallback } from 'react';
import { useAppKitAccount, useAppKitNetwork } from '@reown/appkit/react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { type NetworkSwitchResult, getNetworkDisplayName } from '@/utils/networkSwitcher';
import { baseMainnet, skaleEuropaHub, BASE_CHAIN_ID, SKALE_CHAIN_ID } from '@/wallet/chains';

export interface WalletNetworkState {
  isOnCorrectNetwork: boolean;
  isCheckingNetwork: boolean;
  isSwitchingNetwork: boolean;
  lastNetworkCheck: number | null;
  networkError: string | null;
}

/**
 * Wallet network state + switching. With AppKit, chainId is reactive — no polling.
 */
export const useWalletNetwork = () => {
  const { isConnected } = useAppKitAccount({ namespace: 'eip155' });
  const { chainId, switchNetwork } = useAppKitNetwork();
  const selectedChain = useSettingsStore((state) => state.selectedChain);

  const targetChainId = selectedChain === 'base' ? BASE_CHAIN_ID : SKALE_CHAIN_ID;
  // chainId can be a number, a decimal string or hex depending on the connector — normalize before comparing.
  const isOnCorrectNetwork = isConnected && chainId != null && chainId !== '' && Number(chainId) === targetChainId;

  const checkNetwork = useCallback(async (): Promise<boolean> => {
    return isOnCorrectNetwork;
  }, [isOnCorrectNetwork]);

  const ensureCorrectNetworkConnection = useCallback(async (): Promise<NetworkSwitchResult> => {
    if (!isConnected) {
      return { success: false, error: 'Wallet not connected' };
    }
    if (isOnCorrectNetwork) {
      return { success: true, action: 'already_connected' };
    }
    try {
      const targetNetwork = selectedChain === 'base' ? baseMainnet : skaleEuropaHub;
      await switchNetwork(targetNetwork);
      return { success: true, action: 'switched' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network switch failed' };
    }
  }, [isConnected, isOnCorrectNetwork, selectedChain, switchNetwork]);

  const withCorrectNetwork = useCallback(
    async <T,>(operation: () => Promise<T>, options?: { skipNetworkCheck?: boolean }): Promise<T> => {
      const { skipNetworkCheck = false } = options || {};
      if (skipNetworkCheck || !isConnected) {
        return operation();
      }
      if (!isOnCorrectNetwork) {
        throw new Error(`NETWORK_SWITCH_REQUIRED: Please switch to ${getNetworkDisplayName(selectedChain)}`);
      }
      return operation();
    },
    [isConnected, isOnCorrectNetwork, selectedChain],
  );

  return {
    isOnCorrectNetwork,
    isCheckingNetwork: false,
    isSwitchingNetwork: false,
    lastNetworkCheck: null,
    networkError: null,
    checkNetwork,
    ensureCorrectNetworkConnection,
    withCorrectNetwork,
    selectedChain,
    targetNetworkName: getNetworkDisplayName(selectedChain),
  };
};

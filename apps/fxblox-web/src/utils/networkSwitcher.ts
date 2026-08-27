import { useCallback } from 'react';
import { useAppKitNetwork } from '@reown/appkit/react';
import type { SupportedChain } from '@/contracts/types';
import { baseMainnet, skaleEuropaHub } from '@/wallet/chains';

export interface NetworkSwitchResult {
  success: boolean;
  error?: string;
  action?: 'switched' | 'added_and_switched' | 'already_connected' | 'pending';
}

/**
 * Hook to provide network switching functionality via Reown AppKit
 */
export const useNetworkSwitcher = () => {
  const { switchNetwork } = useAppKitNetwork();

  const switchToNetwork = useCallback(
    async (targetChain: SupportedChain): Promise<NetworkSwitchResult> => {
      try {
        const targetNetwork = targetChain === 'base' ? baseMainnet : skaleEuropaHub;
        await switchNetwork(targetNetwork);
        return { success: true, action: 'switched' };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Network switch failed' };
      }
    },
    [switchNetwork],
  );

  return {
    switchToNetwork,
    isProviderAvailable: true,
  };
};

export const getNetworkDisplayName = (chain: SupportedChain): string => {
  switch (chain) {
    case 'base':
      return 'Base Network';
    case 'skale':
      return 'SKALE Europa Hub';
    default:
      return chain;
  }
};

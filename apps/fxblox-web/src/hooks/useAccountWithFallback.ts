// Ported VERBATIM from apps/box/src/hooks/useAccountWithFallback.ts
import { useWallet } from '@/wallet/useWallet';
import { useUserProfileStore } from '@/stores/useUserProfileStore';

/**
 * 1. wallet connected → wallet account; 2. manual signature address; 3. null
 */
export const useAccountWithFallback = () => {
  const { account: walletAccount, connected } = useWallet();
  const manualSignatureWalletAddress = useUserProfileStore((state) => state.manualSignatureWalletAddress);

  if (connected && walletAccount) {
    return walletAccount;
  }
  if (manualSignatureWalletAddress) {
    return manualSignatureWalletAddress;
  }
  return null;
};

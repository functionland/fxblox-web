/**
 * Port of apps/box/src/components/WalletNotification.tsx (1:1 logic: 1.5 s anti-flicker delays, the
 * connect / network / hidden decision, compact and full layouts). Settings-local copy: the shared
 * `src/components/WalletNotification` belongs to the main-tabs builder; swap the import once it lands.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxText } from '@functionland/fx-ui';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { useWalletNetwork } from '@/hooks/useWalletNetwork';
import { useContractIntegration } from '@/hooks/useContractIntegration';
import { useWallet } from '@/wallet/useWallet';
import { useUserProfileStore } from '@/stores/useUserProfileStore';

export type WalletNotificationType = 'connect' | 'network' | 'hidden';

export interface WalletNotificationProps {
  onDismiss?: () => void;
  compact?: boolean;
  /** Show even when the wallet is properly connected / on the correct network. */
  showOnCorrectState?: boolean;
  /** Hide during external loading states (e.g. pools loading). */
  hideOnLoading?: boolean;
}

export function WalletNotification({
  onDismiss,
  compact = false,
  showOnCorrectState = false,
  hideOnLoading = true,
}: WalletNotificationProps) {
  const { t } = useTranslation();
  const { connected, connectWallet, connecting } = useWalletConnection();
  const {
    isOnCorrectNetwork,
    isSwitchingNetwork,
    ensureCorrectNetworkConnection,
    targetNetworkName,
    selectedChain,
  } = useWalletNetwork();
  const { isInitializing } = useContractIntegration();
  const { account } = useWallet();
  const manualSignatureWalletAddress = useUserProfileStore(
    (state) => state.manualSignatureWalletAddress,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [showAfterDelay, setShowAfterDelay] = useState(false);
  const [postLoadingDelay, setPostLoadingDelay] = useState(false);

  // Any account: connected wallet or a manual signature address.
  const hasAnyAccount = (connected && !!account) || !!manualSignatureWalletAddress;

  // Delay the connect notification to prevent flicker while the wallet restores its session.
  useEffect(() => {
    if (!hasAnyAccount) {
      const timer = setTimeout(() => setShowAfterDelay(true), 1500);
      return () => clearTimeout(timer);
    }
    setShowAfterDelay(true);
    return undefined;
  }, [hasAnyAccount]);

  const isContractInitializing = isInitializing || false;

  // Stabilisation period after loading states clear.
  useEffect(() => {
    if (hideOnLoading) {
      if (isContractInitializing || isSwitchingNetwork || connecting) {
        setPostLoadingDelay(true);
        return undefined;
      }
      const timer = setTimeout(() => setPostLoadingDelay(false), 1500);
      return () => clearTimeout(timer);
    }
    setPostLoadingDelay(false);
    return undefined;
  }, [hideOnLoading, isContractInitializing, isSwitchingNetwork, connecting]);

  const getNotificationType = (): WalletNotificationType => {
    if (connected && account) {
      return isOnCorrectNetwork ? 'hidden' : 'network';
    }
    // Manual signature: wallet connection is optional.
    if (manualSignatureWalletAddress) return 'hidden';
    return showAfterDelay ? 'connect' : 'hidden';
  };

  const notificationType = getNotificationType();

  if (notificationType === 'hidden' && !showOnCorrectState) return null;
  if ((isContractInitializing || postLoadingDelay) && hideOnLoading) return null;

  const handleConnectWallet = async () => {
    try {
      await connectWallet();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  };

  const handleNetworkSwitch = async () => {
    try {
      setIsLoading(true);
      const result = await ensureCorrectNetworkConnection();
      // A pending switch resolves through the reactive chainId in useWalletNetwork.
      if (!result.success) console.log('Network switch result:', result);
    } catch (error) {
      console.error('Network switch failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const content = (() => {
    switch (notificationType) {
      case 'connect':
        return {
          icon: '🔗',
          title: t('settings.walletNotification.connect.title'),
          message: t('settings.walletNotification.connect.message'),
          buttonText: t('settings.walletNotification.connect.button'),
          buttonAction: handleConnectWallet,
          isLoading: connecting,
          loadingText: t('settings.walletNotification.connect.loading'),
        };
      case 'network':
        return {
          icon: '🔄',
          title: t('settings.walletNotification.network.title', { network: targetNetworkName }),
          message: t('settings.walletNotification.network.message', { network: targetNetworkName }),
          buttonText: t('settings.walletNotification.network.button', {
            network: targetNetworkName,
          }),
          buttonAction: handleNetworkSwitch,
          isLoading: isSwitchingNetwork || isLoading,
          loadingText:
            selectedChain === 'skale'
              ? t('settings.walletNotification.network.adding')
              : t('settings.walletNotification.network.switching'),
        };
      default:
        return null;
    }
  })();

  if (!content) return null;

  if (compact) {
    return (
      <FxBox
        backgroundColor="backgroundSecondary"
        borderColor="border"
        borderWidth={1}
        borderRadius="m"
        padding="12"
        marginBottom="8"
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        gap="8"
        role="status"
        testID={`wallet-notification-${notificationType}`}
      >
        <FxBox flex={1} minWidth={0}>
          <FxText variant="bodySmallRegular" color="content1">
            {content.icon} {content.title}
          </FxText>
        </FxBox>
        <FxButton
          variant="inverted"
          onPress={() => void content.buttonAction()}
          disabled={content.isLoading}
        >
          {content.isLoading ? content.loadingText : content.buttonText}
        </FxButton>
      </FxBox>
    );
  }

  return (
    <FxBox
      backgroundColor="backgroundSecondary"
      borderColor="border"
      borderWidth={1}
      borderRadius="l"
      padding="16"
      marginBottom="16"
      role="status"
      testID={`wallet-notification-${notificationType}`}
    >
      <FxBox flexDirection="row" alignItems="flex-start" marginBottom="12" gap="12">
        <FxText>{content.icon}</FxText>
        <FxBox flex={1} minWidth={0}>
          <FxText variant="bodyMediumRegular" color="content1">
            {content.title}
          </FxText>
        </FxBox>
        {onDismiss && (
          <FxButton size="large" variant="inverted" onPress={onDismiss}>
            {t('settings.walletNotification.dismiss')}
          </FxButton>
        )}
      </FxBox>
      <FxText variant="bodySmallRegular" color="content2" marginBottom="16">
        {content.message}
      </FxText>
      <FxBox flexDirection="row" justifyContent="flex-start">
        <FxButton
          variant="pressed"
          onPress={() => void content.buttonAction()}
          disabled={content.isLoading}
        >
          {content.isLoading ? content.loadingText : content.buttonText}
        </FxButton>
      </FxBox>
    </FxBox>
  );
}

export default WalletNotification;

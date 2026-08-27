/**
 * Port of apps/box/src/components/WalletNotification.tsx (1:1 logic: 1.5 s anti-flicker delay before the
 * "connect" notification, 1.5 s stabilisation after loading states, compact / full variants). Strings moved to
 * `main.walletNotification.*`. Must render inside a `WalletGate`.
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

export const WALLET_NOTIFICATION_DELAY_MS = 1500;

export interface WalletNotificationProps {
  onDismiss?: () => void;
  compact?: boolean;
  /** Show even when wallet is properly connected/on correct network. */
  showOnCorrectState?: boolean;
  /** Hide during external loading states (e.g., pools loading). */
  hideOnLoading?: boolean;
  className?: string;
  testID?: string;
}

export function WalletNotification({
  onDismiss,
  compact = false,
  showOnCorrectState = false,
  hideOnLoading = true,
  className,
  testID = 'wallet-notification',
}: WalletNotificationProps) {
  const { t } = useTranslation();
  const { connected, connectWallet, connecting } = useWalletConnection();
  const { isOnCorrectNetwork, isSwitchingNetwork, ensureCorrectNetworkConnection, targetNetworkName, selectedChain } =
    useWalletNetwork();
  const { isInitializing } = useContractIntegration();
  const { account } = useWallet();
  const manualSignatureWalletAddress = useUserProfileStore((state) => state.manualSignatureWalletAddress);
  const [isLoading, setIsLoading] = useState(false);
  const [showAfterDelay, setShowAfterDelay] = useState(false);
  const [postLoadingDelay, setPostLoadingDelay] = useState(false);

  // Determine if we have any account (connected wallet or manual signature)
  const hasAnyAccount = Boolean((connected && account) || manualSignatureWalletAddress);

  // Add delay before showing connect wallet notification to prevent flicker
  useEffect(() => {
    if (!hasAnyAccount) {
      const timer = setTimeout(() => setShowAfterDelay(true), WALLET_NOTIFICATION_DELAY_MS);
      return () => clearTimeout(timer);
    }
    setShowAfterDelay(true);
    return undefined;
  }, [hasAnyAccount]);

  const isContractInitializing = isInitializing || false;

  // Stabilisation period after loading states clear
  useEffect(() => {
    if (!hideOnLoading) {
      setPostLoadingDelay(false);
      return undefined;
    }
    if (isContractInitializing || isSwitchingNetwork || connecting) {
      setPostLoadingDelay(true);
      return undefined;
    }
    const timer = setTimeout(() => setPostLoadingDelay(false), WALLET_NOTIFICATION_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hideOnLoading, isContractInitializing, isSwitchingNetwork, connecting]);

  const notificationType: WalletNotificationType = (() => {
    if (connected && account) return isOnCorrectNetwork ? 'hidden' : 'network';
    if (manualSignatureWalletAddress) return 'hidden';
    return showAfterDelay ? 'connect' : 'hidden';
  })();

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
          title: t('main.walletNotification.connectTitle'),
          message: t('main.walletNotification.connectMessage'),
          buttonText: t('main.walletNotification.connectButton'),
          buttonAction: handleConnectWallet,
          isLoading: connecting,
          loadingText: t('main.walletNotification.connecting'),
        };
      case 'network': {
        const isSkale = selectedChain === 'skale';
        return {
          icon: '🔄',
          title: t('main.walletNotification.networkTitle', { network: targetNetworkName }),
          message: t('main.walletNotification.networkMessage', { network: targetNetworkName }),
          buttonText: t('main.walletNotification.networkButton', { network: targetNetworkName }),
          buttonAction: handleNetworkSwitch,
          isLoading: isSwitchingNetwork || isLoading,
          loadingText: isSkale
            ? t('main.walletNotification.addingNetwork')
            : t('main.walletNotification.switching'),
        };
      }
      default:
        return null;
    }
  })();

  if (!content) return null;

  if (compact) {
    return (
      <FxBox
        role="status"
        backgroundColor="backgroundSecondary"
        borderColor="border"
        borderWidth={1}
        borderRadius="m"
        padding="12"
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        gap="8"
        className={className}
        testID={testID}
        data-notification={notificationType}
      >
        <FxBox flex={1} minWidth={0}>
          <FxText variant="bodySmallRegular" color="content1">
            <span aria-hidden="true">{content.icon} </span>
            {content.title}
          </FxText>
        </FxBox>
        <FxButton
          variant="inverted"
          onPress={() => void content.buttonAction()}
          disabled={content.isLoading}
          testID={`${testID}-action`}
        >
          {content.isLoading ? content.loadingText : content.buttonText}
        </FxButton>
      </FxBox>
    );
  }

  return (
    <FxBox
      role="status"
      backgroundColor="backgroundSecondary"
      borderColor="border"
      borderWidth={1}
      borderRadius="l"
      padding="16"
      className={className}
      testID={testID}
      data-notification={notificationType}
    >
      <FxBox flexDirection="row" alignItems="flex-start" marginBottom="12" gap="12">
        <FxText aria-hidden="true">{content.icon}</FxText>
        <FxBox flex={1}>
          <FxText variant="bodyMediumRegular" color="content1">
            {content.title}
          </FxText>
        </FxBox>
        {onDismiss && (
          <FxButton size="small" variant="inverted" onPress={onDismiss} aria-label={t('main.walletNotification.dismiss')}>
            ✕
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
          testID={`${testID}-action`}
        >
          {content.isLoading ? content.loadingText : content.buttonText}
        </FxButton>
      </FxBox>
    </FxBox>
  );
}

export default WalletNotification;

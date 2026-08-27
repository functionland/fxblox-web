/**
 * Port of apps/box/src/components/Cards/EarningCard.tsx. Web deviations (plan §WS4 "Shared"): the wallet dApp
 * deep links only appear on an Android user agent; on desktop the primary action is "Open claim portal"
 * (`window.open`); "Copy Claim Link" ends in a `useConfirm().alert()` instead of `Alert.alert`.
 * Must render inside a `WalletGate`.
 */
import { useTranslation } from 'react-i18next';
import { useWalletInfo } from '@reown/appkit/react';
import {
  FxBox,
  FxButton,
  FxCard,
  FxIconButton,
  FxLoadingSpinner,
  FxRefreshIcon,
  FxText,
  useConfirm,
  useToast,
  type FxCardProps,
} from '@functionland/fx-ui';
import { useWallet } from '@/wallet/useWallet';
import { useFulaBalance, useFormattedFulaBalance } from '@/hooks/useFulaBalance';
import { useClaimableTokens } from '@/hooks/useClaimableTokens';
import { useUserProfileStore } from '@/stores/useUserProfileStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useBloxsStore } from '@/stores/useBloxsStore';
import { copyToClipboard } from '@/utils/clipboard';
import { isAndroid, isMobile } from '@/platform/deviceInfo';
import { openUrl } from '@/platform/linking';

export const CLAIM_DOMAIN = 'claim-web.fula.network';
/** MAX_VIEW_PERIODS_V2 * DEFAULT_EXPECTED_PERIOD = 540 * 28800s = 180 days. */
export const STALE_THRESHOLD_SECS = 180 * 24 * 60 * 60;

export type EarningCardProps = Omit<FxCardProps, 'children' | 'onPress' | 'onLongPress' | 'href'> & {
  data: { totalFula: string };
  loading?: boolean;
  onRefreshPress?: () => void;
};

/** Deep link into the connected wallet's dApp browser (MetaMask / Trust / Coinbase), else null. */
export function buildWalletDappLink(walletName: string | undefined, fullUrl: string): string | null {
  if (!walletName) return null;
  const name = walletName.toLowerCase();
  if (name.includes('metamask')) return `https://metamask.app.link/dapp/${fullUrl.replace(/^https?:\/\//, '')}`;
  if (name.includes('trust')) return `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(fullUrl)}`;
  if (name.includes('coinbase')) return `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(fullUrl)}`;
  return null;
}

export function buildClaimUrl(args: { chain: string; clusterPeerId?: string; walletAddress?: string }): string {
  const params = new URLSearchParams();
  params.append('network', args.chain);
  if (args.clusterPeerId) params.append('peerId', args.clusterPeerId);
  if (args.walletAddress) params.append('wallet', args.walletAddress);
  return `https://${CLAIM_DOMAIN}?${params.toString()}`;
}

export function EarningCard({ data: _data, loading, onRefreshPress, testID = 'earning-card', ...rest }: EarningCardProps) {
  const { queueToast } = useToast();
  const { alert } = useConfirm();
  const { t } = useTranslation();

  const { formattedBalance, loading: balanceLoading, tokenSymbol, error: balanceError } = useFormattedFulaBalance();
  const { refreshBalance } = useFulaBalance();
  const { account, connecting, open, connected } = useWallet();
  const { walletInfo } = useWalletInfo();
  const manualSignatureWalletAddress = useUserProfileStore((state) => state.manualSignatureWalletAddress);
  const selectedChain = useSettingsStore((state) => state.selectedChain);
  const currentBloxPeerId = useBloxsStore((state) => state.currentBloxPeerId);
  const bloxs = useBloxsStore((state) => state.bloxs);
  // ipfs-cluster peer id for the claim portal — never the kubo peer id.
  const storedClusterPeerId = currentBloxPeerId ? bloxs[currentBloxPeerId]?.clusterPeerId : undefined;
  const clusterPeerId = storedClusterPeerId && storedClusterPeerId !== currentBloxPeerId ? storedClusterPeerId : undefined;

  const walletAddress = account || manualSignatureWalletAddress || '';
  const walletDisplay = walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : '';

  const {
    totalUnclaimed,
    timeSinceLastClaim,
    loading: claimableLoading,
    error: claimableError,
    formattedTotalUnclaimed,
    formattedUnclaimedMining,
    formattedUnclaimedStorage,
    formattedTimeSinceLastClaim,
    fetchClaimableTokens,
  } = useClaimableTokens();

  const isStale =
    !claimableLoading && !claimableError && parseFloat(totalUnclaimed) === 0 && timeSinceLastClaim > STALE_THRESHOLD_SECS;

  const handleRefresh = async () => {
    if (!account && !manualSignatureWalletAddress) {
      try {
        await open({ view: 'Connect' });
        queueToast({
          type: 'success',
          title: t('earningCard.walletConnected'),
          message: t('earningCard.walletConnectedMessage'),
        });
      } catch (e) {
        queueToast({
          type: 'error',
          title: t('earningCard.walletConnectionFailed'),
          message: e instanceof Error && e.message ? e.message : t('earningCard.walletConnectionFailedMessage'),
        });
        return;
      }
    }
    refreshBalance();
    fetchClaimableTokens();
    onRefreshPress?.();
  };

  const claimUrl = buildClaimUrl({ chain: selectedChain, clusterPeerId, walletAddress });
  const android = isAndroid();
  const walletLink = android && connected ? buildWalletDappLink(walletInfo?.name, claimUrl) : null;
  const canOpenInWallet = Boolean(walletLink);
  const showPortalButton = !isMobile();

  const handleOpenClaimPortal = () => {
    try {
      const target = walletLink ?? claimUrl;
      if (!openUrl(target, { newTab: true })) throw new Error('blocked');
    } catch {
      queueToast({ type: 'error', title: t('earningCard.claimFailed'), message: t('main.earningCard.openFailed') });
    }
  };

  const handleCopyClaimLink = () => {
    copyToClipboard(claimUrl);
    void alert({
      title: t('earningCard.linkCopied'),
      message: t('earningCard.openInWalletInstructions'),
      okText: t('earningCard.gotIt'),
    });
  };

  return (
    <FxCard testID={testID} {...rest}>
      <FxBox flexDirection="row" justifyContent="space-between" alignItems="flex-start" gap="8">
        <FxCard.Title marginBottom="8">{t('earningCard.title')}</FxCard.Title>
        {loading || balanceLoading ? (
          <FxLoadingSpinner width={20} height={20} />
        ) : (
          <FxIconButton
            aria-label={t('main.earningCard.refresh')}
            icon={<FxRefreshIcon />}
            color="content3"
            disabled={!!connecting}
            onPress={() => void handleRefresh()}
            testID={`${testID}-refresh`}
          />
        )}
      </FxBox>
      <FxCard.Row>
        <FxCard.Row.Title>{t('earningCard.totalInWallet', { tokenSymbol })}</FxCard.Row.Title>
        <FxCard.Row.Data testID={`${testID}-balance`}>
          {balanceError ? t('earningCard.errorLoadingBalance') : formattedBalance}
        </FxCard.Row.Data>
      </FxCard.Row>
      <FxCard.Row>
        <FxCard.Row.Title>{t('earningCard.claimableRewards')}</FxCard.Row.Title>
        <FxCard.Row.Data testID={`${testID}-claimable`}>
          {claimableError ? t('earningCard.errorLoadingRewards') : `${formattedTotalUnclaimed} ${tokenSymbol}`}
        </FxCard.Row.Data>
      </FxCard.Row>

      {isStale && (
        <FxBox marginTop="8" marginBottom="4" padding="8" backgroundColor="warningBase" borderRadius="s" testID={`${testID}-stale`}>
          <FxText variant="bodyXSRegular" color="backgroundApp">
            {t('earningCard.catchUpHint')}
          </FxText>
        </FxBox>
      )}

      <FxCard.Row>
        <FxCard.Row.Title>{t('earningCard.miningRewards')}</FxCard.Row.Title>
        <FxCard.Row.Data>
          {formattedUnclaimedMining} {tokenSymbol}
        </FxCard.Row.Data>
      </FxCard.Row>
      <FxCard.Row>
        <FxCard.Row.Title>{t('earningCard.storageRewards')}</FxCard.Row.Title>
        <FxCard.Row.Data>
          {formattedUnclaimedStorage} {tokenSymbol}
        </FxCard.Row.Data>
      </FxCard.Row>
      <FxCard.Row>
        <FxCard.Row.Title>{t('earningCard.lastClaimed')}</FxCard.Row.Title>
        <FxCard.Row.Data>{formattedTimeSinceLastClaim}</FxCard.Row.Data>
      </FxCard.Row>
      {walletDisplay ? (
        <FxCard.Row>
          <FxCard.Row.Title>{t('earningCard.wallet')}</FxCard.Row.Title>
          <FxCard.Row.Data testID={`${testID}-wallet`}>{walletDisplay}</FxCard.Row.Data>
        </FxCard.Row>
      ) : null}

      <FxBox marginTop="12" gap="8">
        {canOpenInWallet && (
          <FxButton onPress={handleOpenClaimPortal} testID={`${testID}-claim`}>
            {t('earningCard.claimRewards')}
          </FxButton>
        )}
        {!canOpenInWallet && showPortalButton && (
          <FxButton onPress={handleOpenClaimPortal} testID={`${testID}-open-portal`}>
            {t('main.earningCard.openClaimPortal')}
          </FxButton>
        )}
        <FxButton variant="inverted" onPress={handleCopyClaimLink} testID={`${testID}-copy-link`}>
          {t('earningCard.copyClaimLink')}
        </FxButton>
      </FxBox>
    </FxCard>
  );
}

export default EarningCard;

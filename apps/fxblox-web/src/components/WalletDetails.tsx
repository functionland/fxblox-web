/**
 * Port of apps/box/src/components/WalletDetails.tsx — the wide copy buttons became `CopyRow`s (address / DID /
 * App PeerId / Bloxs' peer ids), the contract status dot is an FxStatusDot. The DID is derived through a dynamic
 * import of `utils/helper` so `@functionland/fula-sec-web` stays out of the shell chunk (ProfileSheet is eager).
 * Must render inside a `WalletGate` (uses the AppKit hooks).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxHeader,
  FxIconButton,
  FxRefreshIcon,
  FxStatusDot,
  FxText,
  useToast,
} from '@functionland/fx-ui';
import { useBloxsStore } from '@/stores/useBloxsStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUserProfileStore } from '@/stores/useUserProfileStore';
import { useWallet } from '@/wallet/useWallet';
import { chainNames } from '@/wallet/chains';
import { useContractIntegration } from '@/hooks/useContractIntegration';
import { CHAIN_DISPLAY_NAMES } from '@/contracts/config';
import { CopyRow } from '@/components/main/CopyRow';

export interface WalletDetailsProps {
  allowChangeWallet?: boolean;
  showPeerId?: boolean;
  showDID?: boolean;
  showBloxPeerIds?: boolean;
  showNetwork?: boolean;
  className?: string;
  testID?: string;
}

const shortAddress = (a: string): string => `${a.slice(0, 6)}...${a.slice(-4)}`;

export function WalletDetails({
  allowChangeWallet,
  showNetwork = true,
  showPeerId,
  showDID = true,
  showBloxPeerIds = false,
  className,
  testID = 'wallet-details',
}: WalletDetailsProps) {
  const { t } = useTranslation();
  const bloxs = useBloxsStore((state) => state.bloxs);
  const bloxsArray = useMemo(() => Object.values(bloxs ?? {}), [bloxs]);
  const [loading, setLoading] = useState(false);
  const [userHasExplicitlyConnected, setUserHasExplicitlyConnected] = useState(false);
  const [did, setDid] = useState<string | null>(null);

  const signiture = useUserProfileStore((state) => state.signiture);
  const password = useUserProfileStore((state) => state.password);
  const address = useUserProfileStore((state) => state.address);
  const appPeerId = useUserProfileStore((state) => state.appPeerId);
  const checkFulaReadiness = useUserProfileStore((state) => state.checkFulaReadiness);
  const selectedChain = useSettingsStore((state) => state.selectedChain);
  const { account, chainId, provider, connected, open } = useWallet();
  const { isInitialized: contractInitialized } = useContractIntegration();
  const { queueToast } = useToast();

  useEffect(() => {
    void checkFulaReadiness().catch(() => undefined);
    // Mobile ran this once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (account && provider && !userHasExplicitlyConnected) setUserHasExplicitlyConnected(true);
  }, [account, provider, userHasExplicitlyConnected]);

  useEffect(() => {
    let cancelled = false;
    if (password && signiture) {
      import('@/utils/helper')
        .then((h) => {
          if (!cancelled) setDid(h.getMyDID(password, signiture));
        })
        .catch((e) => {
          console.warn('WalletDetails: could not derive the DID', e);
          if (!cancelled) setDid(null);
        });
    } else {
      setDid(null);
    }
    return () => {
      cancelled = true;
    };
  }, [password, signiture]);

  const walletAddress = address ?? '';

  const connectWallet = useCallback(async () => {
    try {
      await open({ view: 'Connect' });
      setUserHasExplicitlyConnected(true);
      queueToast({
        type: 'success',
        title: t('main.walletDetails.walletConnected'),
        message: t('main.walletDetails.walletConnectedMessage'),
      });
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      queueToast({
        type: 'error',
        title: t('main.walletDetails.connectFailed'),
        message:
          error instanceof Error && error.message
            ? error.message
            : t('main.walletDetails.connectFailedMessage'),
      });
    }
  }, [open, queueToast, t]);

  const onRefreshPress = useCallback(async () => {
    setLoading(true);
    try {
      if (!connected || !account || !address) {
        await connectWallet();
      } else {
        queueToast({
          type: 'info',
          title: t('main.walletDetails.refreshedTitle'),
          message: t('main.walletDetails.refreshedMessage'),
        });
      }
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setLoading(false);
    }
  }, [connected, account, address, connectWallet, queueToast, t]);

  const networkName = chainId ? (chainNames[chainId] ?? t('main.walletDetails.unknownNetwork')) : t('main.walletDetails.unknownNetwork');

  return (
    <FxBox className={className} testID={testID}>
      <FxBox flexDirection="row" alignItems="center" justifyContent="space-between" paddingVertical="12">
        <FxText as="h2" variant="h300">
          {t('main.walletDetails.title')}
        </FxText>
        <FxIconButton
          aria-label={t('main.walletDetails.refresh')}
          icon={<FxRefreshIcon />}
          color="content3"
          loading={loading}
          onPress={() => void onRefreshPress()}
          testID="wallet-details-refresh"
        />
      </FxBox>

      {walletAddress ? (
        <CopyRow label={t('main.walletDetails.address')} value={walletAddress} testID="wallet-details-address" />
      ) : null}
      {allowChangeWallet && (
        <FxButton variant="inverted" marginTop="12" onPress={() => void connectWallet()} testID="wallet-details-change">
          {t('main.walletDetails.changeWallet')}
        </FxButton>
      )}

      {showNetwork && (
        <FxBox marginTop="24" alignItems="center">
          <FxText variant="h300" textAlign="center">
            {t('main.walletDetails.network')}
          </FxText>
          <FxText textAlign="center" marginTop="8" testID="wallet-details-network">
            {networkName}
          </FxText>
        </FxBox>
      )}

      <FxBox marginTop="24" alignItems="center">
        <FxText variant="h300" textAlign="center">
          {t('main.walletDetails.contracts')}
        </FxText>
        <FxBox flexDirection="row" alignItems="center" justifyContent="center" marginTop="8" gap="8">
          <FxStatusDot status={contractInitialized ? 'connected' : 'disconnected'} label={null} />
          <FxText
            textAlign="center"
            color={contractInitialized ? 'greenBase' : 'errorBase'}
            testID="wallet-details-contracts"
          >
            {contractInitialized
              ? t('main.walletDetails.connectedTo', { chain: CHAIN_DISPLAY_NAMES[selectedChain] })
              : t('main.walletDetails.notConnected')}
          </FxText>
        </FxBox>
        {contractInitialized && account && (
          <FxText variant="bodySmallRegular" textAlign="center" color="content2" marginTop="8">
            {t('main.walletDetails.wallet', { wallet: shortAddress(account) })}
          </FxText>
        )}
      </FxBox>

      {password && signiture && showDID && did ? (
        <FxBox marginTop="24">
          <CopyRow label={t('main.walletDetails.did')} value={did} testID="wallet-details-did" />
        </FxBox>
      ) : null}

      {appPeerId && showPeerId ? (
        <FxBox marginTop={password && signiture && showDID && did ? '0' : '24'}>
          <CopyRow label={t('main.walletDetails.appPeerId')} value={appPeerId} testID="wallet-details-app-peer-id" />
        </FxBox>
      ) : null}

      {bloxsArray.length > 0 && showBloxPeerIds && (
        <FxBox marginTop="24" testID="wallet-details-blox-peer-ids">
          <FxHeader title={t('main.walletDetails.bloxPeerIds')} marginBottom="8" />
          {bloxsArray.map((blox) => (
            <CopyRow key={blox.peerId} label={blox.name} value={blox.peerId} />
          ))}
        </FxBox>
      )}
    </FxBox>
  );
}

export default WalletDetails;

/**
 * Blox dashboard — port of apps/box/src/screens/Blox/Blox.screen.tsx.
 *
 * Phone: hero → Diagnose CTA → WalletNotification (compact) → UsageBar → DeviceCard → EarningCard → TasksCard.
 * Desktop (≥ 900px): notification banner → hero card (with the CTA) → grid-cols-2 (DeviceCard + UsageBar |
 * EarningCard + TasksCard). Header actions: `BloxHeader` in the AppShell phone slot (desktop keeps the TopBar).
 *
 * The five `Alert.alert`s are `useConfirm()` dialogs; "clear cache" clears the data layer (`clearAppCache`);
 * reset-to-hotspot / reboot call `fxblox.wifiRemoveall()` / `fxblox.reboot()`. Everything is keyed by
 * `currentBloxPeerId`; readiness is `fulaIsReady && fulaReadyForPeerId === currentBloxPeerId` (audit M4/S2).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxCard,
  useConfirm,
  useIsDesktop,
  useToast,
  type FxSheetMethods,
} from '@functionland/fx-ui';
import { paths } from '@/app/paths';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useLogger } from '@/hooks/useLogger';
import { useContractIntegration } from '@/hooks/useContractIntegration';
import { useWallet } from '@/wallet/useWallet';
import { fxblox } from '@/lib/fula';
import { lanFetch, isLanHttpError } from '@/platform/lanHttp';
import { env } from '@/config/env';
import { useBloxsStore } from '@/stores/useBloxsStore';
import { useUserProfileStore } from '@/stores/useUserProfileStore';
import { EBloxInteractionType, EDeviceStatus, type TBloxFolderSize, type TBloxInteraction } from '@/models';
import { MainScreen } from '@/components/main/MainScreen';
import { WalletGate } from '@/components/main/WalletGate';
import { useEnsureFulaClient } from '@/components/main/useEnsureFulaClient';
import { clearAppCache } from '@/components/main/clearAppCache';
import { BloxInfoSheet } from '@/components/BloxInfoSheet';
import { BloxInteractionModal, BLOX_INTERACTIONS } from '@/components/BloxInteractionModal';
import { ConnectionOptionsSheet, type ConnectionOptionsType } from '@/components/ConnectionOptionsSheet';
import { WalletNotification } from '@/components/WalletNotification';
import { UsageBar } from '@/components/UsageBar';
import { DeviceCard } from '@/components/Cards/DeviceCard';
import { EarningCard } from '@/components/Cards/EarningCard';
import { TasksCard } from '@/components/Cards/TasksCard';
import { BloxHeader } from './BloxHeader';
import { BloxHero } from './BloxHero';

export const HOTSPOT_PROBE_TIMEOUT_MS = 5000;
export const HOTSPOT_PROBE_URL = `${env.BLOX_AP_URL}/properties`;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Wallet-dependent half of the dashboard (contract notification, earnings, tasks). Rendered inside WalletGate. */
function BloxWalletSection({
  readyForCurrent,
  loadedPeerId,
  currentBloxPeerId,
}: {
  readyForCurrent: boolean;
  loadedPeerId: string | null;
  currentBloxPeerId: string | undefined;
}) {
  const logger = useLogger();
  const { account } = useWallet();
  // Contract integration with the "Contracts Connected" notification (Blox screen only, as on mobile).
  useContractIntegration({ showConnectedNotification: true });
  const earnings = useUserProfileStore((state) => state.earnings);
  const getEarnings = useUserProfileStore((state) => state.getEarnings);
  const fulaIsReady = useUserProfileStore((state) => state.fulaIsReady);
  const [loadingFulaEarnings, setLoadingFulaEarnings] = useState(false);
  const earningsLoadedFor = useRef<string | null>(null);

  const updateFulaEarnings = useCallback(async () => {
    try {
      setLoadingFulaEarnings(true);
      if (fulaIsReady && account) {
        // Pass the wallet account so getEarnings does not prompt the wallet.
        await getEarnings(account);
        logger.log('updateFulaEarnings');
      }
    } catch (error) {
      logger.logError('updateFulaEarnings Error', error);
    } finally {
      setLoadingFulaEarnings(false);
    }
  }, [fulaIsReady, account, getEarnings, logger]);

  // Runs once per blox after the sequential load (connection → space) finished — keeps the mobile ordering.
  useEffect(() => {
    if (!readyForCurrent || !account || !currentBloxPeerId || loadedPeerId !== currentBloxPeerId) return;
    if (earningsLoadedFor.current === currentBloxPeerId) return;
    earningsLoadedFor.current = currentBloxPeerId;
    void updateFulaEarnings();
  }, [readyForCurrent, account, currentBloxPeerId, loadedPeerId, updateFulaEarnings]);

  return (
    <>
      <EarningCard onRefreshPress={() => void updateFulaEarnings()} loading={loadingFulaEarnings} data={{ totalFula: earnings }} />
      <TasksCard />
    </>
  );
}

export default function Blox() {
  const { t } = useTranslation();
  const { navigate } = useAppNavigate();
  const { queueToast } = useToast();
  const { confirm, alert } = useConfirm();
  const logger = useLogger();
  const isDesktop = useIsDesktop();
  useEnsureFulaClient();

  const bloxInteractionModalRef = useRef<FxSheetMethods>(null);
  const connectionOptionsSheetRef = useRef<FxSheetMethods>(null);
  const bloxInfoSheetRef = useRef<FxSheetMethods>(null);

  const [selectedMode, setSelectedMode] = useState<EBloxInteractionType>(EBloxInteractionType.OfficeBloxUnit);
  const [resetingBloxHotspot, setResetingBloxHotspot] = useState(false);
  const [rebootingBlox, setRebootingBlox] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [loadingBloxSpace, setLoadingBloxSpace] = useState(false);
  /** Peer id whose sequential first load (connection → space) has completed. */
  const [loadedPeerId, setLoadedPeerId] = useState<string | null>(null);
  const loadStartedFor = useRef<Set<string>>(new Set());

  const fulaIsReady = useUserProfileStore((state) => state.fulaIsReady);
  const fulaReadyForPeerId = useUserProfileStore((state) => state.fulaReadyForPeerId);
  const password = useUserProfileStore((state) => state.password);
  const signiture = useUserProfileStore((state) => state.signiture);

  const bloxs = useBloxsStore((state) => state.bloxs);
  const bloxsSpaceInfo = useBloxsStore((state) => state.bloxsSpaceInfo);
  const folderSizeInfo = useBloxsStore((state) => state.folderSizeInfo);
  const currentBloxPeerId = useBloxsStore((state) => state.currentBloxPeerId);
  const bloxsConnectionStatus = useBloxsStore((state) => state.bloxsConnectionStatus);
  const checkBloxConnection = useBloxsStore((state) => state.checkBloxConnection);
  const getBloxSpace = useBloxsStore((state) => state.getBloxSpace);
  const getFolderSize = useBloxsStore((state) => state.getFolderSize);
  const removeBlox = useBloxsStore((state) => state.removeBlox);
  const updateBlox = useBloxsStore((state) => state.updateBlox);

  const bloxInteractions = useMemo(
    () => Object.values(bloxs || {}).map<TBloxInteraction>((blox) => ({ peerId: blox.peerId, title: blox.name })),
    [bloxs],
  );
  const currentBlox = currentBloxPeerId ? bloxs[currentBloxPeerId] : undefined;
  const currentBloxSpaceInfo = currentBloxPeerId ? bloxsSpaceInfo?.[currentBloxPeerId] : undefined;
  const currentFolderSizeInfo = currentBloxPeerId ? folderSizeInfo?.[currentBloxPeerId] : undefined;
  const currentConnectionStatus = currentBloxPeerId ? bloxsConnectionStatus?.[currentBloxPeerId] : undefined;
  const modeTitle = t(BLOX_INTERACTIONS.find((i) => i.mode === selectedMode)?.titleKey ?? 'main.blox.interaction.unit');

  // Lazy-fetch the cluster peer id when missing / stale (a migration may have set it to the kubo peer id). Runs
  // only once the connection is confirmed so it does not compete with checkConnection (refetch on CONNECTED).
  useEffect(() => {
    if (
      currentConnectionStatus === 'CONNECTED' &&
      currentBloxPeerId &&
      currentBlox &&
      (!currentBlox.clusterPeerId || currentBlox.clusterPeerId === currentBloxPeerId)
    ) {
      fxblox
        .getClusterInfo()
        .then((info) => {
          if (info?.cluster_peer_id) updateBlox({ peerId: currentBloxPeerId, clusterPeerId: info.cluster_peer_id });
        })
        .catch(() => undefined);
    }
  }, [currentConnectionStatus, currentBloxPeerId, currentBlox, updateBlox]);

  const updateBloxSpace = useCallback(async () => {
    try {
      setLoadingBloxSpace(true);
      if (fulaIsReady) {
        const space = await getBloxSpace();
        await getFolderSize();
        logger.log('updateBloxSpace', space);
      }
    } catch (error) {
      logger.logError('GetBloxSpace Error', error);
    } finally {
      setLoadingBloxSpace(false);
    }
  }, [fulaIsReady, getBloxSpace, getFolderSize, logger]);

  // Only act when the shared client is ready for THE SELECTED blox (audit M4/S2), once per blox.
  const readyForCurrent = fulaIsReady && fulaReadyForPeerId === currentBloxPeerId;
  useEffect(() => {
    if (!readyForCurrent || !currentBloxPeerId) return;
    if (!loadStartedFor.current.has(currentBloxPeerId)) {
      loadStartedFor.current.add(currentBloxPeerId);
      // Chain sequentially to avoid concurrent fula lock conflicts.
      void (async () => {
        try {
          await checkBloxConnection();
          await updateBloxSpace();
        } catch (error) {
          console.log('BloxScreen: sequential load error', error);
        } finally {
          setLoadedPeerId(currentBloxPeerId);
        }
      })();
    } else if (!bloxsConnectionStatus[currentBloxPeerId]) {
      void checkBloxConnection();
    }
  }, [readyForCurrent, currentBloxPeerId, bloxsConnectionStatus, checkBloxConnection, updateBloxSpace]);

  const handleSelectMode = (mode: EBloxInteractionType) => {
    setSelectedMode(mode);
    bloxInteractionModalRef.current?.close();
  };

  const handleOnConnectionOptionSelect = async (type: ConnectionOptionsType) => {
    connectionOptionsSheetRef.current?.close();
    switch (type) {
      case 'RETRY':
        if (fulaIsReady) {
          try {
            // More retries when the user explicitly clicks Retry.
            void checkBloxConnection(5, 10);
          } catch (error) {
            logger.logError('handleOnConnectionOptionSelect:checkBloxConnection', error);
          }
        } else if (password && signiture && currentBloxPeerId) {
          try {
            const Helper = await import('@/utils/helper');
            await Helper.initFula({ password, signiture, bloxPeerId: currentBloxPeerId });
            void checkBloxConnection();
          } catch (error) {
            logger.logError('handleOnConnectionOptionSelect:initFula', error);
          }
        }
        break;
      case 'CONNECT-TO-WIFI': {
        // LNA-aware hotspot probe (Chrome asks for local-network permission on the fetch itself).
        try {
          await lanFetch(HOTSPOT_PROBE_URL, { method: 'GET', timeoutMs: HOTSPOT_PROBE_TIMEOUT_MS });
        } catch (error) {
          console.log('Failed to connect to FxBlox hotspot:', error);
          if (isLanHttpError(error) && error.kind === 'lna-denied') {
            queueToast({
              type: 'error',
              title: t('main.blox.connectToWifi.failedTitle'),
              message: t('main.blox.connectToWifi.lnaDeniedMessage'),
            });
          } else if (isLanHttpError(error) && error.kind === 'http') {
            queueToast({
              type: 'info',
              title: t('main.blox.connectToWifi.notOnHotspotTitle'),
              message: t('main.blox.connectToWifi.notOnHotspotMessage'),
            });
          } else {
            queueToast({
              type: 'error',
              title: t('main.blox.connectToWifi.failedTitle'),
              message: t('main.blox.connectToWifi.failedMessage'),
            });
          }
        }
        // Mobile navigated in every branch.
        void navigate(paths.setup.connectBlox);
        break;
      }
      default:
        break;
    }
  };

  const handleOnBloxRemovePress = async (peerId: string) => {
    if (Object.values(bloxs)?.length <= 1) {
      await alert({ title: t('main.blox.removeLast.title'), message: t('main.blox.removeLast.message') });
      return;
    }
    const ok = await confirm({
      title: t('main.blox.remove.title'),
      message: t('main.blox.remove.message', { name: bloxs[peerId]?.name }),
      confirmText: t('main.blox.remove.confirm'),
      cancelText: t('main.blox.remove.cancel'),
      destructive: true,
    });
    if (!ok) return;
    bloxInfoSheetRef.current?.close();
    removeBlox(peerId);
  };

  const handleOnClearCachePress = async () => {
    const ok = await confirm({
      title: t('main.blox.clearCache.title'),
      message: t('main.blox.clearCache.message'),
      confirmText: t('main.blox.clearCache.confirm'),
      cancelText: t('main.blox.clearCache.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      setClearingCache(true);
      await clearAppCache();
      bloxInfoSheetRef.current?.close();
      queueToast({
        type: 'success',
        title: t('main.blox.clearCache.successTitle'),
        message: t('main.blox.clearCache.successMessage'),
      });
    } catch (error) {
      queueToast({
        type: 'error',
        title: t('main.blox.clearCache.errorTitle'),
        message: messageOf(error) || t('main.blox.clearCache.errorMessage'),
      });
    } finally {
      setClearingCache(false);
    }
  };

  const handleOnResetToHotspotPress = async (peerId: string) => {
    const ok = await confirm({
      title: t('main.blox.resetHotspot.title'),
      message: t('main.blox.resetHotspot.message', { name: bloxs[peerId]?.name }),
      confirmText: t('main.blox.resetHotspot.confirm'),
      cancelText: t('main.blox.resetHotspot.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      setResetingBloxHotspot(true);
      const result = await fxblox.wifiRemoveall();
      if (result.status) {
        bloxInfoSheetRef.current?.close();
        queueToast({ type: 'success', title: t('main.blox.resetHotspot.successTitle') });
      } else {
        queueToast({
          type: 'error',
          title: t('main.blox.resetHotspot.failedTitle'),
          message: result.msg || t('main.blox.resetHotspot.unsupported'),
        });
      }
    } catch {
      // The Blox drops the connection while it reboots into hotspot mode — mobile reports success here.
      queueToast({ type: 'success', title: t('main.blox.resetHotspot.resetDoneTitle') });
    } finally {
      setResetingBloxHotspot(false);
    }
  };

  const handleOnRebootBloxPress = async (peerId: string) => {
    const ok = await confirm({
      title: t('main.blox.reboot.title'),
      message: t('main.blox.reboot.message', { name: bloxs[peerId]?.name }),
      confirmText: t('main.blox.reboot.confirm'),
      cancelText: t('main.blox.reboot.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      setRebootingBlox(true);
      const result = await fxblox.reboot();
      if (result.status) {
        bloxInfoSheetRef.current?.close();
        queueToast({ type: 'success', title: t('main.blox.reboot.successTitle') });
      } else {
        queueToast({
          type: 'error',
          title: t('main.blox.reboot.failedTitle'),
          message: result.msg || t('main.blox.reboot.unsupported'),
        });
      }
    } catch (error) {
      queueToast({ type: 'error', title: messageOf(error) });
    } finally {
      setRebootingBlox(false);
    }
  };

  const hero = (
    <BloxHero
      bloxs={bloxInteractions}
      modeTitle={modeTitle}
      onChangeMode={() => bloxInteractionModalRef.current?.present()}
      onConnectionPress={() => connectionOptionsSheetRef.current?.present()}
      onBloxPress={() => bloxInfoSheetRef.current?.present()}
      onManagePress={() => void navigate(paths.bloxManage)}
    />
  );
  const diagnoseCta = (
    <FxButton
      variant="inverted"
      onPress={() => void navigate(paths.bloxAi({ scenario: 'disconnected' }))}
      testID="blox-screen-diagnose-cta"
    >
      {t('blox.disconnected.diagnoseCta')}
    </FxButton>
  );
  const usageBar =
    currentBloxSpaceInfo?.size != undefined ? (
      <UsageBar
        divisionPercent={currentBloxSpaceInfo.used_percentage || 0}
        totalCapacity={currentBloxSpaceInfo.size || 1000}
      />
    ) : null;
  const deviceCard = (
    <DeviceCard
      onRefreshPress={() => void updateBloxSpace()}
      loading={loadingBloxSpace}
      data={{
        capacity: currentBloxSpaceInfo?.size || 0,
        folderInfo: (currentFolderSizeInfo ?? {}) as TBloxFolderSize,
        name: t('main.blox.hardDisks'),
        status: currentBloxSpaceInfo ? EDeviceStatus.InUse : EDeviceStatus.NotAvailable,
        associatedDevices: [t('main.blox.bloxSetUp')],
      }}
    />
  );
  const walletSection = (
    <WalletGate>
      <BloxWalletSection readyForCurrent={readyForCurrent} loadedPeerId={loadedPeerId} currentBloxPeerId={currentBloxPeerId} />
    </WalletGate>
  );
  const notification = (
    <WalletGate silent>
      <WalletNotification compact />
    </WalletGate>
  );

  return (
    <>
      <BloxHeader modeTitle={modeTitle} onChangeMode={() => bloxInteractionModalRef.current?.present()} />
      <MainScreen screen="blox" width="dashboard" className="gap-4" testID="blox-screen">
        {isDesktop ? (
          <>
            {notification}
            <FxCard testID="blox-hero-card">
              {hero}
              <FxBox alignItems="center" marginTop="8">
                {diagnoseCta}
              </FxBox>
            </FxCard>
            <div className="grid grid-cols-2 gap-4" data-testid="blox-desktop-grid">
              <div className="flex min-w-0 flex-col gap-4">
                {deviceCard}
                {usageBar}
              </div>
              <div className="flex min-w-0 flex-col gap-4">{walletSection}</div>
            </div>
          </>
        ) : (
          <>
            {hero}
            {diagnoseCta}
            {notification}
            {usageBar}
            {deviceCard}
            {walletSection}
          </>
        )}
      </MainScreen>

      <BloxInteractionModal ref={bloxInteractionModalRef} selectedMode={selectedMode} onSelectMode={handleSelectMode} />
      <BloxInfoSheet
        ref={bloxInfoSheetRef}
        bloxInfo={currentBlox}
        onBloxRemovePress={(peerId) => void handleOnBloxRemovePress(peerId)}
        onResetToHotspotPress={(peerId) => void handleOnResetToHotspotPress(peerId)}
        onRebootBloxPress={(peerId) => void handleOnRebootBloxPress(peerId)}
        onClearCachePress={() => void handleOnClearCachePress()}
        resetingBloxHotspot={resetingBloxHotspot}
        rebootingBlox={rebootingBlox}
        clearingCache={clearingCache}
      />
      <ConnectionOptionsSheet
        ref={connectionOptionsSheetRef}
        onSelected={(type) => void handleOnConnectionOptionSelect(type)}
      />
    </>
  );
}

/**
 * Port of apps/box/src/screens/BloxManager.screen.tsx — an auto-fill grid of Blox cards (FxStatusDot, per-card
 * Status / Open), "Check All" (disabled while any check runs). The Android foreground service is gone: the checks
 * run only while the tab is open (note under the header).
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FxBloxIcon,
  FxBox,
  FxButton,
  FxCard,
  FxPageHeader,
  FxRefreshIcon,
  FxStatusDot,
  FxText,
  cn,
} from '@functionland/fx-ui';
import { paths } from '@/app/paths';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useBloxsStore } from '@/stores/useBloxsStore';
import type { TBloxConectionStatus } from '@/models/blox';
import { MainScreen } from '@/components/main/MainScreen';
import { useEnsureFulaClient } from '@/components/main/useEnsureFulaClient';
import { isBusyStatus, statusLabelKey, statusToColor, statusToDot } from '@/components/main/bloxStatus';

interface BloxGridItemProps {
  peerId: string;
  name: string;
  isCurrent: boolean;
  connectionStatus?: TBloxConectionStatus;
  onOpen: (peerId: string) => void;
  onCheckStatus: (peerId: string) => void;
}

function BloxGridItem({ peerId, name, isCurrent, connectionStatus, onOpen, onCheckStatus }: BloxGridItemProps) {
  const { t } = useTranslation();
  const isChecking = isBusyStatus(connectionStatus);
  const statusLabel = t(statusLabelKey(connectionStatus));
  return (
    <li className="min-w-0 list-none" data-peer-id={peerId} data-current={isCurrent}>
    <FxCard
      alignItems="center"
      padding="12"
      gap="8"
      borderWidth={isCurrent ? 2 : 1}
      borderColor={isCurrent ? 'primary' : 'border'}
      backgroundColor={isCurrent ? 'backgroundSecondary' : 'backgroundPrimary'}
      aria-label={t('main.bloxManager.card', { name, status: statusLabel })}
      aria-current={isCurrent ? 'true' : undefined}
      className="h-full"
      testID={`blox-card-${peerId}`}
    >
      <FxBloxIcon width={48} height={48} color={isCurrent ? 'primary' : 'content2'} />
      <FxText variant="bodySmallRegular" color="content1" numberOfLines={1} textAlign="center" className="w-full">
        {name}
      </FxText>
      <FxBox flexDirection="row" alignItems="center" gap="4">
        <FxStatusDot status={statusToDot(connectionStatus)} label={null} />
        <FxText variant="bodyXSRegular" color={statusToColor(connectionStatus)} numberOfLines={1}>
          {statusLabel}
        </FxText>
      </FxBox>
      <FxButton
        size="small"
        variant="inverted"
        onPress={() => onCheckStatus(peerId)}
        disabled={isChecking}
        loading={isChecking}
        className="w-full"
        testID={`blox-card-${peerId}-status`}
      >
        {t('main.bloxManager.status')}
      </FxButton>
      <FxButton
        size="small"
        onPress={() => onOpen(peerId)}
        disabled={isCurrent}
        className="w-full"
        testID={`blox-card-${peerId}-open`}
      >
        {isCurrent ? t('main.bloxManager.current') : t('main.bloxManager.open')}
      </FxButton>
    </FxCard>
    </li>
  );
}

export default function BloxManager() {
  const { t } = useTranslation();
  const { back } = useAppNavigate();
  useEnsureFulaClient();

  const bloxs = useBloxsStore((state) => state.bloxs);
  const currentBloxPeerId = useBloxsStore((state) => state.currentBloxPeerId);
  const bloxsConnectionStatus = useBloxsStore((state) => state.bloxsConnectionStatus);
  const switchToBlox = useBloxsStore((state) => state.switchToBlox);
  const checkBloxConnection = useBloxsStore((state) => state.checkBloxConnection);
  const checkAllBloxStatus = useBloxsStore((state) => state.checkAllBloxStatus);
  const isCheckingAll = useBloxsStore((state) => state._isCheckingAllStatus);

  const anyBloxBusy = Object.values(bloxsConnectionStatus).some(isBusyStatus);
  const checkAllDisabled = isCheckingAll || anyBloxBusy;

  const bloxList = Object.entries(bloxs || {}).map(([peerId, blox]) => ({ peerId, name: blox.name }));

  const handleOpen = useCallback(
    (peerId: string) => {
      if (peerId === currentBloxPeerId) return;
      void switchToBlox(peerId);
      back(paths.blox);
    },
    [currentBloxPeerId, switchToBlox, back],
  );

  const handleCheckStatus = useCallback(
    (peerId: string) => {
      if (peerId === currentBloxPeerId) {
        void checkBloxConnection(1, 5);
      } else {
        // Non-current blox — must switch to it (which also checks).
        void switchToBlox(peerId);
      }
    },
    [currentBloxPeerId, checkBloxConnection, switchToBlox],
  );

  const handleCheckAllStatus = useCallback(async () => {
    if (checkAllDisabled) return;
    await checkAllBloxStatus();
  }, [checkAllDisabled, checkAllBloxStatus]);

  return (
    <MainScreen screen="blox-manager" width="dashboard" testID="blox-manager-screen">
      <FxPageHeader
        title={t('main.bloxManager.title')}
        onBack={() => back(paths.blox)}
        backLabel={t('main.common.back')}
        actions={
          <FxButton
            size="small"
            iconLeft={<FxRefreshIcon width={14} height={14} />}
            onPress={() => void handleCheckAllStatus()}
            disabled={checkAllDisabled}
            loading={isCheckingAll}
            testID="blox-manager-check-all"
          >
            {checkAllDisabled ? t('main.bloxManager.checking') : t('main.bloxManager.checkAll')}
          </FxButton>
        }
      />
      <FxText variant="bodyXSRegular" color="content3" marginBottom="16" testID="blox-manager-note">
        {t('main.bloxManager.keepTabOpen')}
      </FxText>
      {bloxList.length === 0 ? (
        <FxText variant="bodySmallRegular" color="content2">
          {t('main.bloxManager.empty')}
        </FxText>
      ) : (
        <ul
          aria-label={t('main.bloxManager.grid')}
          data-testid="blox-manager-grid"
          className={cn('m-0 grid list-none gap-3 p-0', '[grid-template-columns:repeat(auto-fill,minmax(170px,1fr))]')}
        >
          {bloxList.map((item) => (
            <BloxGridItem
              key={item.peerId}
              peerId={item.peerId}
              name={item.name}
              isCurrent={item.peerId === currentBloxPeerId}
              connectionStatus={bloxsConnectionStatus[item.peerId]}
              onOpen={handleOpen}
              onCheckStatus={handleCheckStatus}
            />
          ))}
        </ul>
      )}
    </MainScreen>
  );
}

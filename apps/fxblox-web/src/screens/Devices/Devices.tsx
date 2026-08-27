/**
 * Port of apps/box/src/screens/Devices.screen.tsx — title, the FxHeader list/grid toggle and one DeviceCard
 * (current Blox's disk) in a 560px column.
 */
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxHeader, FxText } from '@functionland/fx-ui';
import { useLogger } from '@/hooks/useLogger';
import { useBloxsStore } from '@/stores/useBloxsStore';
import { useUserProfileStore } from '@/stores/useUserProfileStore';
import { EDeviceStatus, type TBloxFolderSize } from '@/models';
import { MainScreen } from '@/components/main/MainScreen';
import { useEnsureFulaClient } from '@/components/main/useEnsureFulaClient';
import { DeviceCard } from '@/components/Cards/DeviceCard';

export default function Devices() {
  const { t } = useTranslation();
  const [isList, setIsList] = useState<boolean>(false);
  const [loadingBloxSpace, setLoadingBloxSpace] = useState(false);
  const logger = useLogger();
  useEnsureFulaClient();
  const bloxsSpaceInfo = useBloxsStore((state) => state.bloxsSpaceInfo);
  const folderSizeInfo = useBloxsStore((state) => state.folderSizeInfo);
  const currentBloxPeerId = useBloxsStore((state) => state.currentBloxPeerId);
  const getBloxSpace = useBloxsStore((state) => state.getBloxSpace);
  const getFolderSize = useBloxsStore((state) => state.getFolderSize);
  const fulaIsReady = useUserProfileStore((state) => state.fulaIsReady);
  const currentBloxSpaceInfo = useMemo(
    () => (currentBloxPeerId ? bloxsSpaceInfo?.[currentBloxPeerId] : undefined),
    [bloxsSpaceInfo, currentBloxPeerId],
  );
  const currentFolderSizeInfo = useMemo(
    () => (currentBloxPeerId ? folderSizeInfo?.[currentBloxPeerId] : undefined),
    [folderSizeInfo, currentBloxPeerId],
  );

  const updateBloxSpace = useCallback(async () => {
    try {
      setLoadingBloxSpace(true);
      if (fulaIsReady) {
        const space = await getBloxSpace();
        logger.log('updateBloxSpace', space);
        await getFolderSize();
      }
    } catch (error) {
      logger.logError('GetBloxSpace Error', error);
    } finally {
      setLoadingBloxSpace(false);
    }
  }, [fulaIsReady, getBloxSpace, getFolderSize, logger]);

  return (
    <MainScreen screen="devices" width="narrow" testID="devices-screen">
      <FxBox paddingVertical="12">
        <FxText as="h1" variant="h300">
          {t('main.devices.title')}
        </FxText>
        <FxHeader title={t('main.devices.allCards')} isList={isList} setIsList={setIsList} marginTop="24" />
      </FxBox>
      <DeviceCard
        onRefreshPress={() => void updateBloxSpace()}
        loading={loadingBloxSpace}
        data={{
          capacity: currentBloxSpaceInfo?.size || 0,
          folderInfo: (currentFolderSizeInfo ?? {}) as TBloxFolderSize,
          name: t('main.devices.hardDisk'),
          status: currentBloxSpaceInfo ? EDeviceStatus.InUse : EDeviceStatus.NotAvailable,
          associatedDevices: [t('main.devices.bloxSetUp')],
        }}
        data-layout={isList ? 'list' : 'grid'}
      />
    </MainScreen>
  );
}

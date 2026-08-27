/**
 * Port of apps/box/src/components/Cards/ConnectedDevicesCard.tsx (`DeviceCard` + `ConnectedDevicesCard`).
 * The long-press bottom sheet became a kebab `FxIconButton` → actions FxSheet (LED sequence + Format via
 * `confirm()` → `fxblox.partition()`); the CardCarousel became a plain list.
 */
import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxCard,
  FxIconButton,
  FxLedSequence,
  FxLoadingSpinner,
  FxOptionsVerticalIcon,
  FxRefreshIcon,
  FxSheet,
  FxTag,
  FxText,
  FxTrashIcon,
  convertByteToCapacityUnit,
  convertPascalToSentence,
  useConfirm,
  useToast,
  type FxCardProps,
  type FxSheetMethods,
} from '@functionland/fx-ui';
import { fxblox } from '@/lib/fula';
import { EDeviceStatus, type TDevice } from '@/models';
import { EmptyCard } from './EmptyCard';

export type DeviceCardProps = Omit<FxCardProps, 'children' | 'onPress' | 'onLongPress' | 'href'> & {
  data: TDevice;
  showEject?: boolean;
  loading?: boolean;
  onRefreshPress?: () => void;
  children?: ReactNode;
};

/** `convertByteToCapacityUnit` of a parsed number, or `—` when the folder info is missing (mobile printed "NaN KB"). */
function bytesOf(raw: string | number | undefined): string {
  const n = typeof raw === 'number' ? raw : parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? convertByteToCapacityUnit(n) : '—';
}

/** The LED sequence the Blox shows while formatting (purple → light green → black → light blue → green). */
export const FORMAT_LED_STEPS = [
  { color: 'purple' },
  { color: 'lightgreen' },
  { color: 'black' },
  { color: 'lightblue' },
  { color: 'green' },
].map((s) => ({ ...s, offInterval: 0 }));

export function DeviceCard({ data, showEject, loading, onRefreshPress, children, testID = 'device-card', ...rest }: DeviceCardProps) {
  const sheetRef = useRef<FxSheetMethods>(null);
  const { name, capacity, folderInfo, status, associatedDevices, used, free } = data;
  const { queueToast } = useToast();
  const { confirm } = useConfirm();
  const { t } = useTranslation();

  const fulaCount = parseInt(folderInfo?.fulaCount ?? '', 10);

  const onFormat = async () => {
    const ok = await confirm({
      title: t('connectedDevicesCard.formatAllPartitions'),
      message: t('connectedDevicesCard.formatConfirmation'),
      confirmText: t('connectedDevicesCard.yes'),
      cancelText: t('connectedDevicesCard.no'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await fxblox.partition();
      console.log('partition sent');
      queueToast({
        type: 'success',
        title: t('connectedDevicesCard.requestSent'),
        message: t('connectedDevicesCard.partitionRequestMessage'),
      });
      sheetRef.current?.close();
    } catch (error) {
      queueToast({
        type: 'error',
        title: t('main.common.error'),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <FxCard testID={testID} {...rest}>
      <FxBox flexDirection="row" justifyContent="space-between" alignItems="flex-start" gap="8">
        <FxCard.Title marginBottom="8">{name}</FxCard.Title>
        <FxBox flexDirection="row" alignItems="center" gap="4" flexShrink={0}>
          {loading ? (
            <FxLoadingSpinner width={20} height={20} />
          ) : (
            onRefreshPress && (
              <FxIconButton
                aria-label={t('main.deviceCard.refresh')}
                icon={<FxRefreshIcon />}
                color="content3"
                onPress={onRefreshPress}
                testID={`${testID}-refresh`}
              />
            )
          )}
          <FxIconButton
            aria-label={t('main.deviceCard.actions')}
            icon={<FxOptionsVerticalIcon />}
            color="content3"
            onPress={() => sheetRef.current?.present()}
            testID={`${testID}-actions`}
          />
        </FxBox>
      </FxBox>
      <FxBox flexDirection="row" flexWrap="wrap" gap="8" marginBottom="16">
        {associatedDevices.map((deviceName) => (
          <FxTag key={`${name}-${deviceName}`}>{deviceName}</FxTag>
        ))}
      </FxBox>
      <FxCard.Row>
        <FxCard.Row.Title>{t('connectedDevicesCard.capacity')}</FxCard.Row.Title>
        <FxCard.Row.Data>{convertByteToCapacityUnit(capacity)}</FxCard.Row.Data>
      </FxCard.Row>
      <FxCard.Row>
        <FxCard.Row.Title>{t('connectedDevicesCard.storedFiles')}</FxCard.Row.Title>
        <FxCard.Row.Data>
          {bytesOf(folderInfo?.fula)} ({Number.isFinite(fulaCount) ? fulaCount : '—'})
        </FxCard.Row.Data>
      </FxCard.Row>
      <FxCard.Row>
        <FxCard.Row.Title>{t('connectedDevicesCard.otherData')}</FxCard.Row.Title>
        <FxCard.Row.Data>{bytesOf(folderInfo?.chain)}</FxCard.Row.Data>
      </FxCard.Row>
      <FxCard.Row>
        <FxCard.Row.Title>{t('connectedDevicesCard.userOwnData')}</FxCard.Row.Title>
        <FxCard.Row.Data>{bytesOf(folderInfo?.userOwnData)}</FxCard.Row.Data>
      </FxCard.Row>
      {used != undefined && (
        <FxCard.Row>
          <FxCard.Row.Title>{t('connectedDevicesCard.used')}</FxCard.Row.Title>
          <FxCard.Row.Data>{convertByteToCapacityUnit(used)}</FxCard.Row.Data>
        </FxCard.Row>
      )}
      {free != undefined && (
        <FxCard.Row>
          <FxCard.Row.Title>{t('connectedDevicesCard.free')}</FxCard.Row.Title>
          <FxCard.Row.Data>{convertByteToCapacityUnit(free)}</FxCard.Row.Data>
        </FxCard.Row>
      )}
      <FxCard.Row>
        <FxCard.Row.Title>{t('connectedDevicesCard.status')}</FxCard.Row.Title>
        <FxBox flexDirection="row" alignItems="center" gap="4">
          <FxCard.Row.Data
            color={status === EDeviceStatus.NotAvailable ? 'errorBase' : 'content2'}
            testID={`${testID}-status`}
          >
            {convertPascalToSentence(EDeviceStatus[status] ?? '')}
          </FxCard.Row.Data>
          {status === EDeviceStatus.BackingUp && <FxLoadingSpinner width={16} height={16} />}
        </FxBox>
      </FxCard.Row>
      {showEject && (
        <FxButton disabled={status === EDeviceStatus.BackingUp}>{t('connectedDevicesCard.ejectDevice')}</FxButton>
      )}
      {children}

      <FxSheet ref={sheetRef} title={t('connectedDevicesCard.deviceActions')} testID={`${testID}-actions-sheet`}>
        <FxBox alignItems="center" paddingVertical="16" gap="16">
          <FxLedSequence steps={FORMAT_LED_STEPS} direction="row" size={16} />
          <FxText variant="bodySmallRegular" textAlign="center">
            {t('connectedDevicesCard.formatWarning')}
          </FxText>
          <FxButton
            variant="destructive"
            iconLeft={<FxTrashIcon />}
            paddingHorizontal="16"
            onPress={() => void onFormat()}
            testID={`${testID}-format`}
          >
            {t('connectedDevicesCard.format')}
          </FxButton>
        </FxBox>
      </FxSheet>
    </FxCard>
  );
}

export interface ConnectedDevicesCardProps {
  showCardHeader?: boolean;
  data: TDevice[];
}

export function ConnectedDevicesCard({ showCardHeader = true, data }: ConnectedDevicesCardProps) {
  const { t } = useTranslation();
  return (
    <>
      {showCardHeader && (
        <FxText variant="h200" color="content1" marginBottom="8" paddingVertical="8">
          {t('connectedDevicesCard.title')}
        </FxText>
      )}
      {data.length === 0 ? (
        <EmptyCard placeholder={t('connectedDevicesCard.noConnectedDevices')} />
      ) : (
        <FxBox gap="16">
          {data.map((device) => (
            <DeviceCard key={device.name} data={device} />
          ))}
        </FxBox>
      )}
    </>
  );
}

export default DeviceCard;

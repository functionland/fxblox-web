/**
 * The "Hard Disk" card of SetBloxAuthorizer — the subset of the mobile `DeviceCard` (Cards/ConnectedDevicesCard)
 * the setup flow shows: name, "Blox Set Up" tag, capacity / used / free, status, refresh, and a slot for the
 * Format Disk button. (The full DeviceCard with folder sizes belongs to the Blox tab.)
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxCard,
  FxIconButton,
  FxRefreshIcon,
  FxSpinner,
  FxTag,
  convertByteToCapacityUnit,
} from '@functionland/fx-ui';

export interface DiskCardProps {
  name: string;
  tag?: string;
  capacity: number;
  used?: number;
  free?: number;
  /** `true` when a filesystem is reported (mobile `EDeviceStatus.InUse`), else "Not available". */
  available: boolean;
  loading?: boolean;
  onRefresh?: () => void;
  children?: ReactNode;
}

export function DiskCard({
  name,
  tag,
  capacity,
  used,
  free,
  available,
  loading,
  onRefresh,
  children,
}: DiskCardProps) {
  const { t } = useTranslation();
  return (
    <FxCard testID="disk-card">
      <FxBox flexDirection="row" justifyContent="space-between" alignItems="center">
        <FxCard.Title marginBottom="8">{name}</FxCard.Title>
        {loading ? (
          <FxSpinner label={t('setup.common.loading')} />
        ) : (
          onRefresh && (
            <FxIconButton
              aria-label={t('setup.common.refresh')}
              icon={<FxRefreshIcon />}
              color="content3"
              onPress={onRefresh}
            />
          )
        )}
      </FxBox>
      {tag && (
        <FxBox flexDirection="row" marginBottom="16">
          <FxTag marginRight="8">{tag}</FxTag>
        </FxBox>
      )}
      <FxCard.Row>
        <FxCard.Row.Title>{t('connectedDevicesCard.capacity')}</FxCard.Row.Title>
        <FxCard.Row.Data>{convertByteToCapacityUnit(capacity)}</FxCard.Row.Data>
      </FxCard.Row>
      {used !== undefined && (
        <FxCard.Row>
          <FxCard.Row.Title>{t('connectedDevicesCard.used')}</FxCard.Row.Title>
          <FxCard.Row.Data>{convertByteToCapacityUnit(used)}</FxCard.Row.Data>
        </FxCard.Row>
      )}
      {free !== undefined && (
        <FxCard.Row>
          <FxCard.Row.Title>{t('connectedDevicesCard.free')}</FxCard.Row.Title>
          <FxCard.Row.Data>{convertByteToCapacityUnit(free)}</FxCard.Row.Data>
        </FxCard.Row>
      )}
      <FxCard.Row>
        <FxCard.Row.Title>{t('connectedDevicesCard.status')}</FxCard.Row.Title>
        <FxCard.Row.Data color={available ? 'content2' : 'errorBase'}>
          {available ? t('setup.diskCard.inUse') : t('setup.diskCard.notAvailable')}
        </FxCard.Row.Data>
      </FxCard.Row>
      {children}
    </FxCard>
  );
}

export default DiskCard;

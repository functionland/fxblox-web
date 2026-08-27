// Port of apps/box/src/components/BleDeviceSelectionBottomSheet.tsx (FxBottomSheetModal → FxSheet; FlatList → list).
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxCard, FxSheet, FxText, type FxSheetMethods } from '@functionland/fx-ui';
import type { DiscoveredDevice } from '@/utils/ble';

export interface BleDeviceSelectionSheetProps {
  devices: DiscoveredDevice[];
  onSelect: (peripheralId: string) => void;
  onDismiss?: () => void;
  ref?: Ref<FxSheetMethods>;
}

export function BleDeviceSelectionSheet({ devices, onSelect, onDismiss, ref }: BleDeviceSelectionSheetProps) {
  const { t } = useTranslation();
  return (
    <FxSheet ref={ref} title={t('bleDeviceSelection.title')} onDismiss={onDismiss} testID="ble-device-selection">
      <FxText variant="bodySmallRegular" color="content2" marginBottom="16">
        {t('bleDeviceSelection.subtitle')}
      </FxText>
      <FxBox as="ul" className="m-0 list-none p-0" gap="8">
        {devices.map((item) => (
          <li key={item.peripheral.id}>
            <FxCard
              flexDirection="row"
              justifyContent="space-between"
              paddingHorizontal="16"
              paddingVertical="8"
              onPress={() => onSelect(item.peripheral.id)}
              accessibilityLabel={item.peripheral.name ?? item.peripheral.id}
              testID={`ble-device-${item.peripheral.id}`}
            >
              <FxBox flexDirection="row" justifyContent="space-between" alignItems="center" gap="12">
                <FxBox flex={1} minWidth={0}>
                  <FxText variant="bodyMediumRegular">{item.peripheral.name}</FxText>
                  <FxText variant="bodyXXSRegular" color="content3" numberOfLines={1}>
                    {item.peripheral.id}
                  </FxText>
                </FxBox>
                <FxText variant="bodySmallRegular" color="content2">
                  {t('bleDeviceSelection.signal')}: {item.rssi} dBm
                </FxText>
              </FxBox>
            </FxCard>
          </li>
        ))}
      </FxBox>
    </FxSheet>
  );
}

export default BleDeviceSelectionSheet;

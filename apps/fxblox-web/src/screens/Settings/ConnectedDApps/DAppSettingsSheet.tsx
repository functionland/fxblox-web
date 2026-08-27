/**
 * Port of apps/box/src/screens/Settings/ConnectedDApps/modals/DAppSettingsModal.tsx (+ DoneButton). The
 * "{name} settings" button shows the mobile "Coming soon" alert; "Clear app data from Blox" opens the
 * ClearDAppSheet; Done closes through `useFxSheet().close()`.
 */
import { useRef, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxCard,
  FxExternalLinkIcon,
  FxSheet,
  FxTag,
  useConfirm,
  useFxSheet,
  type FxSheetMethods,
} from '@functionland/fx-ui';
import type { TDApp } from '@/models';
import fileSyncLogo from '@/assets/images/file_sync_logo.png';
import { RowDetails } from './DAppCard';
import { ClearDAppSheet } from './ClearDAppSheet';

export function DoneButton() {
  const { t } = useTranslation();
  const { close } = useFxSheet();
  return (
    <FxButton size="large" marginTop="16" onPress={() => close()} testID="dapp-settings-done">
      {t('settings.dapps.done')}
    </FxButton>
  );
}

export interface DAppSettingsSheetProps {
  dApp?: TDApp | null;
  onClearDataPress?: () => void;
  ref?: Ref<FxSheetMethods>;
}

export function DAppSettingsSheet({ dApp, onClearDataPress, ref }: DAppSettingsSheetProps) {
  const { t } = useTranslation();
  const { alert } = useConfirm();
  const clearDAppSheetRef = useRef<FxSheetMethods>(null);
  if (!dApp) return null;
  const { name, tag } = dApp;
  return (
    <>
      <FxSheet
        ref={ref}
        title={t('settings.dapps.settings', { name })}
        testID="dapp-settings-sheet"
      >
        <FxBox alignItems="center" marginTop="24">
          <img
            src={fileSyncLogo}
            alt={t('settings.dapps.logoAlt', { name })}
            width={64}
            height={64}
            className="size-16 object-contain"
            draggable={false}
          />
          <FxCard.Title marginTop="16">{name}</FxCard.Title>
          {tag && <FxTag marginTop="4">{tag}</FxTag>}
        </FxBox>
        <FxButton
          marginTop="24"
          marginBottom="12"
          size="large"
          iconLeft={<FxExternalLinkIcon />}
          onPress={() => void alert({ title: t('settings.dapps.comingSoon') })}
          testID="dapp-settings-open"
        >
          {t('settings.dapps.settings', { name })}
        </FxButton>
        <RowDetails data={dApp} />
        <FxButton
          variant="inverted"
          marginTop="32"
          size="large"
          onPress={() => {
            onClearDataPress?.();
            clearDAppSheetRef.current?.present();
          }}
          testID="dapp-settings-clear"
        >
          {t('settings.dapps.clearData')}
        </FxButton>
        <DoneButton />
      </FxSheet>
      <ClearDAppSheet ref={clearDAppSheetRef} />
    </>
  );
}

export default DAppSettingsSheet;

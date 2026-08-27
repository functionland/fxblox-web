/**
 * Port of apps/box/src/screens/Settings/ConnectedDApps/modals/ClearDAppModal.tsx. Both buttons close the
 * sheet through `useFxSheet().close()` — on mobile "Confirm" called an undefined global `close()` (no data
 * clearing exists yet), so the web keeps the same visible behaviour without the crash.
 */
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { FxButton, FxSheet, FxText, useFxSheet, type FxSheetMethods } from '@functionland/fx-ui';

function CancelButton() {
  const { t } = useTranslation();
  const { close } = useFxSheet();
  return (
    <FxButton marginTop="32" variant="inverted" onPress={() => close()} testID="clear-dapp-cancel">
      {t('settings.dapps.clear.cancel')}
    </FxButton>
  );
}

function ConfirmButton({ onConfirm }: { onConfirm?: () => void }) {
  const { t } = useTranslation();
  const { close } = useFxSheet();
  return (
    <FxButton
      marginTop="16"
      onPress={() => {
        onConfirm?.();
        close();
      }}
      testID="clear-dapp-confirm"
    >
      {t('settings.dapps.clear.confirm')}
    </FxButton>
  );
}

export interface ClearDAppSheetProps {
  onConfirm?: () => void;
  ref?: Ref<FxSheetMethods>;
}

export function ClearDAppSheet({ onConfirm, ref }: ClearDAppSheetProps) {
  const { t } = useTranslation();
  return (
    <FxSheet ref={ref} title={t('settings.dapps.clearData')} testID="clear-dapp-sheet">
      <FxText as="h2" variant="h200" color="content1" textAlign="center" marginTop="32">
        {t('settings.dapps.clear.title')}
      </FxText>
      <FxText variant="bodySmallLight" color="content1" textAlign="center" marginTop="8">
        {t('settings.dapps.clear.message')}
      </FxText>
      <CancelButton />
      <ConfirmButton onConfirm={onConfirm} />
    </FxSheet>
  );
}

export default ClearDAppSheet;

// Port of apps/box/src/screens/Diagnostics/SharePhoneContextModal.tsx — literal JSON preview (never auto-redacted).
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxCodeBlock, FxDialog, FxText } from '@functionland/fx-ui';
import type { PhoneContext } from '@/utils/clientLogger';

export interface SharePhoneContextModalProps {
  phoneContext: PhoneContext | null;
  onConfirm: () => void;
  onCancel: () => void;
  sending?: boolean;
}

export function SharePhoneContextModal({ phoneContext, onConfirm, onCancel, sending = false }: SharePhoneContextModalProps) {
  const { t } = useTranslation();
  const pretty = phoneContext ? JSON.stringify(phoneContext, null, 2) : '';
  return (
    <FxDialog
      open={phoneContext !== null}
      onOpenChange={(open) => {
        if (!open && !sending) onCancel();
      }}
      title={t('diagnostics.sharePhoneContext.title')}
      description={t('diagnostics.sharePhoneContext.privacyAssurance')}
      dismissible={!sending}
      size="lg"
      closeLabel={t('diagnostics.sharePhoneContext.cancel')}
      testID="share-phone-context-modal"
      footer={
        <>
          <FxButton variant="inverted" onPress={onCancel} disabled={sending} testID="share-phone-context-cancel">
            {t('diagnostics.sharePhoneContext.cancel')}
          </FxButton>
          <FxButton onPress={onConfirm} disabled={sending} loading={sending} testID="share-phone-context-confirm">
            {t('diagnostics.sharePhoneContext.confirm')}
          </FxButton>
        </>
      }
    >
      <FxBox gap="8">
        <FxText variant="bodySmallRegular">{t('diagnostics.sharePhoneContext.preview')}</FxText>
        <FxCodeBlock code={pretty} language="json" maxHeight={360} wrap testID="share-phone-context-preview" />
      </FxBox>
    </FxDialog>
  );
}

export default SharePhoneContextModal;

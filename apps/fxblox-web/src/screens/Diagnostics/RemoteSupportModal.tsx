// Port of apps/box/src/screens/Diagnostics/RemoteSupportModal.tsx — security-code gate for "Enable remote support".
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxDialog, FxText, FxTextInput } from '@functionland/fx-ui';

export interface RemoteSupportModalProps {
  visible: boolean;
  onConfirm: (securityCode: string) => void;
  onCancel: () => void;
  busy?: boolean;
  resultMessage?: string | null;
  resultOk?: boolean;
}

export function RemoteSupportModal({
  visible,
  onConfirm,
  onCancel,
  busy = false,
  resultMessage = null,
  resultOk = false,
}: RemoteSupportModalProps) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');

  useEffect(() => {
    if (!visible) setCode('');
  }, [visible]);

  const ready = code.length === 4 && !busy;

  const handleConfirm = useCallback(() => {
    if (!ready) return;
    onConfirm(code);
  }, [ready, code, onConfirm]);

  const close = useCallback(() => {
    if (busy) return;
    onCancel();
  }, [busy, onCancel]);

  return (
    <FxDialog
      open={visible}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={t('diagnostics.remoteSupport.title')}
      description={t('diagnostics.remoteSupport.explanation')}
      dismissible={!busy}
      closeLabel={t('diagnostics.remoteSupport.cancel')}
      testID="remote-support-modal"
      footer={
        <>
          <FxButton variant="inverted" onPress={close} disabled={busy} testID="remote-support-cancel">
            {t('diagnostics.remoteSupport.cancel')}
          </FxButton>
          <FxButton onPress={handleConfirm} disabled={!ready} loading={busy} testID="remote-support-confirm">
            {busy ? t('diagnostics.remoteSupport.enabling') : t('diagnostics.remoteSupport.confirm')}
          </FxButton>
        </>
      }
    >
      <FxBox gap="8">
        <FxText variant="bodySmallRegular">{t('diagnostics.remoteSupport.securityCodePrompt')}</FxText>
        <FxTextInput
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 4))}
          keyboardType="numeric"
          maxLength={4}
          secureTextEntry
          autoComplete="one-time-code"
          editable={!busy}
          mono
          inputClassName="text-center text-2xl tracking-[0.5em]"
          onSubmitEditing={handleConfirm}
          testID="remote-support-code-input"
        />
        {resultMessage ? (
          <FxText variant="bodySmallRegular" color={resultOk ? 'successBase' : 'errorBase'} role="status" testID="remote-support-result">
            {resultMessage}
          </FxText>
        ) : null}
      </FxBox>
    </FxDialog>
  );
}

export default RemoteSupportModal;

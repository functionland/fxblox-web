/**
 * Port of apps/box/src/screens/Diagnostics/UploadTranscriptModal.tsx — the ONLY central network call of the Blox
 * AI feature (opt-in, default-cancel, full anonymized JSON shown in an FxCodeBlock before Upload, no retry).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxCodeBlock, FxDialog, FxText } from '@functionland/fx-ui';
import type { AnonymizedTranscript } from '@/utils/anonymizeTranscript';
import { TRANSCRIPT_UPLOAD_URL, buildUploadHeaders } from '@/utils/uploadTranscriptUrl';

export interface UploadTranscriptModalProps {
  payload: AnonymizedTranscript | null;
  onUploaded: () => void;
  onDismiss: () => void;
}

type UploadState = 'idle' | 'uploading' | 'error';

export function UploadTranscriptModal({ payload, onUploaded, onDismiss }: UploadTranscriptModalProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<UploadState>('idle');
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const visible = payload !== null;

  const handleUpload = async () => {
    if (!payload) return;
    setState('uploading');
    setErrorDetail(null);
    try {
      const resp = await fetch(TRANSCRIPT_UPLOAD_URL, {
        method: 'POST',
        headers: buildUploadHeaders(payload.consent.anonymizer_version),
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        setState('idle');
        onUploaded();
      } else {
        setState('error');
        // Status code only — never echo the server body.
        setErrorDetail(`HTTP ${resp.status}`);
      }
    } catch {
      setState('error');
      setErrorDetail('network error');
    }
  };

  const close = () => {
    if (state === 'uploading') return;
    setState('idle');
    setErrorDetail(null);
    onDismiss();
  };

  const previewJson = payload ? JSON.stringify(payload, null, 2) : '';

  return (
    <FxDialog
      open={visible}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={t('diagnostics.uploadTranscript.title')}
      description={t('diagnostics.uploadTranscript.subtitle')}
      dismissible={state !== 'uploading'}
      size="lg"
      closeLabel={t('diagnostics.uploadTranscript.cancel')}
      testID="upload-transcript-modal"
      footer={
        <>
          <FxButton variant="inverted" disabled={state === 'uploading'} onPress={close} testID="upload-transcript-cancel">
            {t('diagnostics.uploadTranscript.cancel')}
          </FxButton>
          <FxButton
            disabled={state === 'uploading'}
            loading={state === 'uploading'}
            onPress={() => void handleUpload()}
            testID="upload-transcript-confirm"
          >
            {state === 'uploading' ? t('diagnostics.uploadTranscript.uploading') : t('diagnostics.uploadTranscript.upload')}
          </FxButton>
        </>
      }
    >
      <FxBox gap="8">
        <FxText variant="bodyXSRegular">{t('diagnostics.uploadTranscript.previewIntro')}</FxText>
        <FxCodeBlock code={previewJson} language="json" maxHeight={360} wrap testID="upload-transcript-preview" />
        {state === 'error' && (
          <FxText variant="bodySmallRegular" color="errorBase" role="alert" testID="upload-transcript-error">
            {t('diagnostics.uploadTranscript.errorPrefix')} {errorDetail ?? ''}
          </FxText>
        )}
      </FxBox>
    </FxDialog>
  );
}

export default UploadTranscriptModal;

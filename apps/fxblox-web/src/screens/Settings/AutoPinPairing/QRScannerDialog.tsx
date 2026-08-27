/**
 * Port of apps/box/src/screens/Settings/AutoPinPairing/QRScannerModal.tsx over `platform/qrScanner`:
 * `getUserMedia` into a `<video>` decoded by `BarcodeDetector` (zxing-wasm fallback), plus an image-upload
 * fallback for browsers without camera access. The QR payload is JSON `{ api, endpoint }` — parsed exactly
 * as on mobile.
 */
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxDialog, FxText } from '@functionland/fx-ui';
import { createCameraScanner, isCameraSupported, scanImageFile } from '@/platform/qrScanner';

export type QrParseResult =
  | { ok: true; api: string; endpoint: string }
  | { ok: false; error: 'missingFields' | 'invalidFormat' };

export function parseQrPayload(value: string): QrParseResult {
  try {
    const parsed = JSON.parse(value) as { api?: unknown; endpoint?: unknown } | null;
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.api === 'string' &&
      parsed.api &&
      typeof parsed.endpoint === 'string' &&
      parsed.endpoint
    ) {
      return { ok: true, api: parsed.api, endpoint: parsed.endpoint };
    }
    return { ok: false, error: 'missingFields' };
  } catch {
    return { ok: false, error: 'invalidFormat' };
  }
}

export interface QRScannerDialogProps {
  open: boolean;
  onScanned: (api: string, endpoint: string) => void;
  onClose: () => void;
}

type CameraStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'unavailable';

export function QRScannerDialog({ open, onScanned, onClose }: QRScannerDialogProps) {
  const { t } = useTranslation();
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const hasScanned = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleText = useCallback(
    (value: string) => {
      if (hasScanned.current || !value) return;
      const result = parseQrPayload(value);
      if (result.ok) {
        hasScanned.current = true;
        setError(null);
        onScanned(result.api, result.endpoint);
      } else {
        setError(t(`settings.autopin.qr.${result.error}`));
      }
    },
    [onScanned, t],
  );

  // (Re)start the camera whenever the dialog opens and the <video> is mounted (the dialog is portalled, so
  // the element arrives a commit after `open` flips).
  useEffect(() => {
    if (!open) {
      setStatus('idle');
      return undefined;
    }
    hasScanned.current = false;
    setError(null);
    if (!isCameraSupported()) {
      setStatus('unavailable');
      return undefined;
    }
    if (!video) return undefined;
    setStatus('loading');
    let disposed = false;
    const scanner = createCameraScanner({
      video,
      onResult: (text) => {
        if (!disposed) handleText(text);
      },
    });
    scanner
      .start()
      .then(() => {
        if (!disposed) setStatus('ready');
      })
      .catch((e: unknown) => {
        if (disposed) return;
        const name = (e as { name?: string } | null)?.name;
        setStatus(
          name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable',
        );
      });
    return () => {
      disposed = true;
      scanner.stop();
    };
  }, [open, video, handleText]);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await scanImageFile(file);
    if (!text) setError(t('settings.autopin.qr.noQrInImage'));
    else handleText(text);
  };

  return (
    <FxDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('settings.autopin.qr.title')}
      size="md"
      testID="qr-scanner-dialog"
      footer={
        <FxButton variant="inverted" onPress={onClose} testID="qr-scanner-cancel">
          {t('settings.autopin.qr.cancel')}
        </FxButton>
      }
    >
      <FxBox gap="12">
        <div className="relative aspect-video w-full overflow-hidden rounded-fx-s bg-black">
          <video
            ref={setVideo}
            aria-label={t('settings.autopin.qr.videoLabel')}
            playsInline
            muted
            autoPlay
            className="size-full object-cover"
            data-testid="qr-scanner-video"
          />
          {status !== 'ready' && (
            <div className="absolute inset-0 grid place-items-center p-6">
              <FxText color="white" variant="bodyMediumRegular" textAlign="center" role="status">
                {status === 'denied'
                  ? t('settings.autopin.qr.cameraDenied')
                  : status === 'unavailable'
                    ? t('settings.autopin.qr.cameraUnavailable')
                    : t('settings.autopin.qr.loadingCamera')}
              </FxText>
            </div>
          )}
        </div>

        {error && (
          <FxBox backgroundColor="errorBase" padding="12" borderRadius="s" role="alert">
            <FxText color="white" variant="bodySmallRegular" textAlign="center">
              {error}
            </FxText>
          </FxBox>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onFile(e)}
          data-testid="qr-scanner-file"
        />
        <FxButton
          variant="inverted"
          onPress={() => fileInputRef.current?.click()}
          testID="qr-scanner-upload"
        >
          {t('settings.autopin.qr.uploadImage')}
        </FxButton>
      </FxBox>
    </FxDialog>
  );
}

export default QRScannerDialog;

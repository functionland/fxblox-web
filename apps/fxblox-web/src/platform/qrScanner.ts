/**
 * QrScanner — react-native-vision-camera replacement: getUserMedia + `BarcodeDetector` when the browser has it,
 * `zxing-wasm` (lazy) otherwise, and a still-image decode for the upload fallback.
 */

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string; format?: string }>>;
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

function nativeDetector(): BarcodeDetectorCtor | undefined {
  return (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
}

export type QrDecoder = (source: ImageBitmapSource | ImageData) => Promise<string | null>;

async function zxingDecoder(): Promise<QrDecoder> {
  const mod = await import('zxing-wasm/reader');
  return async (source) => {
    let imageData: ImageData;
    if (source instanceof ImageData) {
      imageData = source;
    } else {
      const bmp = await createImageBitmap(source as ImageBitmapSource);
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(bmp, 0, 0);
      imageData = ctx.getImageData(0, 0, bmp.width, bmp.height);
    }
    const results = await mod.readBarcodes(imageData, { formats: ['QRCode'], tryHarder: true });
    return results[0]?.text ?? null;
  };
}

async function nativeDecoderOrNull(): Promise<QrDecoder | null> {
  const Ctor = nativeDetector();
  if (!Ctor) return null;
  try {
    const formats = (await Ctor.getSupportedFormats?.()) ?? ['qr_code'];
    if (!formats.includes('qr_code')) return null;
    const det = new Ctor({ formats: ['qr_code'] });
    return async (source) => {
      const src = source instanceof ImageData ? await createImageBitmap(source) : source;
      const found = await det.detect(src as ImageBitmapSource);
      return found[0]?.rawValue ?? null;
    };
  } catch {
    return null;
  }
}

export async function getQrDecoder(): Promise<QrDecoder> {
  return (await nativeDecoderOrNull()) ?? zxingDecoder();
}

/** Decode a still image (file upload fallback). */
export async function scanImageFile(file: Blob): Promise<string | null> {
  const decoder = await getQrDecoder();
  try {
    return await decoder(file);
  } catch {
    return null;
  }
}

export interface CameraScanner {
  start(): Promise<void>;
  stop(): void;
}

export interface CameraScannerOptions {
  video: HTMLVideoElement;
  onResult: (text: string) => void;
  onError?: (e: unknown) => void;
  /** Polling interval between decode attempts (ms). */
  intervalMs?: number;
  facingMode?: 'environment' | 'user';
}

export function isCameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

export function createCameraScanner(opts: CameraScannerOptions): CameraScanner {
  let stream: MediaStream | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  return {
    async start() {
      if (!isCameraSupported()) throw new Error('Camera is not available in this browser');
      const decoder = await getQrDecoder();
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: opts.facingMode ?? 'environment' },
        audio: false,
      });
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      opts.video.srcObject = stream;
      await opts.video.play();
      let busy = false;
      timer = setInterval(async () => {
        if (busy || stopped || opts.video.readyState < 2) return;
        busy = true;
        try {
          const text = await decoder(opts.video);
          if (text && !stopped) opts.onResult(text);
        } catch (e) {
          opts.onError?.(e);
        } finally {
          busy = false;
        }
      }, opts.intervalMs ?? 250);
    },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      opts.video.srcObject = null;
    },
  };
}

export const qrScanner = { getQrDecoder, scanImageFile, createCameraScanner, isCameraSupported };

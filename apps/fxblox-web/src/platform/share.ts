/** Share — `navigator.share` with a copy-to-clipboard fallback. */
import { copyToClipboard } from './clipboard';

export interface SharePayload {
  title?: string;
  text?: string;
  url?: string;
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'unavailable';

export async function share(payload: SharePayload): Promise<ShareOutcome> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav?.share) {
    try {
      if (!nav.canShare || nav.canShare(payload)) {
        await nav.share(payload);
        return 'shared';
      }
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return 'cancelled';
    }
  }
  const text = [payload.title, payload.text, payload.url].filter(Boolean).join('\n');
  if (text && (await copyToClipboard(text))) return 'copied';
  return 'unavailable';
}

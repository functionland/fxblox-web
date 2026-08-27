import { useCallback } from 'react';
import { writeClipboard } from './useCopyToClipboard.js';

export interface ShareData {
  title?: string;
  text?: string;
  url?: string;
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

export interface UseShare {
  /** `navigator.share` is available (Chrome desktop/Android; needs a user gesture). */
  canShare: boolean;
  /** Web Share API, falling back to copying `url ?? text ?? title` to the clipboard. */
  share: (data: ShareData) => Promise<ShareResult>;
}

/** RN `Share.share()` replacement: `navigator.share` → clipboard copy fallback. */
export function useShare(): UseShare {
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const share = useCallback(
    async (data: ShareData): Promise<ShareResult> => {
      if (canShare) {
        try {
          await navigator.share(data);
          return 'shared';
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') return 'cancelled';
          // NotAllowedError / DataError → fall through to the clipboard
        }
      }
      const payload = data.url ?? data.text ?? data.title ?? '';
      try {
        await writeClipboard(payload);
        return 'copied';
      } catch {
        return 'failed';
      }
    },
    [canShare],
  );

  return { canShare, share };
}

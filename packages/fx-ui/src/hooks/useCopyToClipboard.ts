import { useCallback, useEffect, useRef, useState } from 'react';

/** `navigator.clipboard.writeText` with a hidden-textarea `execCommand('copy')` fallback. */
export async function writeClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  if (typeof document === 'undefined') throw new Error('Clipboard unavailable');
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  ta.style.pointerEvents = 'none';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } finally {
    ta.remove();
  }
  if (!ok) throw new Error('Clipboard unavailable');
}

export interface UseCopyToClipboard {
  copied: boolean;
  error: Error | null;
  copy: (text: string) => Promise<boolean>;
  reset: () => void;
}

/** `copied` flips true for `resetAfterMs` (default 1500) after a successful copy. */
export function useCopyToClipboard(resetAfterMs = 1500): UseCopyToClipboard {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const timer = useRef<number | null>(null);

  const reset = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setCopied(false);
  }, []);

  useEffect(() => reset, [reset]);

  const copy = useCallback(
    async (text: string) => {
      try {
        await writeClipboard(text);
        setError(null);
        setCopied(true);
        if (timer.current !== null) window.clearTimeout(timer.current);
        if (resetAfterMs > 0) {
          timer.current = window.setTimeout(() => {
            timer.current = null;
            setCopied(false);
          }, resetAfterMs);
        }
        return true;
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        setCopied(false);
        return false;
      }
    },
    [resetAfterMs],
  );

  return { copied, error, copy, reset };
}

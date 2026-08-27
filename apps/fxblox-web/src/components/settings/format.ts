/** Small formatting helpers shared by the settings screens. */

/** `0x1234…abcd` — the RN `ellipsizeMode="middle"` replacement for wallet addresses / peer ids. */
export function truncateMiddle(value: string, head = 6, tail = 4): string {
  if (!value) return '';
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Mobile `account.slice(0, 6)...account.slice(-4)` (three dots, no ellipsis glyph). */
export function shortAccount(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

/** Error → message string (mobile `error instanceof Error ? error.message : String(error)`). */
export function errorMessage(error: unknown, fallback = 'Unknown error'): string {
  if (error === undefined || error === null) return fallback;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === 'string') return error || fallback;
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === 'string' && m) return m;
  }
  try {
    const s = String(error);
    return s && s !== '[object Object]' ? s : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Locale — react-native-localize replacement. `country()` is the Wi-Fi regulatory country code sent with
 * `wifi/connect`; derived from `navigator.language`'s region, editable in the Wi-Fi modal, default `CA`.
 */

const COUNTRY_KEY = 'fx.countryCode';
export const DEFAULT_COUNTRY = 'CA';

export function language(): string {
  if (typeof navigator === 'undefined') return 'en';
  const l = navigator.language || navigator.languages?.[0] || 'en';
  return l.split(/[-_]/)[0]?.toLowerCase() || 'en';
}

export function regionFromNavigator(): string | undefined {
  if (typeof navigator === 'undefined') return undefined;
  for (const l of [navigator.language, ...(navigator.languages ?? [])]) {
    const m = (l ?? '').match(/[-_]([A-Za-z]{2})\b/);
    if (m?.[1]) return m[1].toUpperCase();
  }
  return undefined;
}

export function country(): string {
  try {
    const stored = localStorage.getItem(COUNTRY_KEY);
    if (stored && /^[A-Z]{2}$/.test(stored)) return stored;
  } catch {
    /* ignore */
  }
  return regionFromNavigator() ?? DEFAULT_COUNTRY;
}

export function setCountry(code: string): void {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return;
  try {
    localStorage.setItem(COUNTRY_KEY, c);
  } catch {
    /* ignore */
  }
}

export const locale = { language, country, setCountry, regionFromNavigator };

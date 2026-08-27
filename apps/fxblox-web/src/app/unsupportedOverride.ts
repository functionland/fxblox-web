/**
 * E2E escape hatch for the Chromium-only gate: `?unsupported=ignore` on any URL (persisted in sessionStorage for
 * the rest of the tab session, since the router strips nothing but later navigations drop the query).
 */
export const UNSUPPORTED_OVERRIDE_KEY = 'fx.unsupported.ignore';

export function unsupportedOverride(
  search: string = typeof window !== 'undefined' ? window.location.search : '',
): boolean {
  try {
    if (new URLSearchParams(search).get('unsupported') === 'ignore') {
      sessionStorage.setItem(UNSUPPORTED_OVERRIDE_KEY, '1');
      return true;
    }
    return sessionStorage.getItem(UNSUPPORTED_OVERRIDE_KEY) === '1';
  } catch {
    return false;
  }
}

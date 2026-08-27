/**
 * Linking — `Linking.openURL` replacement. Custom-scheme returns (`fxfiles://…`) must be started from a click
 * (`assign`), https links open a new tab. `openSettings()` has no web equivalent — callers show instructions.
 */

export function openUrl(url: string, opts: { newTab?: boolean } = {}): boolean {
  if (typeof window === 'undefined') return false;
  const newTab = opts.newTab ?? /^https?:/i.test(url);
  if (newTab) {
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    return !!w;
  }
  window.location.assign(url);
  return true;
}

/** Same-tab navigation (deep-link returns, custom schemes). Needs a user gesture in Chrome. */
export function assign(url: string): void {
  if (typeof window !== 'undefined') window.location.assign(url);
}

export function canOpenUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export const CHROME_LNA_SETTINGS_URL = 'chrome://settings/content/localNetworkAccess';
export const CHROME_BLUETOOTH_SETTINGS_URL = 'chrome://settings/content/bluetoothDevices';

export const linking = { openUrl, assign, canOpenUrl };

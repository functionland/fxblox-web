/** DeviceInfo — build constants + user agent (react-native-device-info / Platform replacement). */
import { env } from '@/config/env';

export const appVersion = env.APP_VERSION;
export const gitSha = env.GIT_SHA;
export const buildTime = env.BUILD_TIME;

export type WebOs = 'android' | 'ios' | 'windows' | 'macos' | 'linux' | 'chromeos' | 'unknown';

function ua(): string {
  return typeof navigator !== 'undefined' ? navigator.userAgent : '';
}

export function osName(): WebOs {
  const u = ua();
  if (/android/i.test(u)) return 'android';
  if (/iphone|ipad|ipod/i.test(u)) return 'ios';
  if (/cros/i.test(u)) return 'chromeos';
  if (/windows/i.test(u)) return 'windows';
  if (/mac os x|macintosh/i.test(u)) return 'macos';
  if (/linux/i.test(u)) return 'linux';
  return 'unknown';
}

export function isAndroid(): boolean {
  return osName() === 'android';
}

export function isMobile(): boolean {
  const o = osName();
  return o === 'android' || o === 'ios';
}

export function browserName(): string {
  const u = ua();
  const m = u.match(/(Edg|Chrome|CriOS|Firefox|Safari)\/([\d.]+)/);
  if (!m) return 'unknown';
  const name = m[1] === 'Edg' ? 'Edge' : m[1] === 'CriOS' ? 'Chrome' : (m[1] ?? 'unknown');
  return `${name} ${m[2] ?? ''}`.trim();
}

/** `platformName()` mirrors `Platform.OS` usage sites ("android" | "ios" | "web"). */
export function platformName(): 'android' | 'ios' | 'web' {
  const o = osName();
  return o === 'android' || o === 'ios' ? o : 'web';
}

export function describeDevice(): string {
  return `${browserName()} on ${osName()}`;
}

export const deviceInfo = { appVersion, gitSha, buildTime, osName, isAndroid, isMobile, browserName, platformName, describeDevice };

/**
 * Network drive addresses — which address to show for each kind of device.
 *
 * The Blox has no mDNS responder (fula-ota keeps UDP 5353 closed), so `<name>.local` is never shown:
 *   - Windows finds the Blox by its NetBIOS name (`\\FXBLOX-RK1\SharedFolder`) or by IP. The name is friendlier,
 *     but two Blox on one network can share a hostname, so with more than one Blox the IP is preferred.
 *   - Mac / iPhone / Android need the IP (`smb://192.168.1.23/SharedFolder`); the name form is only a fallback.
 * The IP comes from what the app already knows about this Blox on this network — never from `kubo_addrs`, whose
 * private ranges include the Blox's own docker bridges.
 */
import type { WebOs } from '@/platform/deviceInfo';
import { ipIsPrivateLan } from '@/utils/ipIsPrivateLan';
import * as lanIpCache from '@/utils/lanIpCache';
import { loadManualBloxIp } from '@/utils/manualBloxIp';

export type NasDevice = 'windows' | 'mac' | 'ios' | 'android';
export const NAS_DEVICES: readonly NasDevice[] = ['windows', 'mac', 'ios', 'android'];
export const DEFAULT_NAS_SHARE = 'SharedFolder';

/** iPadOS reports a Mac user agent; a touch screen tells them apart. */
export function defaultNasDevice(
  os: WebOs,
  maxTouchPoints: number = typeof navigator !== 'undefined' ? (navigator.maxTouchPoints ?? 0) : 0,
): NasDevice {
  if (os === 'ios') return 'ios';
  if (os === 'macos') return maxTouchPoints > 1 ? 'ios' : 'mac';
  if (os === 'android') return 'android';
  return 'windows';
}

/** A name Windows can resolve over NetBIOS: 1–15 letters, digits or hyphens. */
export function isNetbiosName(name: string | undefined): name is string {
  return !!name && /^[A-Za-z0-9-]{1,15}$/.test(name);
}

export interface NasAddresses {
  /** What a Windows user pastes, e.g. `\\FXBLOX-RK1\SharedFolder`. Empty when neither name nor IP is known. */
  windows: string;
  /** The other Windows form, offered under "Can't connect?". */
  windowsAlt?: string;
  /** What a Mac / iPhone user types, e.g. `smb://192.168.1.23/SharedFolder`. */
  smb: string;
  smbAlt?: string;
  /** Server for apps that ask for it separately (Android). */
  server: string;
  share: string;
  /** Hostname as reported by the Blox (shown in help text). */
  name?: string;
  ipKnown: boolean;
}

export function buildNasAddresses(input: {
  hostname?: string | undefined;
  share?: string | undefined;
  ip?: string | null | undefined;
  bloxCount: number;
}): NasAddresses {
  const share = input.share && /^[^\\/]+$/.test(input.share) ? input.share : DEFAULT_NAS_SHARE;
  const name = input.hostname && /^[A-Za-z0-9.-]+$/.test(input.hostname) ? input.hostname : undefined;
  const ip = input.ip && ipIsPrivateLan(input.ip) ? input.ip : undefined;

  const winByIp = ip ? `\\\\${ip}\\${share}` : undefined;
  const winByName = isNetbiosName(name) ? `\\\\${name.toUpperCase()}\\${share}` : undefined;
  const preferIp = !!winByIp && (input.bloxCount > 1 || !winByName);
  const windows = (preferIp ? winByIp : winByName) ?? winByIp ?? (name ? `\\\\${name}\\${share}` : '');
  const windowsAlt = [winByName, winByIp].find((a) => a !== undefined && a !== windows);

  const server = ip ?? name ?? '';
  const smb = server ? `smb://${server}/${share}` : '';
  const smbAlt = ip && name ? `smb://${name}/${share}` : undefined;

  return {
    windows,
    ...(windowsAlt ? { windowsAlt } : {}),
    smb,
    ...(smbAlt ? { smbAlt } : {}),
    server,
    share,
    ...(name ? { name } : {}),
    ipKnown: !!ip,
  };
}

export type NasIpSource = 'fresh' | 'manual' | 'remembered';

/**
 * The Blox's LAN IP as far as this app knows it, in the same order as `utils/aiTransport.ts`: a fresh record from
 * this session, then an address the user typed, then the last address the app reached the Blox at. Never probes
 * the network. Every answer must be a private LAN address.
 */
export async function resolveNasIp(
  bloxPeerId: string,
  appPeerId: string | undefined,
): Promise<{ ip: string; source: NasIpSource } | null> {
  if (!bloxPeerId) return null;
  if (appPeerId) {
    try {
      const hit = lanIpCache.findAuthorizedBlox(bloxPeerId, appPeerId);
      const ip = hit?.service.txt?.ipAddress ?? hit?.service.host ?? '';
      if (ipIsPrivateLan(ip)) return { ip, source: 'fresh' };
    } catch {
      // the in-memory cache is best-effort
    }
  }
  const manual = await loadManualBloxIp(bloxPeerId).catch(() => null);
  if (manual && ipIsPrivateLan(manual)) return { ip: manual, source: 'manual' };
  if (appPeerId) {
    const remembered = await lanIpCache.rememberedLanIp(bloxPeerId, appPeerId).catch(() => null);
    if (remembered && ipIsPrivateLan(remembered.ip)) return { ip: remembered.ip, source: 'remembered' };
  }
  return null;
}

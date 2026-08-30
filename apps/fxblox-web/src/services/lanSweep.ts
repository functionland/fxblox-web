/**
 * Finding the Blox by address when its name cannot be resolved — which is the situation on Android.
 *
 * ## Why this exists
 *
 * `lanDiscovery.ts` resolves `fxblox-rk1.local`. That works on desktop Chrome and does not work on Android at
 * all. Measured over adb on a Moto G85 (Android 16, Chrome 151, same LAN as the Blox):
 *
 *   ping 192.168.2.159              0% loss, 6-14 ms
 *   ping fxblox-rk1.local           unknown host          <- the OS resolver, not the browser
 *   fetch http://192.168.2.159:8083/diag/relay   200 in 42 ms, LNA already granted
 *   fetch http://fxblox-rk1.local:8083/diag/relay   TypeError at ~1.4 s, twice
 *
 * So the phone reaches the Blox perfectly well; Android simply does not resolve `.local`. No amount of
 * retrying fixes a name that never resolves, and the failure is fast and flat rather than a race.
 *
 * ## Why a sweep is affordable, and how we know where to sweep
 *
 * The same measurement run showed a full /24 completing in **3.1 seconds** on that phone, correctly finding
 * the Blox — 254 probes, all in flight at once, because a dead address costs only its timeout and nothing is
 * serialised.
 *
 * Knowing WHICH /24 comes from WebRTC, and here the platforms are exactly complementary:
 *
 *   Android   host candidate = `192.168.2.155`                  <- the real address
 *   desktop   host candidate = `a8caccf9-….local`               <- mDNS-obfuscated
 *
 * Chrome hides a host candidate behind an mDNS name it registers for the purpose. On Android, where mDNS does
 * not work, there is no name to hide behind and the address is exposed. The very defect that breaks name
 * resolution is what hands us the subnet — and on desktop, where the address is hidden, `.local` resolution
 * works instead. Each platform supplies what the other withholds, so the two strategies together cover both.
 *
 * ## Restraint
 *
 * This is a scan of someone's home network, so it is kept narrow on purpose: only from an explicit tap on
 * "Search the network", only private IPv4 ranges, only subnets this device is actually on, at most
 * `MAX_SUBNETS` of them, and only one port that only a Blox answers. It is never run on a timer or at load.
 */
import { buildLanRequest } from '@/platform/lanHttp';
import { ipIsPrivateLan } from '@/utils/ipIsPrivateLan';
import { BLOX_AI_PORT, peerIdFromRelayDiag, type LanBlox } from './lanDiscovery';

/** A dead address costs its full timeout, and 254 of them run at once — so this bounds the whole sweep. */
export const SWEEP_TIMEOUT_MS = 3000;

/** Guard against a device with many interfaces (VPN, virtual adapters) turning one tap into a wide scan. */
export const MAX_SUBNETS = 2;

/** How long to wait for ICE to produce host candidates. They arrive in tens of milliseconds in practice. */
export const ICE_GATHER_MS = 1500;

const IPV4_RE = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/;

/** Pull an IPv4 host candidate out of an SDP candidate line, or null for the obfuscated `.local` form. */
export function ipFromCandidate(candidate: string): string | null {
  if (!candidate.includes(' typ host')) return null;
  const match = IPV4_RE.exec(candidate);
  if (!match?.[1]) return null;
  const ip = match[1];
  return ipIsPrivateLan(ip) ? ip : null;
}

/** `192.168.2.155` → `192.168.2.` — the /24 the device sits on. */
export function subnetPrefixOf(ip: string): string | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.`;
}

/**
 * The private IPv4 subnets this device is on, learned from WebRTC host candidates.
 *
 * Empty on desktop Chrome, where candidates are mDNS-obfuscated — which is fine, because that is precisely
 * where name resolution works instead.
 */
export async function localSubnets(opts: { gatherMs?: number } = {}): Promise<string[]> {
  if (typeof RTCPeerConnection === 'undefined') return [];
  let pc: RTCPeerConnection | null = null;
  try {
    pc = new RTCPeerConnection({ iceServers: [] });
    // A data channel is what makes ICE gather at all; nothing is ever sent over it.
    pc.createDataChannel('subnet-probe');
    const found = new Set<string>();
    pc.onicecandidate = (event) => {
      const ip = event.candidate ? ipFromCandidate(event.candidate.candidate) : null;
      const prefix = ip ? subnetPrefixOf(ip) : null;
      if (prefix) found.add(prefix);
    };
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise((resolve) => setTimeout(resolve, opts.gatherMs ?? ICE_GATHER_MS));
    return [...found].slice(0, MAX_SUBNETS);
  } catch {
    return [];
  } finally {
    try {
      pc?.close();
    } catch {
      /* nothing to do */
    }
  }
}

/** Ask one address whether it is a Blox. Never throws; a dead address is simply null. */
export async function probeAddress(
  ip: string,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<LanBlox | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? SWEEP_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onOuterAbort);
  try {
    const built = buildLanRequest(`http://${ip}:${BLOX_AI_PORT}/diag/relay`);
    const res = await fetch(built.url, { ...built.init, signal: controller.signal });
    if (!res.ok) return null;
    const peerId = peerIdFromRelayDiag(await res.json());
    return peerId ? { host: ip, peerId } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onOuterAbort);
  }
}

/** Every address in a /24, all at once. `.0` and `.255` are skipped — network and broadcast. */
export async function sweepSubnet(
  prefix: string,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<LanBlox[]> {
  const addresses = Array.from({ length: 254 }, (_, i) => `${prefix}${i + 1}`);
  const results = await Promise.all(addresses.map((ip) => probeAddress(ip, opts)));
  return results.filter((blox): blox is LanBlox => blox !== null);
}

/**
 * Look for Bloxes by address on whatever subnets this device is on.
 *
 * Returns an empty array when the subnet cannot be learned, which is the normal desktop case — the caller
 * pairs this with the name-based search, and between them one of the two always applies.
 */
export async function sweepForBloxes(
  opts: { subnets?: string[]; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<LanBlox[]> {
  const subnets = opts.subnets ?? (await localSubnets());
  if (subnets.length === 0) return [];
  const perSubnet = await Promise.all(subnets.map((prefix) => sweepSubnet(prefix, opts)));
  const byPeerId = new Map<string, LanBlox>();
  for (const blox of perSubnet.flat()) {
    if (!byPeerId.has(blox.peerId)) byPeerId.set(blox.peerId, blox);
  }
  return [...byPeerId.values()];
}

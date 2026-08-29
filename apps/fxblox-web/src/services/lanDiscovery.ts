/**
 * Finding a Blox on the LAN from a browser, which is supposed to be impossible.
 *
 * It half is. Chromium exposes no service enumeration — no PTR browse, no SRV, no DNS-SD — so a page can never
 * LIST `_fulatower._tcp` the way `react-native-zeroconf` does on mobile, and it can never read the TXT record
 * where the Blox publishes its authorizer, hardware id and pool name. That part is a hard wall.
 *
 * What a page CAN do is resolve a `.local` name it already knows: for `.local`, Chrome hands address lookups to
 * the system resolver, which answers over mDNS. Measured in Chrome 151 against a real Blox: ~2.7 s for the first
 * (cold) resolve, then 9-13 ms, and a name that does not exist fails in ~1.4 s. Cheap enough to probe a short
 * list of candidate names in parallel and call the result discovery.
 *
 * So the shape here is a guess-and-check, not a browse. The Blox's hostname comes from the OS image rather than
 * from anything per-device, which is what makes guessing viable at all — and also why a second Blox on the same
 * network gets renamed by mDNS conflict resolution, hence the numbered candidates.
 *
 * Identity comes from `/diag/relay` on the blox-ai port, because it is the only thing reachable that names the
 * device. The Blox's own peer id is the LAST `/p2p/` component of a circuit address (the first is the relay's).
 * Port 3500, which serves the full `/properties`, binds the hotspot interface and is NOT reachable over the LAN
 * — that is exactly why the old scan found nothing.
 */
import { normalizeBloxPeerId } from '@/utils/bloxPeerId';

/** blox-ai. The only Blox HTTP port reachable over the LAN, and it already sends CORS for this origin. */
export const BLOX_AI_PORT = 8083;

/** A miss costs ~1.4 s and they run in parallel, so the list stays short and the scan stays under ~3 s. */
export const DEFAULT_PROBE_TIMEOUT_MS = 6000;

/**
 * Names to try.
 *
 * `fxblox-rk1` is `/etc/hostname` on the RK1 image — the same on every such device, which is the only reason
 * this works without knowing anything about the user's Blox. mDNS appends `-2`, `-3` … when several claim the
 * same name, so a household with more than one is still found.
 */
export const LOCAL_HOST_CANDIDATES = [
  'fxblox-rk1.local',
  'fxblox-rk1-2.local',
  'fxblox-rk1-3.local',
  'fxblox-rk1-4.local',
];

export interface LanBlox {
  /** The `.local` name that answered. */
  host: string;
  /** The Blox's libp2p peer id — everything the "add an existing Blox" flow needs. */
  peerId: string;
}

interface RelayDiag {
  relays?: Array<{ addr?: unknown }>;
}

/**
 * Pull the Blox's own peer id out of a `/diag/relay` answer.
 *
 * A circuit address names two peers — `/p2p/<relay>/p2p-circuit/p2p/<blox>` — and it is the last one we want.
 * `normalizeBloxPeerId` already takes the last `/p2p/` component and validates the base58, so the rule lives in
 * exactly one place and cannot drift between here and the manual-entry field.
 */
export function peerIdFromRelayDiag(body: unknown): string | null {
  const relays = (body as RelayDiag | undefined)?.relays;
  if (!Array.isArray(relays)) return null;
  for (const entry of relays) {
    const addr = entry?.addr;
    if (typeof addr !== 'string' || !addr.includes('/p2p-circuit/')) continue;
    const peerId = normalizeBloxPeerId(addr);
    if (peerId) return peerId;
  }
  return null;
}

/** Ask one candidate name whether it is a Blox, and which one. Never throws. */
export async function probeLocalHost(
  host: string,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<LanBlox | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onOuterAbort);
  try {
    const res = await fetch(`http://${host}:${BLOX_AI_PORT}/diag/relay`, {
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!res.ok) return null;
    const peerId = peerIdFromRelayDiag(await res.json());
    return peerId ? { host, peerId } : null;
  } catch {
    // A name nobody claims, a host that is not a Blox, a blocked local-network request — all "not found".
    return null;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onOuterAbort);
  }
}

/**
 * Probe every candidate at once and return the Bloxes that answered, deduped by peer id.
 *
 * Deduped because two names can resolve to one device (a renamed host that still answers to both), and adding
 * the same Blox twice under different names would be worse than not finding it.
 */
export async function discoverBloxesOnLan(
  opts: { hosts?: string[]; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<LanBlox[]> {
  const hosts = opts.hosts ?? LOCAL_HOST_CANDIDATES;
  const found = await Promise.all(
    hosts.map((host) => probeLocalHost(host, { timeoutMs: opts.timeoutMs, signal: opts.signal })),
  );
  const byPeerId = new Map<string, LanBlox>();
  for (const blox of found) {
    if (blox && !byPeerId.has(blox.peerId)) byPeerId.set(blox.peerId, blox);
  }
  return [...byPeerId.values()];
}

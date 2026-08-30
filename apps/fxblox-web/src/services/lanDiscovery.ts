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
 *
 * ## Local Network Access is not optional
 *
 * Requests go through `buildLanRequest`, which asserts `targetAddressSpace: 'local'`. Chrome gates a page's
 * access to the local network on the TARGET, and a request that does not assert its target address space gives
 * Chrome nothing to prompt about — it is simply blocked. The first version of this file used a bare `fetch`,
 * which worked on the machine it was written on for the worst possible reason: that browser profile had already
 * been granted the permission during earlier hotspot testing (`permissions.query` confirmed `granted`). On any
 * device that had never granted it — a phone, say — every probe failed instantly and the screen reported
 * "nothing found", which is a guess dressed up as a fact.
 *
 * Hence `DiscoveryOutcome`: a failed scan says WHICH failure it was, so a blocked permission can never again be
 * mistaken for an absent device.
 */
import {
  buildLanRequest,
  lnaPermissionState,
  type LnaPermissionState,
} from '@/platform/lanHttp';
import { normalizeBloxPeerId } from '@/utils/bloxPeerId';

/** blox-ai. The only Blox HTTP port reachable over the LAN, and it already sends CORS for this origin. */
export const BLOX_AI_PORT = 8083;

/** A miss costs ~1.4 s and they run in parallel, so the list stays short and the scan stays under ~3 s. */
export const DEFAULT_PROBE_TIMEOUT_MS = 6000;

/**
 * How many times to ask for each name.
 *
 * A cold `.local` resolve is a coin flip, and the Blox is what makes it one: `wap/cmd/mdns/mdns.go` registers
 * its service with `service.TTL(2)` — a TWO SECOND record TTL, against an mDNS norm of 120. The resolver cache
 * is therefore empty almost every time we ask, so nearly every lookup is a fresh multicast query racing
 * Chrome's own patience, which measurement puts at ~2.3 s. Observed directly on the live app: five consecutive
 * probes all failed at ~2.3 s, then the next succeeded at 2704 ms and the one after it at 11 ms.
 *
 * A failed attempt is not wasted — the query it sent populates the cache — so a second attempt lands in
 * milliseconds. Two attempts turns a coin flip into a near-certainty, and costs nothing when the first works.
 *
 * The real fix is firmware-side: raise that TTL. Until then this is what makes the feature usable, and it is
 * also the most likely reason the scan never worked on Android, where multicast is slower and power-save
 * filtering is common — one cold query there may simply never arrive in time.
 */
export const PROBE_ATTEMPTS = 2;

/** Breather between attempts: long enough for the first query's answer to land in the cache. */
export const RETRY_DELAY_MS = 300;

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

/** The URL a probe hits — exported so a test can assert the address-space assertion rides along. */
export function probeUrl(host: string): string {
  return `http://${host}:${BLOX_AI_PORT}/diag/relay`;
}

/**
 * Ask one candidate name whether it is a Blox, and which one. Never throws.
 *
 * Retries once by default: see `PROBE_ATTEMPTS` for why a single cold attempt is not enough.
 */
export async function probeLocalHost(
  host: string,
  opts: { timeoutMs?: number; signal?: AbortSignal; attempts?: number; retryDelayMs?: number } = {},
): Promise<LanBlox | null> {
  const attempts = Math.max(1, opts.attempts ?? PROBE_ATTEMPTS);
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (opts.signal?.aborted) return null;
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, opts.retryDelayMs ?? RETRY_DELAY_MS));
      if (opts.signal?.aborted) return null;
    }
    const found = await probeLocalHostOnce(host, opts);
    if (found) return found;
  }
  return null;
}

/** One request. The retry loop above is what makes this reliable. */
export async function probeLocalHostOnce(
  host: string,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<LanBlox | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onOuterAbort);
  try {
    // buildLanRequest is what adds `targetAddressSpace: 'local'`. Without it Chrome has nothing to prompt
    // about and blocks the request outright — see the file header.
    const built = buildLanRequest(probeUrl(host));
    const res = await fetch(built.url, { ...built.init, signal: controller.signal });
    if (!res.ok) return null;
    const peerId = peerIdFromRelayDiag(await res.json());
    return peerId ? { host, peerId } : null;
  } catch {
    // A name nobody claims, a host that is not a Blox, a blocked local-network request. Which one it was is
    // decided once for the whole scan in `discoverBloxesOnLan`, not guessed at per candidate.
    return null;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onOuterAbort);
  }
}

/**
 * Why a scan came back empty.
 *
 * `blocked` is the one that matters: the browser refused to let the page touch the local network at all, so
 * nothing was ever asked. Reporting that as "no Blox found" is how a permission problem gets mistaken for a
 * hardware problem, and it sends the user looking in the wrong place.
 */
export type DiscoveryFailure = 'blocked' | 'not-found';

export interface DiscoveryOutcome {
  found: LanBlox[];
  /** Absent when something was found. */
  failure?: DiscoveryFailure;
  /** Chrome's Local Network Access state at the time of the scan; `unsupported` on browsers without it. */
  lna: LnaPermissionState;
}

/**
 * Probe every candidate at once and report what answered — and, if nothing did, why.
 *
 * Deduped by peer id because two names can resolve to one device (a renamed host that still answers to both),
 * and adding the same Blox twice under different names would be worse than not finding it.
 */
export async function discoverBloxesOnLan(
  opts: { hosts?: string[]; timeoutMs?: number; signal?: AbortSignal; attempts?: number } = {},
): Promise<DiscoveryOutcome> {
  const hosts = opts.hosts ?? LOCAL_HOST_CANDIDATES;
  const [results, lna] = await Promise.all([
    Promise.all(
      hosts.map((host) =>
        probeLocalHost(host, {
          ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
          ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
          ...(opts.attempts !== undefined ? { attempts: opts.attempts } : {}),
        }),
      ),
    ),
    // Read alongside the probes rather than before them: on a browser that prompts, asking first would report
    // the state from before the user answered.
    lnaPermissionState(),
  ]);

  const byPeerId = new Map<string, LanBlox>();
  for (const blox of results) {
    if (blox && !byPeerId.has(blox.peerId)) byPeerId.set(blox.peerId, blox);
  }
  const found = [...byPeerId.values()];
  if (found.length > 0) return { found, lna };
  return { found, failure: lna === 'denied' ? 'blocked' : 'not-found', lna };
}

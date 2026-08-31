/**
 * Finding a Blox that is not set up yet, over the LAN.
 *
 * `lanDiscovery.ts` finds a Blox that ALREADY has an owner: it asks blox-ai on :8083 for `/diag/relay` and reads
 * the peer id out of a relay circuit address. A box that has never been set up has no relay circuit and nothing
 * to report there, so that search cannot see it.
 *
 * What it answers on instead is the WAP API on :3500. go-fula opens that on the LAN interfaces for exactly as
 * long as the box is unowned (`wap/pkg/server/lanbind.go`: `lanSetupGuard` refuses once an authorizer is set),
 * and `startLANSetupWatch` keeps those listeners in step with the interfaces — so a cable plugged in AFTER boot
 * is picked up, which is what makes "plug it in, wait a few seconds, search" work at all. `withCORS` allow-lists
 * this origin and answers Chrome's Private Network Access preflight.
 *
 * The two platform strategies are the same ones lanDiscovery uses, and for the same reason: desktop Chrome
 * resolves `.local` but hides its own address, Android exposes its address but resolves no `.local` at all.
 * Running both means the platform never has to be detected.
 */
import { buildLanRequest, lnaPermissionState, type LnaPermissionState } from '@/platform/lanHttp';
import { LOCAL_HOST_CANDIDATES } from './lanDiscovery';
import { localSubnets, SWEEP_TIMEOUT_MS } from './lanSweep';

/** The WAP API port. Defined here rather than imported from the screen, which would be a cycle. */
export const WAP_PORT = 3500;

/**
 * Per-probe budget.
 *
 * Deliberately tighter than the blox-ai search: this runs FIRST now, ahead of Bluetooth, so a user whose Blox
 * has no cable in it pays this before reaching the button they actually need. A Blox that is on the network
 * answers in milliseconds; the timeout only ever bounds the miss.
 */
export const SETUP_PROBE_TIMEOUT_MS = 2500;

/** A cold `.local` resolve is a coin flip against the Blox's 2 s mDNS TTL — see lanDiscovery.PROBE_ATTEMPTS. */
export const SETUP_PROBE_ATTEMPTS = 2;
export const SETUP_RETRY_DELAY_MS = 300;

export interface UnownedBlox {
  /** The `.local` name or IPv4 address that answered; feeds straight into `apiUrlFor`. */
  host: string;
}

export type SetupDiscoveryFailure = 'blocked' | 'not-found';

export interface SetupDiscoveryOutcome {
  found: UnownedBlox[];
  /** Absent when something was found. */
  failure?: SetupDiscoveryFailure;
  lna: LnaPermissionState;
}

export function setupProbeUrl(host: string): string {
  return `http://${host}:${WAP_PORT}/properties`;
}

/**
 * Does a Blox awaiting setup answer at this host?
 *
 * A `HEAD` mirrors `probeHotspotDetailed`, and an owned Blox is a deliberate miss: `lanSetupGuard` answers 403
 * once an authorizer is set, and `res.ok` is false for it. Offering to "set up" a box that already belongs to
 * someone is the one wrong answer this search could give.
 */
export async function probeSetupHost(
  host: string,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<UnownedBlox | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? SETUP_PROBE_TIMEOUT_MS);
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onOuterAbort);
  try {
    // buildLanRequest is what asserts `targetAddressSpace: 'local'`; without it Chrome has nothing to prompt
    // about and blocks the request outright.
    const built = buildLanRequest(setupProbeUrl(host), { method: 'HEAD' });
    const res = await fetch(built.url, { ...built.init, signal: controller.signal });
    return res.ok ? { host } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onOuterAbort);
  }
}

/** Retry wrapper — one cold `.local` attempt is not enough (lanDiscovery.PROBE_ATTEMPTS explains why). */
export async function probeSetupHostWithRetry(
  host: string,
  opts: { timeoutMs?: number; signal?: AbortSignal; attempts?: number; retryDelayMs?: number } = {},
): Promise<UnownedBlox | null> {
  const attempts = Math.max(1, opts.attempts ?? SETUP_PROBE_ATTEMPTS);
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (opts.signal?.aborted) return null;
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, opts.retryDelayMs ?? SETUP_RETRY_DELAY_MS));
      if (opts.signal?.aborted) return null;
    }
    const found = await probeSetupHost(host, opts);
    if (found) return found;
  }
  return null;
}

/** Every address in a /24 at once, asking :3500 rather than blox-ai. */
export async function sweepSubnetForSetup(
  prefix: string,
  opts: { signal?: AbortSignal } = {},
): Promise<UnownedBlox[]> {
  const addresses = Array.from({ length: 254 }, (_, i) => `${prefix}${i + 1}`);
  const results = await Promise.all(
    addresses.map((ip) => probeSetupHost(ip, { ...opts, timeoutMs: SWEEP_TIMEOUT_MS })),
  );
  return results.filter((blox): blox is UnownedBlox => blox !== null);
}

/**
 * Look for a Blox awaiting setup: candidate `.local` names and an address sweep, both at once.
 *
 * Reports WHY an empty result was empty, so a browser that refused local-network access can never be shown to
 * the user as "no Blox found" — that sends them looking for a cable fault they do not have.
 */
export async function discoverUnownedBloxes(
  opts: {
    hosts?: string[];
    signal?: AbortSignal;
    attempts?: number;
    /** Injected by tests; production sweeps the subnets this device is actually on. */
    subnets?: string[];
  } = {},
): Promise<SetupDiscoveryOutcome> {
  const hosts = opts.hosts ?? LOCAL_HOST_CANDIDATES;
  const [named, swept, lna] = await Promise.all([
    Promise.all(
      hosts.map((host) =>
        probeSetupHostWithRetry(host, {
          ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
          ...(opts.attempts !== undefined ? { attempts: opts.attempts } : {}),
        }),
      ),
    ),
    (async () => {
      const subnets = opts.subnets ?? (await localSubnets());
      if (subnets.length === 0) return [] as UnownedBlox[];
      const perSubnet = await Promise.all(
        subnets.map((prefix) =>
          sweepSubnetForSetup(prefix, { ...(opts.signal !== undefined ? { signal: opts.signal } : {}) }),
        ),
      );
      return perSubnet.flat();
    })().catch(() => [] as UnownedBlox[]),
    lnaPermissionState(),
  ]);

  const byHost = new Map<string, UnownedBlox>();
  // Name first: a `.local` host is friendlier to show than a bare address.
  for (const blox of [...named, ...swept]) {
    if (blox && !byHost.has(blox.host)) byHost.set(blox.host, blox);
  }
  const found = [...byHost.values()];
  if (found.length > 0) return { found, lna };
  return { found, failure: lna === 'denied' ? 'blocked' : 'not-found', lna };
}

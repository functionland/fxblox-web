/**
 * discoveryClient — `discovery.fula.network` access (`/relays`, `/find-box`) moved out of the mobile `helper.ts`
 * (logic verbatim). Cache key `fx.relayCache.v1` in the KV store.
 *
 * Web note: the `x-fula-client: app` header (Cloudflare WAF gate) makes the request non-simple, so it needs the
 * discovery worker's `access-control-allow-headers` to list it (PR-C). Until that ships the preflight fails with a
 * TypeError; we then retry once WITHOUT the header so the app degrades to the cached / hardcoded relay instead
 * of failing hard.
 */
import { kvStore, type KeyValueStore } from '@/platform/kvStore';
import { FXDiscoveryURL, FXRelay, FXRelayCacheKey, FXRelayCacheMaxAgeMs } from '@/utils/constants';

export interface DiscoveryRelay {
  dnsName: string;
  peerId: string;
  addr: string;
  multiaddr: string;
  /** PR-C: the relay's `ipfs id` public addresses incl. `/webtransport/certhash/…`. */
  addrs?: string[];
  status?: string;
  lastSeen?: string | number;
}

export interface DiscoveryFindBoxEntry {
  multiaddr: string;
}

export interface RelayCache {
  list: DiscoveryRelay[];
  ts: number;
}

const DISCOVERY_TIMEOUT_MS = 5000;
const CLIENT_HEADER = { 'x-fula-client': 'app' } as const;

let store: KeyValueStore = kvStore;
let baseUrl = FXDiscoveryURL;

/** Test / harness hooks. */
export function _configureForTests(opts: { store?: KeyValueStore; baseUrl?: string }): void {
  if (opts.store) store = opts.store;
  if (opts.baseUrl) baseUrl = opts.baseUrl;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

function isNetworkTypeError(e: unknown): boolean {
  return e instanceof TypeError || (typeof e === 'object' && e !== null && (e as { name?: string }).name === 'TypeError');
}

/**
 * fetch with the `x-fula-client` header; on a CORS/preflight TypeError retry once without it.
 */
async function discoveryFetch(path: string, init: RequestInit): Promise<Response> {
  const url = `${baseUrl}${path}`;
  const headers = { ...(init.headers as Record<string, string> | undefined), ...CLIENT_HEADER };
  try {
    return await fetchWithTimeout(url, { ...init, headers }, DISCOVERY_TIMEOUT_MS);
  } catch (e) {
    if (!isNetworkTypeError(e)) throw e;
    console.debug('discovery: request with x-fula-client failed (CORS preflight?); retrying without it');
    const bare = { ...(init.headers as Record<string, string> | undefined) };
    return fetchWithTimeout(url, { ...init, headers: bare }, DISCOVERY_TIMEOUT_MS);
  }
}

/**
 * Refresh the cached relay list from Workers. Non-blocking; failure is silent and logged at debug.
 */
export const refreshRelayCache = async (): Promise<void> => {
  try {
    const r = await discoveryFetch('/relays', { method: 'GET', headers: { accept: 'application/json' } });
    if (!r.ok) return;
    const list = (await r.json()) as DiscoveryRelay[];
    if (!Array.isArray(list) || list.length === 0) return;
    await store.setItem(FXRelayCacheKey, JSON.stringify({ list, ts: Date.now() } satisfies RelayCache));
  } catch (e) {
    console.debug('refreshRelayCache failed:', e);
  }
};

/** Read the cached relay list (null when absent / stale / corrupt). */
export async function readRelayCache(maxAgeMs: number = FXRelayCacheMaxAgeMs): Promise<RelayCache | null> {
  try {
    const raw = await store.getItem(FXRelayCacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RelayCache;
    if (parsed && Array.isArray(parsed.list) && Date.now() - parsed.ts < maxAgeMs) return parsed;
  } catch (e) {
    console.debug('readRelayCache failed:', e);
  }
  return null;
}

/**
 * Given a target box peer ID, return the ordered list of circuit multiaddrs to try (3 tiers; always ≥ 1).
 */
export const findBox = async (bloxPeerId: string): Promise<string[]> => {
  // Tier 1: live Workers lookup — returns box-specific circuit addresses.
  try {
    const r = await discoveryFetch('/find-box', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ peerId: bloxPeerId }),
    });
    if (r.ok) {
      const entries = (await r.json()) as DiscoveryFindBoxEntry[];
      if (Array.isArray(entries) && entries.length > 0) {
        const addrs = entries.map((e) => e.multiaddr).filter(Boolean);
        if (addrs.length > 0) return addrs;
      }
    }
  } catch (e) {
    console.debug('findBox: /find-box failed:', e);
  }

  // Tier 2: cached relay list — construct addresses from each cached relay.
  try {
    const cached = await readRelayCache();
    if (cached) {
      const constructed = cached.list.map((r) => `${r.addr}/p2p/${r.peerId}/p2p-circuit/p2p/${bloxPeerId}`);
      if (constructed.length > 0) return constructed;
    }
  } catch (e) {
    console.debug('findBox: cache read failed:', e);
  }

  // Tier 3: hardcoded fallback — matches pre-Workers behavior exactly.
  return [`${FXRelay}/p2p/${bloxPeerId}`];
};

export interface RelayListing {
  relays: DiscoveryRelay[];
  source: 'live' | 'cache' | 'none';
  fetchedAt?: number;
}

/**
 * Relay list for the Diagnostics probes: live when reachable (also refreshes the cache), else cached, else none.
 */
export async function listRelays(): Promise<RelayListing> {
  try {
    const r = await discoveryFetch('/relays', { method: 'GET', headers: { accept: 'application/json' } });
    if (r.ok) {
      const list = (await r.json()) as DiscoveryRelay[];
      if (Array.isArray(list)) {
        if (list.length > 0) {
          await store.setItem(FXRelayCacheKey, JSON.stringify({ list, ts: Date.now() } satisfies RelayCache)).catch(() => undefined);
        }
        return { relays: list, source: 'live', fetchedAt: Date.now() };
      }
    }
  } catch (e) {
    console.debug('listRelays: live fetch failed:', e);
  }
  const cached = await readRelayCache();
  if (cached) return { relays: cached.list, source: 'cache', fetchedAt: cached.ts };
  return { relays: [], source: 'none' };
}

/** GET /health-style reachability of the discovery service (for the Diagnostics probe row). */
export async function probeDiscovery(): Promise<boolean> {
  try {
    const r = await discoveryFetch('/relays', { method: 'GET', headers: { accept: 'application/json' } });
    return r.ok;
  } catch {
    return false;
  }
}

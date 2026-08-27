/**
 * Candidate discovery (plan §WS1 "Dial strategy").
 *
 * Candidate order for a Blox `B`:
 *   0. the `bloxAddr` passed to `newClient` (rewritten for the browser when it is a TCP relay circuit)
 *   1. `POST discovery.fula.network/find-box {peerId}` → circuit addrs (entries already carrying
 *      `/webtransport/certhash/` are kept as-is; TCP circuits are rewritten)
 *   2. `GET discovery.fula.network/relays` (cached in the injected KV under `fx.relayCache.v1`) — after PR-C each
 *      relay may carry `addrs[]` with certhashes; until then the relay's WebTransport address comes from
 *   3. the hardcoded relays (`relay.dev.fx.land`, `relay.fula.network`)
 *
 * Certhash sources for a TCP-only relay, in order: (a) `/relays[].addrs`, (b) delegated routing
 * `GET delegated-ipfs.dev/routing/v1/peers/<relay>` (verified live 2026-08-27), (c) build-time addresses injected
 * by the app (`VITE_RELAY_WT_ADDRS`). Certhashes rotate every ~14 days; kubo advertises current+next, so a cached
 * value is refreshed at most daily and immediately after a WebTransport/certhash dial error (`refresh: true`).
 *
 * Both discovery.fula.network endpoints need `x-fula-client: app` and their CORS preflight is currently blocked
 * by a WAF (403) → every network call here is best-effort; failures fall through to the next tier.
 *
 * The TCP form of every circuit is appended *after* the WebTransport form so a Node client (tests, fake harness)
 * can still use it; the client filters candidates with `node.isDialable()` so a browser never wastes 20 s on a
 * TCP address.
 */
import { isPrivate } from '@libp2p/utils';
import { multiaddr, type Multiaddr } from '@multiformats/multiaddr';
import { Circuit, WebTransport } from '@multiformats/multiaddr-matcher';
import { FulaWebError, errorMessage } from './errors.js';
import { createLogger } from './log.js';

const log = createLogger('discovery');

export interface KeyValueStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemoryKeyValueStore implements KeyValueStore {
  private readonly map = new Map<string, string>();
  async get(key: string): Promise<string | undefined> {
    return this.map.get(key);
  }
  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }
}

export interface RelayInfo {
  peerId: string;
  /** TCP multiaddr including `/p2p/<relay>` (what `/relays` returns today and what mobile dials). */
  multiaddr: string;
  /** Advertised addresses (PR-C) — may include `/webtransport/certhash/…` entries. */
  addrs?: string[];
}

export type FindBoxFn = (bloxPeerId: string, opts: { signal?: AbortSignal }) => Promise<string[]>;

export interface DiscoveryConfig {
  discoveryUrl: string;
  delegatedRoutingUrl: string;
  /** Value of the `x-fula-client` header the discovery worker requires. */
  clientHeader: string;
  fetch: typeof fetch | undefined;
  kv: KeyValueStore;
  /** Fallback relays (tier 3). */
  relays: RelayInfo[];
  /** Full override of candidate resolution (tests / fake harness): returns multiaddr strings for the Blox. */
  findBox?: FindBoxFn;
  /** Build-time WebTransport addresses per relay peer id (tier (c)). */
  relayWebTransportAddrs: Record<string, string[]>;
  relayCacheTtlMs: number;
  certhashTtlMs: number;
  fetchTimeoutMs: number;
  now: () => number;
}

export const RELAY_DEV_FX_LAND: RelayInfo = {
  peerId: '12D3KooWDRrBaAfPwsGJivBoUw5fE7ZpDiyfUjqgiURq2DEcL835',
  multiaddr: '/dns/relay.dev.fx.land/tcp/4001/p2p/12D3KooWDRrBaAfPwsGJivBoUw5fE7ZpDiyfUjqgiURq2DEcL835',
};
export const RELAY_FULA_NETWORK: RelayInfo = {
  peerId: '12D3KooWLghRj2oKZE3aa9WggQ65wxyaooAriDQi4rzTsKpLoPLb',
  multiaddr: '/dns/relay.fula.network/tcp/4001/p2p/12D3KooWLghRj2oKZE3aa9WggQ65wxyaooAriDQi4rzTsKpLoPLb',
};
export const HARDCODED_RELAYS: RelayInfo[] = [RELAY_DEV_FX_LAND, RELAY_FULA_NETWORK];

export const RELAY_CACHE_KEY = 'fx.relayCache.v1';
export const RELAY_WT_CACHE_PREFIX = 'fx.relayWt.v1:';

function defaults(): DiscoveryConfig {
  return {
    discoveryUrl: 'https://discovery.fula.network',
    delegatedRoutingUrl: 'https://delegated-ipfs.dev/routing/v1',
    clientHeader: 'app',
    fetch: typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : undefined,
    kv: new MemoryKeyValueStore(),
    relays: HARDCODED_RELAYS,
    relayWebTransportAddrs: {},
    relayCacheTtlMs: 24 * 60 * 60 * 1000,
    certhashTtlMs: 24 * 60 * 60 * 1000,
    fetchTimeoutMs: 8_000,
    now: () => Date.now(),
  };
}

let config: DiscoveryConfig = defaults();

export function configureDiscovery(patch: Partial<DiscoveryConfig>): void {
  const next = { ...config };
  for (const [k, v] of Object.entries(patch) as Array<[keyof DiscoveryConfig, unknown]>) {
    if (v !== undefined) (next as Record<string, unknown>)[k] = v;
  }
  if (patch.findBox === undefined && 'findBox' in patch) delete next.findBox;
  config = next;
}

export function getDiscoveryConfig(): DiscoveryConfig {
  return config;
}

export function resetDiscovery(): void {
  config = defaults();
}

// ------------------------------------------------------------------------------------------------ multiaddr helpers

/** Last `/p2p/<id>` component — the destination peer of a (possibly relayed) address. */
export function lastPeerId(ma: Multiaddr): string | undefined {
  const comps = ma.getComponents();
  for (let i = comps.length - 1; i >= 0; i--) {
    const c = comps[i];
    if (c?.name === 'p2p' && c.value !== undefined) return c.value;
  }
  return undefined;
}

export function hasCerthash(ma: Multiaddr): boolean {
  return ma.getComponents().some((c) => c.name === 'certhash');
}

export function isWebTransportAddr(ma: Multiaddr): boolean {
  return WebTransport.matches(ma);
}

export function isCircuitAddr(ma: Multiaddr): boolean {
  return Circuit.matches(ma);
}

export interface CircuitParts {
  /** The relay leg, without its trailing `/p2p/<relay>`. */
  relayTransport: Multiaddr;
  relayPeerId: string | undefined;
  boxPeerId: string | undefined;
}

/** Splits `<relayTransport>/p2p/<R>/p2p-circuit/p2p/<B>`. */
export function circuitParts(ma: Multiaddr): CircuitParts | undefined {
  const comps = ma.getComponents();
  const circuitIdx = comps.findIndex((c) => c.name === 'p2p-circuit');
  if (circuitIdx === -1) return undefined;
  const before = comps.slice(0, circuitIdx);
  const after = comps.slice(circuitIdx + 1);
  let relayPeerId: string | undefined;
  const relayLeg = [...before];
  const last = relayLeg[relayLeg.length - 1];
  if (last?.name === 'p2p') {
    relayPeerId = last.value;
    relayLeg.pop();
  }
  const boxPeerId = after.find((c) => c.name === 'p2p')?.value;
  return { relayTransport: multiaddr(relayLeg), relayPeerId, boxPeerId };
}

/** Removes a trailing `/p2p/<id>` (delegated routing sometimes includes it, sometimes not). */
export function stripPeerSuffix(ma: Multiaddr): Multiaddr {
  const comps = ma.getComponents();
  const last = comps[comps.length - 1];
  return last?.name === 'p2p' ? multiaddr(comps.slice(0, -1)) : ma;
}

/** `<relayWebTransport>/p2p/<R>/p2p-circuit/p2p/<B>` — the browser-dialable form of a relay circuit. */
export function buildCircuit(relayTransport: string | Multiaddr, relayPeerId: string, boxPeerId: string): Multiaddr {
  const base = stripPeerSuffix(typeof relayTransport === 'string' ? multiaddr(relayTransport) : relayTransport);
  return multiaddr(`${base.toString()}/p2p/${relayPeerId}/p2p-circuit/p2p/${boxPeerId}`);
}

/**
 * Rewrites a TCP relay circuit to WebTransport circuits (one per WebTransport address of the relay).
 * Addresses that are already WebTransport-with-certhash are returned unchanged.
 */
export function rewriteCircuitForBrowser(circuit: Multiaddr, relayWtAddrs: string[]): Multiaddr[] {
  const parts = circuitParts(circuit);
  if (parts === undefined || parts.relayPeerId === undefined || parts.boxPeerId === undefined) return [];
  if (isWebTransportAddr(parts.relayTransport) && hasCerthash(parts.relayTransport)) return [circuit];
  return relayWtAddrs.map((wt) => buildCircuit(wt, parts.relayPeerId as string, parts.boxPeerId as string));
}

function safeMultiaddr(s: string): Multiaddr | undefined {
  try {
    return multiaddr(s);
  } catch {
    log.warn('ignoring invalid multiaddr', s);
    return undefined;
  }
}

/** Host part (the value of a leading dns/dns4/dns6/dnsaddr/ip4/ip6 component) — pairs a WebTransport addr with its relay. */
function hostOf(ma: Multiaddr): string | undefined {
  const first = ma.getComponents()[0];
  return first !== undefined && /^(dns|dns4|dns6|dnsaddr|ip4|ip6)$/.test(first.name) ? first.value : undefined;
}

/**
 * Turns a flat list of relay WebTransport addresses (the app's `relayWtAddrs` / `VITE_RELAY_WT_ADDRS`) into the
 * per-relay map used by discovery. An entry is keyed by its trailing `/p2p/<relay>` when present, otherwise by
 * matching its host (`/dns/relay.dev.fx.land`) against the known relays' TCP multiaddrs. Unmatched entries are
 * dropped with a warning — a certhash is only meaningful for the relay that owns it.
 */
export function keyRelayWebTransportAddrs(addrs: string[], relays: RelayInfo[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const raw of addrs) {
    const ma = safeMultiaddr(raw);
    if (ma === undefined || !isWebTransportAddr(ma) || !hasCerthash(ma)) {
      log.warn('ignoring relayWtAddrs entry that is not a WebTransport+certhash address', raw);
      continue;
    }
    let peerId = lastPeerId(ma);
    if (peerId === undefined) {
      const host = hostOf(ma);
      peerId = relays.find((r) => {
        const rma = safeMultiaddr(r.multiaddr);
        return rma !== undefined && host !== undefined && hostOf(rma) === host;
      })?.peerId;
    }
    if (peerId === undefined) {
      log.warn('ignoring relayWtAddrs entry: no /p2p suffix and no known relay with the same host', raw);
      continue;
    }
    (out[peerId] ??= []).push(stripPeerSuffix(ma).toString());
  }
  return out;
}

/** dns first, then public IPs, private IPs last (a relay's LAN address is useless from the internet). */
function sortRelayAddrs(addrs: string[]): string[] {
  const rank = (s: string): number => {
    const ma = safeMultiaddr(s);
    if (ma === undefined) return 3;
    if (s.startsWith('/dns')) return 0;
    return isPrivate(ma) ? 2 : 1;
  };
  return [...addrs].sort((a, b) => rank(a) - rank(b));
}

// ---------------------------------------------------------------------------------------------------- HTTP helpers

async function fetchJson(url: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const f = config.fetch;
  if (f === undefined) throw new Error('fetch is not available');
  const signals = [AbortSignal.timeout(config.fetchTimeoutMs)];
  if (signal !== undefined) signals.push(signal);
  const res = await f(url, { ...init, signal: AbortSignal.any(signals) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

interface CachedRelays {
  fetchedAt: number;
  relays: RelayInfo[];
}

interface CachedWt {
  fetchedAt: number;
  addrs: string[];
  source: string;
}

async function readCache<T>(key: string): Promise<T | undefined> {
  try {
    const raw = await config.kv.get(key);
    return raw === undefined ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

async function writeCache(key: string, value: unknown): Promise<void> {
  try {
    await config.kv.set(key, JSON.stringify(value));
  } catch (e) {
    log.warn(`cannot write ${key}`, errorMessage(e));
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function strArray(v: unknown): string[] | undefined {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;
}

/** Accepts `[{peerId, multiaddr, addrs?}]`, `{relays: [...]}`, and the older key spellings. */
export function parseRelaysResponse(data: unknown): RelayInfo[] {
  const list = Array.isArray(data) ? data : Array.isArray((data as { relays?: unknown })?.relays) ? (data as { relays: unknown[] }).relays : [];
  const out: RelayInfo[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      const ma = safeMultiaddr(item);
      const pid = ma === undefined ? undefined : lastPeerId(ma);
      if (pid !== undefined) out.push({ peerId: pid, multiaddr: item });
      continue;
    }
    if (typeof item !== 'object' || item === null) continue;
    const o = item as Record<string, unknown>;
    const maStr = str(o['multiaddr']) ?? str(o['addr']) ?? str(o['address']);
    const ma = maStr === undefined ? undefined : safeMultiaddr(maStr);
    const peerId = str(o['peerId']) ?? str(o['peer_id']) ?? str(o['id']) ?? (ma === undefined ? undefined : lastPeerId(ma));
    if (peerId === undefined || maStr === undefined) continue;
    const info: RelayInfo = { peerId, multiaddr: maStr };
    const addrs = strArray(o['addrs']) ?? strArray(o['multiaddrs']);
    if (addrs !== undefined && addrs.length > 0) info.addrs = addrs;
    out.push(info);
  }
  return out;
}

/** Accepts `[{multiaddr}]`, `[string]`, `{results|addrs|multiaddrs: [...]}`. */
export function parseFindBoxResponse(data: unknown): string[] {
  const o = data as Record<string, unknown> | unknown[] | null;
  const list = Array.isArray(o)
    ? o
    : (o !== null && typeof o === 'object' && ((o['results'] as unknown[]) ?? (o['addrs'] as unknown[]) ?? (o['multiaddrs'] as unknown[]))) || [];
  const out: string[] = [];
  for (const item of list as unknown[]) {
    if (typeof item === 'string') out.push(item);
    else if (typeof item === 'object' && item !== null) {
      const s = str((item as Record<string, unknown>)['multiaddr']) ?? str((item as Record<string, unknown>)['addr']);
      if (s !== undefined) out.push(s);
    }
  }
  return out;
}

// --------------------------------------------------------------------------------------------------------- sources

/** Tier 2/3: `/relays` (cached) merged with the hardcoded fallback; never throws. */
export async function listRelays(opts: { refresh?: boolean; signal?: AbortSignal } = {}): Promise<RelayInfo[]> {
  const cached = await readCache<CachedRelays>(RELAY_CACHE_KEY);
  const fresh = cached !== undefined && config.now() - cached.fetchedAt < config.relayCacheTtlMs;
  let fetched: RelayInfo[] | undefined = fresh && !opts.refresh ? cached?.relays : undefined;
  if (fetched === undefined) {
    try {
      const data = await fetchJson(
        `${config.discoveryUrl}/relays`,
        { method: 'GET', headers: { accept: 'application/json', 'x-fula-client': config.clientHeader } },
        opts.signal,
      );
      fetched = parseRelaysResponse(data);
      if (fetched.length > 0) await writeCache(RELAY_CACHE_KEY, { fetchedAt: config.now(), relays: fetched } satisfies CachedRelays);
      log.info(`/relays → ${fetched.length} relays`);
    } catch (e) {
      log.warn('/relays unavailable, using cache/hardcoded relays', errorMessage(e));
      fetched = cached?.relays;
    }
  }
  const merged: RelayInfo[] = [];
  const seen = new Set<string>();
  for (const r of [...(fetched ?? []), ...config.relays]) {
    if (seen.has(r.peerId)) continue;
    seen.add(r.peerId);
    merged.push(r);
  }
  return merged;
}

/** Delegated routing (`delegated-ipfs.dev/routing/v1/peers/<id>`) → WebTransport+certhash addrs of the relay. */
export async function delegatedRoutingWebTransportAddrs(relayPeerId: string, signal?: AbortSignal): Promise<string[]> {
  const data = (await fetchJson(
    `${config.delegatedRoutingUrl}/peers/${relayPeerId}`,
    { method: 'GET', headers: { accept: 'application/json' } },
    signal,
  )) as { Peers?: Array<{ ID?: string; Addrs?: unknown }> } | null;
  const out: string[] = [];
  for (const peer of data?.Peers ?? []) {
    if (peer.ID !== undefined && peer.ID !== relayPeerId) continue;
    for (const a of strArray(peer.Addrs) ?? []) {
      const ma = safeMultiaddr(a);
      if (ma !== undefined && isWebTransportAddr(ma) && hasCerthash(ma)) out.push(stripPeerSuffix(ma).toString());
    }
  }
  return sortRelayAddrs(out);
}

/**
 * WebTransport (certhash-bearing) addresses for a relay. Sources in order: `/relays[].addrs` → delegated routing →
 * build-time config. Cached per relay; `refresh` forces a re-query (after a certhash/WebTransport dial error).
 */
export async function relayWebTransportAddrs(
  relay: RelayInfo | string,
  opts: { refresh?: boolean; signal?: AbortSignal } = {},
): Promise<string[]> {
  const info: RelayInfo = typeof relay === 'string' ? { peerId: relay, multiaddr: '' } : relay;
  const key = `${RELAY_WT_CACHE_PREFIX}${info.peerId}`;
  const cached = await readCache<CachedWt>(key);
  if (cached !== undefined && !opts.refresh && config.now() - cached.fetchedAt < config.certhashTtlMs && cached.addrs.length > 0) {
    return cached.addrs;
  }

  // (a) advertised by the discovery worker (PR-C)
  const advertised = (info.addrs ?? [])
    .map(safeMultiaddr)
    .filter((ma): ma is Multiaddr => ma !== undefined && isWebTransportAddr(ma) && hasCerthash(ma))
    .map((ma) => stripPeerSuffix(ma).toString());
  if (advertised.length > 0) {
    const addrs = sortRelayAddrs(advertised);
    await writeCache(key, { fetchedAt: config.now(), addrs, source: 'relays.addrs' } satisfies CachedWt);
    return addrs;
  }

  // (b) delegated routing
  try {
    const addrs = await delegatedRoutingWebTransportAddrs(info.peerId, opts.signal);
    if (addrs.length > 0) {
      log.info(`delegated routing → ${addrs.length} WebTransport addrs for relay ${info.peerId}`);
      await writeCache(key, { fetchedAt: config.now(), addrs, source: 'delegated-routing' } satisfies CachedWt);
      return addrs;
    }
    log.warn(`delegated routing has no WebTransport address for relay ${info.peerId}`);
  } catch (e) {
    log.warn(`delegated routing lookup failed for relay ${info.peerId}`, errorMessage(e));
  }

  // (c) build-time (tools/relay-probe → VITE_RELAY_WT_ADDRS)
  const buildTime = (config.relayWebTransportAddrs[info.peerId] ?? [])
    .map(safeMultiaddr)
    .filter((ma): ma is Multiaddr => ma !== undefined && isWebTransportAddr(ma) && hasCerthash(ma))
    .map((ma) => stripPeerSuffix(ma).toString());
  if (buildTime.length > 0) return sortRelayAddrs(buildTime);

  // stale cache beats nothing (kubo advertises current+next hashes, so a ≤14-day-old hash may still work)
  return cached?.addrs ?? [];
}

/** Tier 1: `/find-box` raw circuit addresses for the Blox; empty on any failure. */
export async function findBoxAddrs(bloxPeerId: string, signal?: AbortSignal): Promise<string[]> {
  try {
    const data = await fetchJson(
      `${config.discoveryUrl}/find-box`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'x-fula-client': config.clientHeader },
        body: JSON.stringify({ peerId: bloxPeerId }),
      },
      signal,
    );
    const addrs = parseFindBoxResponse(data);
    log.info(`/find-box → ${addrs.length} addrs for ${bloxPeerId}`);
    return addrs;
  } catch (e) {
    log.warn('/find-box unavailable', errorMessage(e));
    return [];
  }
}

// ------------------------------------------------------------------------------------------------------ candidates

export type CandidateSource = 'override' | 'blox-addr' | 'find-box' | 'relays' | 'hardcoded';

export interface Candidate {
  ma: Multiaddr;
  source: CandidateSource;
  /** Set for relay circuits. */
  relayPeerId?: string;
  relayed: boolean;
}

export interface ResolveOptions {
  /** The `bloxAddr` given to `newClient` (tier 0). */
  bloxAddr?: string;
  /** Re-query every network source (after a certhash error / on foreground / daily). */
  refresh?: boolean;
  signal?: AbortSignal;
}

export interface ResolvedCandidates {
  candidates: Candidate[];
  /** True when at least one relay circuit could not be rewritten because no certhash source answered. */
  certhashMissing: boolean;
}

/**
 * Ordered, de-duplicated dial candidates for `bloxPeerId`. Throws NO_CANDIDATES only when nothing at all could be
 * produced; a browser that ends up with TCP-only candidates gets NO_CERTHASH from the client after filtering.
 */
export async function resolveCandidates(bloxPeerId: string, opts: ResolveOptions = {}): Promise<ResolvedCandidates> {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  let certhashMissing = false;
  const add = (ma: Multiaddr, source: CandidateSource, relayPeerId?: string): void => {
    const s = ma.toString();
    if (seen.has(s)) return;
    seen.add(s);
    const c: Candidate = { ma, source, relayed: isCircuitAddr(ma) };
    if (relayPeerId !== undefined) c.relayPeerId = relayPeerId;
    out.push(c);
  };

  if (config.findBox !== undefined) {
    // Full override: tests and the fake-Blox harness supply the exact addresses.
    for (const s of await config.findBox(bloxPeerId, { signal: opts.signal })) {
      const ma = safeMultiaddr(s);
      if (ma !== undefined) add(ma, 'override', circuitParts(ma)?.relayPeerId);
    }
    if (out.length === 0) throw new FulaWebError('NO_CANDIDATES', `no dial candidates for ${bloxPeerId} (findBox override returned none)`);
    return { candidates: out, certhashMissing: false };
  }

  const deferredTcp: Array<{ ma: Multiaddr; source: CandidateSource; relayPeerId?: string }> = [];
  const wtCache = new Map<string, Promise<string[]>>();
  const wtFor = (relay: RelayInfo | string): Promise<string[]> => {
    const id = typeof relay === 'string' ? relay : relay.peerId;
    let p = wtCache.get(id);
    if (p === undefined) {
      p = relayWebTransportAddrs(relay, { refresh: opts.refresh, signal: opts.signal });
      wtCache.set(id, p);
    }
    return p;
  };

  const addRaw = async (raw: string, source: CandidateSource): Promise<void> => {
    const ma = safeMultiaddr(raw);
    if (ma === undefined) return;
    const target = lastPeerId(ma);
    const full = target === undefined ? multiaddr(`${ma.toString()}/p2p/${bloxPeerId}`) : ma;
    if (target !== undefined && target !== bloxPeerId) {
      log.warn(`ignoring ${source} address for a different peer`, raw);
      return;
    }
    if (isCircuitAddr(full)) {
      const parts = circuitParts(full);
      if (parts?.relayPeerId === undefined) return;
      if (isWebTransportAddr(parts.relayTransport) && hasCerthash(parts.relayTransport)) {
        add(full, source, parts.relayPeerId);
        return;
      }
      const wt = await wtFor(parts.relayPeerId);
      if (wt.length === 0) certhashMissing = true;
      for (const rewritten of rewriteCircuitForBrowser(full, wt)) add(rewritten, source, parts.relayPeerId);
      deferredTcp.push({ ma: full, source, relayPeerId: parts.relayPeerId });
      return;
    }
    add(full, source);
  };

  // Tier 0: explicit bloxAddr
  if (opts.bloxAddr !== undefined && opts.bloxAddr.length > 0) await addRaw(opts.bloxAddr, 'blox-addr');

  // Tier 1: /find-box
  for (const raw of await findBoxAddrs(bloxPeerId, opts.signal)) await addRaw(raw, 'find-box');

  // Tier 2/3: relays (cached /relays, then hardcoded)
  const relays = await listRelays({ refresh: opts.refresh, signal: opts.signal });
  for (const relay of relays) {
    const source: CandidateSource = config.relays.some((r) => r.peerId === relay.peerId) ? 'hardcoded' : 'relays';
    const wt = await wtFor(relay);
    if (wt.length === 0) certhashMissing = true;
    for (const w of wt) add(buildCircuit(w, relay.peerId, bloxPeerId), source, relay.peerId);
    const tcp = safeMultiaddr(`${relay.multiaddr}/p2p-circuit/p2p/${bloxPeerId}`);
    if (tcp !== undefined) deferredTcp.push({ ma: tcp, source, relayPeerId: relay.peerId });
  }

  for (const d of deferredTcp) add(d.ma, d.source, d.relayPeerId);

  if (out.length === 0) throw new FulaWebError('NO_CANDIDATES', `no dial candidates for ${bloxPeerId}`);
  log.info(`resolved ${out.length} candidates for ${bloxPeerId}`, out.map((c) => `${c.source}:${c.ma.toString()}`));
  return { candidates: out, certhashMissing };
}

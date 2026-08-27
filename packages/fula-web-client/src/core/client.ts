/**
 * Single-node client lifecycle (plan §WS1 "Lifecycle / errors") — the web counterpart of go-fula `mobile.Client`
 * + react-native-fula's `FulaModule` (Java/Swift).
 *
 * Mobile semantics mirrored here (verified in E:\GitHub\go-fula\mobile and react-native-fula FulaModule.java):
 *   - newClient(identity, storePath, bloxAddr, exchange, autoFlush, useRelay, refresh) → the app peer id string.
 *     The identity is derived exactly like go-fula (`core/identity.ts`). `bloxAddr` must end with `/p2p/<blox>`
 *     unless `exchange === 'noop'` (mobile/config.go raises the same error). `storePath`, `autoFlush` and
 *     `useRelay` have no meaning in the browser (no datastore; the browser is always relay-capable) and are only
 *     logged. Calls are serialised; a second call with the same identity + bloxAddr and `refresh=false` reuses the
 *     running client, anything else stops the old node first.
 *   - As the plan requires, newClient dials + probes `/x/fula-ping` but resolves with the peer id even if that fails
 *     (mobile's newClient never fails on connectivity either — `checkConnection` is the app's probe).
 *   - isReady(filesystemCheck) → "a client exists" (FulaModule: `fula != null && fula.id() != null`).
 *   - checkConnection(timeoutSec=20) → boolean, never rejects (FulaModule catches everything → false).
 *   - ping(timeoutSec) → JSON string `{success, successes, avg_rtt_ms, errors}` from 3 libp2p pings
 *     (mobile/client.go Ping); rejects with NOT_INITIALIZED when there is no client ("Fula is not initialized").
 *   - logout → shutdown + true; shutdown → idempotent.
 *   - Signed actions: request timeout 65 s (go-fula `WithTimeout(65)`), ≤ 4 streams in flight, one request per
 *     stream, `runOnLimitedConnection: true` (relay circuits are limited connections).
 *   - 401 handling: go-fula answers 401 for BOTH a bad signature/skewed timestamp and an unauthorized peer, so we
 *     re-learn the clock offset from `/x/fula-ping` and retry ONCE, then surface NOT_AUTHORIZED.
 */
import type { Connection, PeerId, Stream } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';
import { multiaddr } from '@multiformats/multiaddr';
import { ClockSync } from './clock.js';
import {
  DEFAULT_MAX_CONNECTION_AGE_MS,
  DEFAULT_MAX_CONNECTION_BYTES,
  DEFAULT_OVERALL_MS,
  DEFAULT_PER_CANDIDATE_MS,
  dialCandidates,
  isConnectionFatal,
  mapStreamError,
  needsRedial,
  noteBytes,
  trackConnection,
  type TrackedConnection,
} from './dial.js';
import {
  configureDiscovery,
  getDiscoveryConfig,
  isCircuitAddr,
  keyRelayWebTransportAddrs,
  lastPeerId,
  resetDiscovery,
  resolveCandidates,
  type Candidate,
  type DiscoveryConfig,
} from './discovery.js';
import { utf8 } from './encoding.js';
import { FulaWebError, errorMessage, isFulaWebError } from './errors.js';
import { decodeText, requestOverDuplex, streamToByteDuplex, type HttpRequestInit, type RequestResult } from './httpOverStream.js';
import { identityFromSecretKey, identityStringFromSecretKey, type FulaIdentity } from './identity.js';
import { createLogger } from './log.js';
import { createBrowserNode, type FulaNode, type NodeFactory, type NodeOptions } from './node.js';
import { signHeaders } from './signing.js';

const log = createLogger('client');

/** kubo `p2p listen --allow-custom-protocol` forwarders on the Blox → go-fula :4020 / :4021. */
export const BLOCKCHAIN_PROTOCOL = '/x/fula-blockchain';
export const PING_PROTOCOL = '/x/fula-ping';

export interface ClientConfig {
  /** How the libp2p node is created — browser by default; tests inject the TCP variant. */
  nodeFactory: NodeFactory;
  nodeOptions: NodeOptions;
  /** go-fula `blockchain.WithTimeout(65)`. */
  requestTimeoutMs: number;
  /** Budget for one `/x/fula-ping` probe. */
  pingTimeoutMs: number;
  /** Max concurrent action streams. */
  maxInFlight: number;
  perCandidateMs: number;
  overallDialMs: number;
  maxConnectionAgeMs: number;
  maxConnectionBytes: number;
  /** Dial + probe inside newClient (plan). */
  connectOnNewClient: boolean;
  /** Re-run discovery when the candidate list is older than this. */
  candidateTtlMs: number;
  now: () => number;
}

/** Aliases used by the app's `FulaClientConfig` contract (apps/fxblox-web/src/lib/fula/types.ts). */
export interface ConfigureAliases {
  /** Flat list of relay WebTransport addresses (`…/webtransport/certhash/…`, optionally with `/p2p/<relay>`); keyed to relays by peer id or host. */
  relayWtAddrs?: string[];
  requestTimeoutSec?: number;
}

export type ConfigureOptions = Partial<ClientConfig> & Partial<DiscoveryConfig> & ConfigureAliases;

const CLIENT_KEYS: ReadonlySet<string> = new Set<keyof ClientConfig>([
  'nodeFactory',
  'nodeOptions',
  'requestTimeoutMs',
  'pingTimeoutMs',
  'maxInFlight',
  'perCandidateMs',
  'overallDialMs',
  'maxConnectionAgeMs',
  'maxConnectionBytes',
  'connectOnNewClient',
  'candidateTtlMs',
  'now',
]);

function defaultConfig(): ClientConfig {
  return {
    nodeFactory: createBrowserNode,
    nodeOptions: {},
    requestTimeoutMs: 65_000,
    pingTimeoutMs: 20_000,
    maxInFlight: 4,
    perCandidateMs: DEFAULT_PER_CANDIDATE_MS,
    overallDialMs: DEFAULT_OVERALL_MS,
    maxConnectionAgeMs: DEFAULT_MAX_CONNECTION_AGE_MS,
    maxConnectionBytes: DEFAULT_MAX_CONNECTION_BYTES,
    connectOnNewClient: true,
    candidateTtlMs: 24 * 60 * 60 * 1000,
    now: () => Date.now(),
  };
}

let cfg: ClientConfig = defaultConfig();

/**
 * Runtime configuration. Client keys (`nodeFactory`, timeouts, …) and discovery keys (`findBox`, `relays`,
 * `fetch`, `kv`, `relayWebTransportAddrs`, …) can be mixed in one call; `undefined` values are ignored.
 */
export function configure(opts: ConfigureOptions): void {
  const { relayWtAddrs, requestTimeoutSec, ...rest } = opts;
  const clientPatch: Record<string, unknown> = {};
  const discoveryPatch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined && k !== 'findBox') continue;
    (CLIENT_KEYS.has(k) ? clientPatch : discoveryPatch)[k] = v;
  }
  if (requestTimeoutSec !== undefined) clientPatch['requestTimeoutMs'] = requestTimeoutSec * 1000;
  if (relayWtAddrs !== undefined) {
    discoveryPatch['relayWebTransportAddrs'] = keyRelayWebTransportAddrs(relayWtAddrs, rest.relays ?? getDiscoveryConfig().relays);
  }
  cfg = { ...cfg, ...(clientPatch as Partial<ClientConfig>) };
  configureDiscovery(discoveryPatch as Partial<DiscoveryConfig>);
}

export function getConfig(): ClientConfig {
  return cfg;
}

/** Back to defaults (tests). Does not stop a running client. */
export function resetConfig(): void {
  cfg = defaultConfig();
  resetDiscovery();
}

function combine(signals: Array<AbortSignal | undefined>): AbortSignal {
  return AbortSignal.any(signals.filter((s): s is AbortSignal => s !== undefined));
}

export interface PingProbeResult {
  ok: boolean;
  rttMs: number;
  /** Whether the server timestamp was usable for clock sync. */
  clockLearned: boolean;
  raw: Record<string, unknown>;
}

export interface ActionResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  /** Response body as text (go-fula always answers JSON or an `http.Error` text). */
  body: string;
  action: string;
}

export interface ClientState {
  appPeerId: string;
  bloxPeerId: string | undefined;
  bloxAddr: string;
  connected: boolean;
  relayed: boolean | undefined;
  remoteAddr: string | undefined;
  connectionAgeMs: number | undefined;
  connectionBytes: number | undefined;
  clockOffsetSeconds: number;
  lastError: { code: string; message: string } | undefined;
}

/**
 * Parses the Blox peer id from the trailing `/p2p/<id>` of a multiaddr (for a relay circuit the LAST p2p
 * component is the Blox — the relay's id sits before `/p2p-circuit`). Empty string → undefined.
 */
export function parseBloxPeerId(bloxAddr: string): PeerId | undefined {
  if (bloxAddr.length === 0) return undefined;
  let id: string | undefined;
  try {
    id = lastPeerId(multiaddr(bloxAddr));
  } catch (e) {
    throw new FulaWebError('INVALID_ARGUMENT', `bloxAddr is not a valid multiaddr: ${errorMessage(e)}`, { cause: e });
  }
  if (id === undefined) throw new FulaWebError('INVALID_ARGUMENT', 'bloxAddr must end with /p2p/<blox peer id>');
  try {
    return peerIdFromString(id);
  } catch (e) {
    throw new FulaWebError('INVALID_ARGUMENT', `bloxAddr has an invalid peer id: ${errorMessage(e)}`, { cause: e });
  }
}

export class FulaClient {
  readonly clock: ClockSync;
  tracked: TrackedConnection | undefined;
  closed = false;
  lastError: FulaWebError | undefined;
  private refreshDiscovery = false;
  private candidatesAt = Number.NEGATIVE_INFINITY;
  private dropped = false;
  private inFlight = 0;
  private readonly waiters: Array<() => void> = [];
  private readonly onVisibility: (() => void) | undefined;

  constructor(
    readonly identity: FulaIdentity,
    readonly node: FulaNode,
    readonly bloxAddr: string,
    readonly bloxPeerId: PeerId | undefined,
  ) {
    this.clock = new ClockSync(cfg.now);
    // Foreground after a long background: the relay may have dropped us without us noticing yet, and the
    // certhash list may have rotated. Mark the connection suspect + force a discovery refresh on the next dial.
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      this.onVisibility = () => {
        if (document.visibilityState === 'visible') {
          if (this.tracked !== undefined) this.tracked.suspect = true;
          this.refreshDiscovery = true;
          log.debug('foreground → connection marked suspect, discovery will refresh');
        }
      };
      document.addEventListener('visibilitychange', this.onVisibility);
    }
  }

  get appPeerId(): string {
    return this.identity.peerIdString;
  }

  get bloxPeerIdString(): string | undefined {
    return this.bloxPeerId?.toString();
  }

  private requireBox(): PeerId {
    if (this.bloxPeerId === undefined) {
      throw new FulaWebError('NO_CANDIDATES', 'no Blox address: newClient was called without a bloxAddr (exchange "noop")');
    }
    return this.bloxPeerId;
  }

  /** Reuse the tracked connection, or dial (candidate order: bloxAddr → find-box → relays → hardcoded). */
  async ensureConnected(opts: { signal?: AbortSignal; refresh?: boolean } = {}): Promise<TrackedConnection> {
    if (this.closed) throw new FulaWebError('CLIENT_CLOSED', 'the client was shut down');
    const box = this.requireBox();
    const now = cfg.now;
    const limits = { maxAgeMs: cfg.maxConnectionAgeMs, maxBytes: cfg.maxConnectionBytes };

    const t = this.tracked;
    if (t !== undefined) {
      const check = needsRedial(t, limits, now());
      if (check.redial) {
        log.info(`redialing: ${check.reason ?? 'redial'}`);
        this.dropConnection(check.reason ?? 'redial');
      } else if (t.suspect) {
        // After a background period libp2p may still report 'open' while the OS dropped the socket/QUIC state.
        // A cheap liveness ping decides between reuse and redial instead of letting the next request hang.
        if (await this.isAlive(t, opts.signal)) {
          t.suspect = false;
          log.debug('suspect connection answered a libp2p ping — reusing');
          return t;
        }
        this.dropConnection('failed the liveness ping after foreground');
      } else {
        return t;
      }
    }

    // libp2p may already hold an open connection to the Blox (e.g. opened by a libp2p ping) — adopt it.
    const existing = this.node.getConnections(box).find((c: Connection) => c.status === 'open');
    if (existing !== undefined && !this.dropped) {
      const candidate: Candidate = { ma: existing.remoteAddr, source: 'override', relayed: isCircuitAddr(existing.remoteAddr) };
      this.tracked = trackConnection(existing, candidate, now());
      log.debug('adopting existing libp2p connection', existing.remoteAddr.toString());
      return this.tracked;
    }

    const refresh = opts.refresh === true || this.refreshDiscovery || now() - this.candidatesAt > cfg.candidateTtlMs;
    const resolved = await resolveCandidates(box.toString(), { bloxAddr: this.bloxAddr, refresh, signal: opts.signal });
    this.candidatesAt = now();
    this.refreshDiscovery = false;

    const dialable: Candidate[] = [];
    for (const c of resolved.candidates) {
      if (await this.node.isDialable(c.ma)) dialable.push(c);
      else log.debug('skipping candidate this runtime cannot dial', c.ma.toString());
    }
    if (dialable.length === 0) {
      if (resolved.certhashMissing) {
        throw new FulaWebError(
          'NO_CERTHASH',
          `no WebTransport certhash is known for any relay of ${box.toString()} (discovery and delegated routing unreachable?)`,
        );
      }
      throw new FulaWebError('NO_CANDIDATES', `none of the ${resolved.candidates.length} candidates for ${box.toString()} is dialable here`);
    }

    try {
      const tracked = await dialCandidates(this.node, dialable, {
        perCandidateMs: cfg.perCandidateMs,
        overallMs: cfg.overallDialMs,
        signal: opts.signal,
        now,
        force: this.dropped,
      });
      this.tracked = tracked;
      this.dropped = false;
      this.lastError = undefined;
      return tracked;
    } catch (e) {
      const err = isFulaWebError(e) ? e : new FulaWebError('DIAL_FAILED', errorMessage(e), { cause: e });
      this.lastError = err;
      // A stale certhash is the one dial failure discovery can fix → refresh next time.
      if (err.code === 'NO_CERTHASH') this.refreshDiscovery = true;
      throw err;
    }
  }

  dropConnection(reason: string): void {
    const t = this.tracked;
    this.tracked = undefined;
    if (t === undefined) return;
    this.dropped = true;
    log.debug(`dropping connection: ${reason}`);
    t.connection.close().catch(() => t.connection.abort(new Error(reason)));
  }

  /** libp2p ping with a short budget — used to validate a connection marked suspect on foreground. */
  private async isAlive(t: TrackedConnection, signal?: AbortSignal): Promise<boolean> {
    try {
      await this.node.services.ping.ping(t.connection.remotePeer, { signal: combine([signal, AbortSignal.timeout(5_000)]), runOnLimitedConnection: true });
      return t.connection.status === 'open';
    } catch (e) {
      log.info('liveness ping failed', errorMessage(e));
      return false;
    }
  }

  private async openStream(protocol: string, signal: AbortSignal): Promise<{ stream: Stream; tracked: TrackedConnection }> {
    const tracked = await this.ensureConnected({ signal });
    try {
      // runOnLimitedConnection: relay circuits carry limits; without this libp2p refuses to open the stream.
      const stream = await tracked.connection.newStream(protocol, { signal, runOnLimitedConnection: true });
      return { stream, tracked };
    } catch (e) {
      const err = mapStreamError(e, tracked);
      if (isConnectionFatal(err)) this.dropConnection(err.code);
      throw err;
    }
  }

  /** One request over a fresh stream on `protocol`; accounts bytes against the relay budget. */
  private async exchange(protocol: string, req: HttpRequestInit, signal: AbortSignal): Promise<RequestResult> {
    const { stream, tracked } = await this.openStream(protocol, signal);
    const duplex = streamToByteDuplex(stream);
    try {
      const result = await requestOverDuplex(duplex, req, { signal });
      noteBytes(tracked, result.bytesRead + result.bytesWritten);
      return result;
    } catch (e) {
      const err = this.closed ? new FulaWebError('CLIENT_CLOSED', 'the client was shut down during the request', { cause: e }) : mapStreamError(e, tracked, req.path.slice(1));
      duplex.abort(err);
      if (isConnectionFatal(err)) this.dropConnection(err.code);
      throw err;
    }
  }

  /** `GET /` on `/x/fula-ping` → `{success, timestamp, peer_id, uptime_ms, …}`; learns the clock offset. */
  async probePing(opts: { signal?: AbortSignal } = {}): Promise<PingProbeResult> {
    const box = this.requireBox();
    const signal = combine([opts.signal, AbortSignal.timeout(cfg.pingTimeoutMs)]);
    const sentAt = cfg.now();
    const result = await this.exchange(PING_PROTOCOL, { method: 'GET', path: '/', host: `${box.toString()}.invalid` }, signal);
    const receivedAt = cfg.now();
    const text = decodeText(result.response.body);
    let raw: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed === 'object' && parsed !== null) raw = parsed as Record<string, unknown>;
    } catch {
      throw new FulaWebError('BAD_RESPONSE', `/x/fula-ping answered ${result.response.status} with non-JSON: ${text.slice(0, 120)}`, {
        status: result.response.status,
      });
    }
    const ts = raw['timestamp'];
    const clockLearned = this.clock.learn(typeof ts === 'number' || typeof ts === 'string' ? ts : undefined, sentAt, receivedAt);
    const ok = result.response.status === 200 && raw['success'] === true;
    log.info(`/x/fula-ping ${ok ? 'ok' : 'NOT ok'} rtt=${receivedAt - sentAt} ms offset=${this.clock.offsetSeconds} s`, {
      peer_id: raw['peer_id'],
      uptime_ms: raw['uptime_ms'],
    });
    return { ok, rttMs: receivedAt - sentAt, clockLearned, raw };
  }

  /** Signed action with the 401 → re-sync → retry-once rule. Status checking is the caller's job. */
  async request(spec: { action: string }, body: string, opts: { signal?: AbortSignal } = {}): Promise<ActionResponse> {
    if (this.closed) throw new FulaWebError('CLIENT_CLOSED', 'the client was shut down');
    const box = this.requireBox();
    await this.acquire();
    try {
      const signal = combine([opts.signal, AbortSignal.timeout(cfg.requestTimeoutMs)]);
      let res = await this.sendSigned(box, spec.action, body, signal);
      if (res.status === 401) {
        log.warn(`${spec.action} → 401; re-learning the clock offset from /x/fula-ping and retrying once`);
        try {
          await this.probePing({ signal });
        } catch (e) {
          log.warn('clock re-sync failed, retrying with the current offset', errorMessage(e));
        }
        res = await this.sendSigned(box, spec.action, body, signal);
        if (res.status === 401) {
          throw new FulaWebError(
            'NOT_AUTHORIZED',
            `this browser identity ${this.appPeerId} is not authorized on Blox ${box.toString()} — pair it from the setup flow, or check the clock (±5 min)`,
            { status: 401, action: spec.action, peerId: this.appPeerId },
          );
        }
      }
      return res;
    } finally {
      this.release();
    }
  }

  private async sendSigned(box: PeerId, action: string, body: string, signal: AbortSignal): Promise<ActionResponse> {
    const bodyBytes = utf8(body);
    if (bodyBytes.byteLength > cfg.maxConnectionBytes) {
      throw new FulaWebError('CIRCUIT_DATA_CAP', `request body of ${bodyBytes.byteLength} bytes exceeds the relay data budget`, { action });
    }
    const headers = await signHeaders(this.identity, action, bodyBytes, this.clock.nowSeconds());
    const result = await this.exchange(
      BLOCKCHAIN_PROTOCOL,
      { method: 'POST', path: `/${action}`, host: `${box.toString()}.invalid`, headers: { ...headers }, body: bodyBytes },
      signal,
    );
    const r = result.response;
    log.debug(`${action} → ${r.status} ${r.statusText} (${r.body.byteLength} B)`);
    return { status: r.status, statusText: r.statusText, headers: r.headers, body: decodeText(r.body), action };
  }

  /** libp2p `/ipfs/ping/1.0.0` round trip (ms) — the fallback when `/x/fula-ping` is not mounted (older firmware). */
  async libp2pPing(signal: AbortSignal): Promise<number> {
    const box = this.requireBox();
    return this.node.services.ping.ping(box, { signal, runOnLimitedConnection: true });
  }

  state(): ClientState {
    const t = this.tracked;
    const connected = t !== undefined && t.connection.status === 'open';
    return {
      appPeerId: this.appPeerId,
      bloxPeerId: this.bloxPeerIdString,
      bloxAddr: this.bloxAddr,
      connected,
      relayed: t?.relayed,
      remoteAddr: t?.connection.remoteAddr.toString(),
      connectionAgeMs: t === undefined ? undefined : cfg.now() - t.openedAt,
      connectionBytes: t?.bytes,
      clockOffsetSeconds: this.clock.offsetSeconds,
      lastError: this.lastError === undefined ? undefined : { code: this.lastError.code, message: this.lastError.message },
    };
  }

  async shutdown(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.onVisibility !== undefined) document.removeEventListener('visibilitychange', this.onVisibility);
    this.tracked = undefined;
    for (const w of this.waiters.splice(0)) w();
    try {
      await this.node.stop();
    } catch (e) {
      log.warn('node.stop() failed', errorMessage(e));
    }
  }

  private acquire(): Promise<void> {
    if (this.inFlight < cfg.maxInFlight) {
      this.inFlight++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.inFlight++;
        resolve();
      });
    });
  }

  private release(): void {
    this.inFlight--;
    const next = this.waiters.shift();
    if (next !== undefined) next();
  }
}

// ------------------------------------------------------------------------------------------------- module singleton

let current: FulaClient | undefined;
let lifecycle: Promise<unknown> = Promise.resolve();

/** Serialises lifecycle operations (newClient / logout / shutdown) — the "async-mutex" of the plan. */
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = lifecycle.then(fn, fn);
  lifecycle = run.catch(() => undefined);
  return run;
}

export function currentClient(): FulaClient | undefined {
  return current !== undefined && !current.closed ? current : undefined;
}

/** Throws NOT_INITIALIZED like FulaModule's `"Fula is not initialized"`. */
export function getClient(): FulaClient {
  const c = currentClient();
  if (c === undefined) throw new FulaWebError('NOT_INITIALIZED', 'Fula is not initialized — call fula.newClient() first');
  return c;
}

export async function newClient(
  identity: string | Uint8Array,
  storePath: string,
  bloxAddr: string,
  exchange: string,
  autoFlush = false,
  useRelay: boolean | null = true,
  refresh = false,
): Promise<string> {
  return serialized(async () => {
    const identityString = identityStringFromSecretKey(identity);
    const addr = bloxAddr.trim();
    if (addr.length === 0 && exchange !== 'noop') {
      // mobile/config.go: "the BloxAddr must be specified …; BloxAddr may be omitted only when Exchange is set to `noop`"
      throw new FulaWebError('INVALID_ARGUMENT', 'the bloxAddr must be specified (it may be omitted only when exchange is "noop")');
    }
    const existing = current;
    if (existing !== undefined && !existing.closed && !refresh && existing.identity.identityString === identityString && existing.bloxAddr === addr) {
      log.info('newClient: reusing the running client (same identity + bloxAddr, refresh=false)');
      return existing.appPeerId;
    }
    if (existing !== undefined) {
      await existing.shutdown();
      current = undefined;
    }

    const id = await identityFromSecretKey(identityString);
    const bloxPeerId = parseBloxPeerId(addr);
    const node = await cfg.nodeFactory(id.privateKey, cfg.nodeOptions);
    const client = new FulaClient(id, node, addr, bloxPeerId);
    current = client;
    log.info(`newClient: app peer ${id.peerIdString} → blox ${bloxPeerId?.toString() ?? '(none)'}`, {
      exchange,
      autoFlush,
      useRelay,
      hasStorePath: storePath.length > 0,
    });

    if (bloxPeerId !== undefined && cfg.connectOnNewClient) {
      try {
        await client.ensureConnected({ signal: AbortSignal.timeout(cfg.overallDialMs) });
        await client.probePing();
      } catch (e) {
        const err = isFulaWebError(e) ? e : new FulaWebError('DIAL_FAILED', errorMessage(e), { cause: e });
        client.lastError = err;
        log.warn(`newClient: initial connect/probe failed (${err.code}) — resolving with the peer id anyway, as mobile does`, err.message);
      }
    }
    return id.peerIdString;
  });
}

export async function isReady(_filesystemCheck = true): Promise<boolean> {
  return currentClient() !== undefined;
}

/** `/x/fula-ping` round trip, falling back to a libp2p ping; false on anything else. Never rejects. */
export async function checkConnection(timeoutSec = 20): Promise<boolean> {
  const c = currentClient();
  if (c === undefined) return false;
  const signal = AbortSignal.timeout(Math.max(1, timeoutSec) * 1000);
  try {
    await c.ensureConnected({ signal });
    const probe = await c.probePing({ signal });
    if (probe.ok) return true;
    log.warn('checkConnection: /x/fula-ping answered without success=true', probe.raw);
  } catch (e) {
    log.warn('checkConnection: /x/fula-ping failed, trying a libp2p ping', errorMessage(e));
    if (signal.aborted || c.closed) return false;
  }
  try {
    await c.ensureConnected({ signal });
    await c.libp2pPing(signal);
    return true;
  } catch (e) {
    log.warn('checkConnection: libp2p ping failed', errorMessage(e));
    return false;
  }
}

/** Mirrors go-fula mobile/client.go `Ping()`: ensure connected, 3 libp2p pings, JSON result (never throws once initialised). */
export async function ping(timeoutSec = 60): Promise<string> {
  const c = getClient();
  const signal = AbortSignal.timeout(Math.max(1, timeoutSec) * 1000);
  try {
    await c.ensureConnected({ signal });
  } catch (e) {
    return JSON.stringify({ success: false, successes: 0, avg_rtt_ms: 0, errors: [`connection failed: ${errorMessage(e)}`] });
  }
  let successes = 0;
  let totalRtt = 0;
  const errors: string[] = [];
  for (let i = 0; i < 3; i++) {
    try {
      const rtt = await c.libp2pPing(combine([signal, AbortSignal.timeout(10_000)]));
      successes++;
      totalRtt += rtt;
    } catch (e) {
      errors.push(`ping ${i + 1}: ${errorMessage(e)}`);
    }
  }
  return JSON.stringify({
    success: successes > 0,
    successes,
    avg_rtt_ms: successes > 0 ? Math.round(totalRtt / successes) : 0,
    errors,
  });
}

export async function logout(_identity: string, _storePath: string): Promise<boolean> {
  await shutdown();
  return true;
}

export async function shutdown(): Promise<void> {
  return serialized(async () => {
    const c = current;
    current = undefined;
    if (c !== undefined) await c.shutdown();
  });
}

export async function request(spec: { action: string }, body: string, opts: { signal?: AbortSignal } = {}): Promise<ActionResponse> {
  return getClient().request(spec, body, opts);
}

/** The Blox (kubo) peer id of the running client — what `fula-pool-join` puts in `peer_id`. */
export function requireBloxPeerId(): string {
  const id = getClient().bloxPeerIdString;
  if (id === undefined) throw new FulaWebError('NO_CANDIDATES', 'no Blox address: newClient was called without a bloxAddr');
  return id;
}

export function getClientState(): ClientState | undefined {
  return currentClient()?.state();
}

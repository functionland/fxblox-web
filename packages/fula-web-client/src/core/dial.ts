/**
 * Ordered candidate dialing + connection tracking (plan §WS1 "Dial strategy").
 *
 * - One candidate at a time, 20 s each, 90 s overall, all abortable.
 * - Relay circuits are limited connections (kubo's RelayService default: 30 min / 16 MiB per circuit, after which
 *   the relay RESETS the stream). We track age + bytes and redial proactively at 28 min / 12 MiB; a reset that
 *   still slips through is reported as RELAY_LIMIT.
 * - Error mapping turns js-libp2p's error zoo (AggregateError of per-address failures, circuit STATUS codes in the
 *   message text, WebTransport certificate failures, …) into FulaWebError codes the UI can act on.
 */
import type { Connection } from '@libp2p/interface';
import type { Candidate } from './discovery.js';
import { FulaWebError, errorMessage, errorName, flattenErrors, isFulaWebError, type FulaWebErrorCode } from './errors.js';
import { createLogger } from './log.js';
import type { FulaNode } from './node.js';

const log = createLogger('dial');

export const DEFAULT_PER_CANDIDATE_MS = 20_000;
export const DEFAULT_OVERALL_MS = 90_000;
/** Relay limit is 30 min → redial at 28. */
export const DEFAULT_MAX_CONNECTION_AGE_MS = 28 * 60 * 1000;
/** Relay limit is 16 MiB → redial at 12. */
export const DEFAULT_MAX_CONNECTION_BYTES = 12 * 1024 * 1024;

export interface ConnectionLimits {
  maxAgeMs: number;
  maxBytes: number;
}

export interface TrackedConnection {
  connection: Connection;
  candidate: Candidate;
  openedAt: number;
  /** Bytes written + read over `/x/…` streams (approximate relay budget accounting). */
  bytes: number;
  /** Through a relay (limited connection) — the relay limits apply. */
  relayed: boolean;
  /** Set on `visibilitychange` → verify before reuse. */
  suspect: boolean;
}

export function trackConnection(connection: Connection, candidate: Candidate, now: number): TrackedConnection {
  // Use libp2p's own open timestamp so an adopted (pre-existing) connection keeps its true age.
  const opened = connection.timeline.open;
  return {
    connection,
    candidate,
    openedAt: Number.isFinite(opened) && opened > 0 ? opened : now,
    bytes: 0,
    relayed: !connection.direct || connection.limits !== undefined || candidate.relayed,
    suspect: false,
  };
}

export function noteBytes(t: TrackedConnection, n: number): void {
  t.bytes += n;
}

/** Proactive redial decision. Uses the relay's own reported limits when they are tighter than our defaults. */
export function needsRedial(t: TrackedConnection, limits: ConnectionLimits, now: number): { redial: boolean; reason?: string } {
  if (t.connection.status !== 'open') return { redial: true, reason: `connection ${t.connection.status}` };
  if (!t.relayed) return { redial: false };
  const age = now - t.openedAt;
  if (age > limits.maxAgeMs) return { redial: true, reason: `relay circuit age ${Math.round(age / 1000)} s` };
  if (t.bytes > limits.maxBytes) return { redial: true, reason: `relay circuit bytes ${t.bytes}` };
  const remaining = t.connection.limits?.bytes;
  if (remaining !== undefined && remaining < BigInt(1024 * 1024)) return { redial: true, reason: `relay reports ${remaining} bytes left` };
  const seconds = t.connection.limits?.seconds;
  if (seconds !== undefined && seconds < 60) return { redial: true, reason: `relay reports ${seconds} s left` };
  return { redial: false };
}

// ---------------------------------------------------------------------------------------------------- error mapping

const PRIORITY: FulaWebErrorCode[] = ['NO_RESERVATION', 'RELAY_LIMIT', 'NO_CERTHASH', 'UNSUPPORTED_PROTOCOL', 'DIAL_TIMEOUT', 'DIAL_FAILED'];

function classifyOne(e: unknown, timedOut: boolean): FulaWebErrorCode {
  if (isFulaWebError(e)) return e.code;
  const name = errorName(e);
  const msg = errorMessage(e);
  if (/NO_RESERVATION/.test(msg)) return 'NO_RESERVATION';
  if (/RESOURCE_LIMIT_EXCEEDED/.test(msg)) return 'RELAY_LIMIT';
  if (/PERMISSION_DENIED|CONNECTION_FAILED/.test(msg)) return 'DIAL_FAILED';
  if (name === 'UnsupportedProtocolError') return 'UNSUPPORTED_PROTOCOL';
  if (/certhash|WebTransport|webtransport|certificate/i.test(msg) || name === 'WebTransportError' || name === 'InvalidCryptoExchangeError') {
    return 'NO_CERTHASH';
  }
  if (timedOut || name === 'TimeoutError' || name === 'AbortError' || /timed? ?out|aborted/i.test(msg)) return 'DIAL_TIMEOUT';
  return 'DIAL_FAILED';
}

/** Maps one candidate's dial failure. `timedOut` = our per-candidate signal fired. */
export function mapDialError(e: unknown, candidate: Candidate, timedOut: boolean): FulaWebError {
  const leaves = flattenErrors(e);
  const codes = leaves.map((leaf) => classifyOne(leaf, timedOut));
  const code = PRIORITY.find((p) => codes.includes(p)) ?? 'DIAL_FAILED';
  const detail = leaves.map((leaf) => `${errorName(leaf)}: ${errorMessage(leaf)}`).join('; ');
  const human: Record<string, string> = {
    NO_RESERVATION: 'the Blox has no reservation on this relay (offline, or paired to a different relay)',
    RELAY_LIMIT: 'the relay refused the circuit (resource limit)',
    NO_CERTHASH: 'WebTransport handshake with the relay failed (stale or missing certhash)',
    UNSUPPORTED_PROTOCOL: 'protocol not supported by the remote',
    DIAL_TIMEOUT: `dial timed out`,
    DIAL_FAILED: 'dial failed',
  };
  return new FulaWebError(code, `${human[code] ?? code} — ${candidate.ma.toString()} (${detail})`, { cause: e });
}

/**
 * True when a relayed connection is close enough to the relay limits (age, bytes, or the relay's own reported
 * remaining budget) that a reset is most plausibly the relay enforcing them — otherwise a reset means the Blox or
 * the network went away and must not be blamed on the relay.
 */
export function nearRelayLimit(t: TrackedConnection, now: number): boolean {
  if (!t.relayed) return false;
  if (now - t.openedAt > 25 * 60 * 1000) return true;
  if (t.bytes > 10 * 1024 * 1024) return true;
  const remaining = t.connection.limits?.bytes;
  if (remaining !== undefined && remaining < BigInt(1024 * 1024)) return true;
  const seconds = t.connection.limits?.seconds;
  if (seconds !== undefined && seconds < 60) return true;
  return false;
}

/** Maps a failure while opening a stream / mid-request. */
export function mapStreamError(e: unknown, tracked: TrackedConnection | undefined, action?: string, now: number = Date.now()): FulaWebError {
  if (isFulaWebError(e)) return e;
  const name = errorName(e);
  const msg = errorMessage(e);
  const opts = action === undefined ? { cause: e } : { cause: e, action };
  if (name === 'UnsupportedProtocolError') {
    return new FulaWebError('UNSUPPORTED_PROTOCOL', `the Blox does not speak this protocol (older firmware?): ${msg}`, opts);
  }
  if (name === 'TimeoutError' || name === 'AbortError') return new FulaWebError('TIMEOUT', `request timed out: ${msg}`, opts);
  if (name === 'LimitedConnectionError' || /DurationLimit|TransferLimit/.test(name)) return new FulaWebError('RELAY_LIMIT', msg, opts);
  if (/StreamReset|StreamAbort|ConnectionClosed|ConnectionClosing|MuxerClosed|StreamState|InactivityTimeout|ConnectionFailed/.test(name)) {
    if (tracked !== undefined && nearRelayLimit(tracked, now)) {
      return new FulaWebError('RELAY_LIMIT', `the relay circuit was reset near the relay limit (30 min / 16 MiB): ${name}: ${msg}`, opts);
    }
    const via = tracked?.relayed === true ? ' (relayed connection; the Blox or the relay went away)' : '';
    return new FulaWebError('STREAM_ERROR', `stream failed${via}: ${name}: ${msg}`, opts);
  }
  return new FulaWebError('STREAM_ERROR', `${name}: ${msg}`, opts);
}

/** Whether the connection should be dropped after this error (so the next request redials). */
export function isConnectionFatal(e: FulaWebError): boolean {
  return e.code === 'RELAY_LIMIT' || e.code === 'STREAM_ERROR' || e.code === 'TIMEOUT' || e.code === 'CLIENT_CLOSED';
}

// -------------------------------------------------------------------------------------------------------- dialing

export interface DialOptions {
  perCandidateMs?: number;
  overallMs?: number;
  signal?: AbortSignal;
  now?: () => number;
  /** Open a fresh connection even if libp2p still holds one to the peer (proactive redial). */
  force?: boolean;
}

function combine(signals: Array<AbortSignal | undefined>): AbortSignal {
  return AbortSignal.any(signals.filter((s): s is AbortSignal => s !== undefined));
}

/**
 * Dials the candidates in order and returns the first connection. Throws the highest-priority failure when all
 * fail (NO_RESERVATION beats a certhash error beats a timeout — the most actionable one for the UI).
 */
export async function dialCandidates(node: FulaNode, candidates: Candidate[], opts: DialOptions = {}): Promise<TrackedConnection> {
  if (candidates.length === 0) throw new FulaWebError('NO_CANDIDATES', 'no dial candidates');
  const now = opts.now ?? (() => Date.now());
  const perCandidateMs = opts.perCandidateMs ?? DEFAULT_PER_CANDIDATE_MS;
  const overall = AbortSignal.timeout(opts.overallMs ?? DEFAULT_OVERALL_MS);
  const outer = combine([overall, opts.signal]);
  const failures: FulaWebError[] = [];

  for (const [i, candidate] of candidates.entries()) {
    if (outer.aborted) break;
    const perSignal = AbortSignal.timeout(perCandidateMs);
    const signal = combine([outer, perSignal]);
    const started = now();
    log.info(`dial ${i + 1}/${candidates.length} (${candidate.source})`, candidate.ma.toString());
    try {
      const connection = await node.dial(candidate.ma, { signal, force: opts.force === true });
      const tracked = trackConnection(connection, candidate, now());
      log.info(`connected to ${connection.remotePeer.toString()} in ${now() - started} ms`, {
        addr: connection.remoteAddr.toString(),
        relayed: tracked.relayed,
        limits: connection.limits === undefined ? undefined : { bytes: connection.limits.bytes?.toString(), seconds: connection.limits.seconds },
      });
      return tracked;
    } catch (e) {
      const mapped = mapDialError(e, candidate, perSignal.aborted && !outer.aborted);
      failures.push(mapped);
      log.warn(`candidate failed after ${now() - started} ms: ${mapped.code}`, mapped.message);
    }
  }

  if (opts.signal?.aborted === true) {
    throw new FulaWebError('DIAL_TIMEOUT', 'dial aborted by caller', { cause: failures });
  }
  if (overall.aborted) {
    throw new FulaWebError('DIAL_TIMEOUT', `no candidate connected within ${opts.overallMs ?? DEFAULT_OVERALL_MS} ms`, { cause: failures });
  }
  const best = PRIORITY.map((code) => failures.find((f) => f.code === code)).find((f) => f !== undefined) ?? failures[0];
  const summary = failures.map((f) => `[${f.code}] ${f.message}`).join('\n');
  throw new FulaWebError(best?.code ?? 'DIAL_FAILED', `all ${candidates.length} candidates failed:\n${summary}`, { cause: failures });
}

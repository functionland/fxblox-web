/**
 * Error taxonomy of the web client.
 *
 * The first block mirrors the plan (§WS1 "Lifecycle / errors"); the second block are additions that
 * turned out to be necessary while implementing (documented in docs/STATUS-fula-web-client.md):
 *
 * - DIAL_FAILED        every candidate failed for a reason that is not a timeout / reservation / certhash
 * - STREAM_ERROR       the stream was reset or the connection dropped mid-request on a *direct* connection
 *                      (on a relayed connection the same condition maps to RELAY_LIMIT)
 * - NOT_INITIALIZED    an action was called before `fula.newClient()` (mobile rejects with "Fula is not initialized")
 * - UNSUPPORTED_ACTION a react-native-fula method that has no go-fula action reachable over the stream
 * - INVALID_ARGUMENT   bad caller input (e.g. a pool id that is not an integer)
 */
export type FulaWebErrorCode =
  | 'NOT_AUTHORIZED'
  | 'HTTP_ERROR'
  | 'BAD_RESPONSE'
  | 'NO_CANDIDATES'
  | 'NO_CERTHASH'
  | 'DIAL_TIMEOUT'
  | 'NO_RESERVATION'
  | 'RELAY_LIMIT'
  | 'CIRCUIT_DATA_CAP'
  | 'TIMEOUT'
  | 'CLIENT_CLOSED'
  | 'UNSUPPORTED_PROTOCOL'
  | 'DIAL_FAILED'
  | 'STREAM_ERROR'
  | 'NOT_INITIALIZED'
  | 'UNSUPPORTED_ACTION'
  | 'INVALID_ARGUMENT';

export interface FulaWebErrorOptions {
  status?: number;
  action?: string;
  cause?: unknown;
  /** The identity (app peer id) the request was signed with, when relevant. */
  peerId?: string;
}

export class FulaWebError extends Error {
  readonly code: FulaWebErrorCode;
  readonly status?: number;
  readonly action?: string;
  readonly peerId?: string;
  override readonly cause?: unknown;

  constructor(code: FulaWebErrorCode, message: string, opts: FulaWebErrorOptions = {}) {
    super(message);
    this.name = 'FulaWebError';
    this.code = code;
    if (opts.status !== undefined) this.status = opts.status;
    if (opts.action !== undefined) this.action = opts.action;
    if (opts.peerId !== undefined) this.peerId = opts.peerId;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}

export function isFulaWebError(e: unknown): e is FulaWebError {
  return e instanceof FulaWebError || (typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'FulaWebError');
}

/** `err.name` (libp2p errors set a static `name`), falling back to the constructor name. */
export function errorName(e: unknown): string {
  if (typeof e !== 'object' || e === null) return typeof e;
  const n = (e as { name?: unknown }).name;
  if (typeof n === 'string' && n.length > 0) return n;
  return e.constructor?.name ?? 'Error';
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Flattens AggregateError trees (js-libp2p wraps per-address dial failures in one). */
export function flattenErrors(e: unknown): unknown[] {
  if (e instanceof AggregateError) {
    return e.errors.flatMap((inner) => flattenErrors(inner));
  }
  return [e];
}

/**
 * Ring-buffer logger.
 *
 * - Entries are kept in memory (last `MAX_ENTRIES`) so the app's debug banner can copy them.
 * - In browsers the live buffer is exposed as `globalThis.__fula.logs` (plan §WS3 "Observability").
 * - Nothing is mirrored to the console unless `enableDebug(true)` was called, except errors — and even those
 *   are held back when they are caller preconditions (see `PRECONDITION_CODES`), so a silent
 *   `NOT_INITIALIZED` is deliberate, not a lost log: the ring buffer still holds it at its original level.
 * - Never log identities / secret keys — callers pass peer ids only.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  /** epoch ms */
  t: number;
  level: LogLevel;
  scope: string;
  msg: string;
  data?: unknown;
}

export interface FulaLogger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

const MAX_ENTRIES = 1000;
const entries: LogEntry[] = [];
let debugEnabled = false;
let sink: ((entry: LogEntry) => void) | undefined;

export function enableDebug(on = true): void {
  debugEnabled = on;
}

export function isDebugEnabled(): boolean {
  return debugEnabled;
}

/** Snapshot copy of the ring buffer (oldest first). */
export function getDebugLog(): LogEntry[] {
  return entries.slice();
}

export function clearDebugLog(): void {
  entries.length = 0;
}

/** Optional tap for the host app (e.g. to forward into its own clientLogger). */
export function setLogSink(fn: ((entry: LogEntry) => void) | undefined): void {
  sink = fn;
}

function safeData(data: unknown): unknown {
  if (data instanceof Error) {
    return { name: data.name, message: data.message, code: (data as { code?: unknown }).code };
  }
  return data;
}

/**
 * Failure codes that mean "the caller asked too early", not "something went wrong". The protocol modules are
 * verbatim ports of react-native-fula and log every rejection at `error`, but on the web a screen routinely
 * mounts and queries before `newClient()` has finished (or after `shutdown()`), and callers are expected to
 * handle these — they arrive as a typed `FulaWebError.code`. Mirroring them as console errors makes an
 * ordinary page load look broken and trips the E2E "no console errors" contract.
 */
const PRECONDITION_CODES = new Set(['NOT_INITIALIZED', 'CLIENT_CLOSED']);

function isPrecondition(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    'code' in data &&
    typeof (data as { code?: unknown }).code === 'string' &&
    PRECONDITION_CODES.has((data as { code: string }).code)
  );
}

function push(level: LogLevel, scope: string, msg: string, data?: unknown): void {
  const entry: LogEntry = { t: Date.now(), level, scope, msg };
  if (data !== undefined) entry.data = safeData(data);
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  try {
    sink?.(entry);
  } catch {
    // a broken sink must never break the client
  }
  // The ring buffer keeps the caller's level (diagnostics uploads still show the full picture); only the
  // console mirror is demoted, because that is what developers and the E2E console contract read.
  const consoleLevel: LogLevel = level === 'error' && isPrecondition(entry.data) ? 'warn' : level;
  if (debugEnabled || consoleLevel === 'error') {
    const line = `[fula:${scope}] ${msg}`;
    const fn =
      consoleLevel === 'debug'
        ? console.debug
        : consoleLevel === 'info'
          ? console.info
          : consoleLevel === 'warn'
            ? console.warn
            : console.error;
    if (entry.data !== undefined) fn(line, entry.data);
    else fn(line);
  }
}

export function createLogger(scope: string): FulaLogger {
  return {
    debug: (msg, data) => push('debug', scope, msg, data),
    info: (msg, data) => push('info', scope, msg, data),
    warn: (msg, data) => push('warn', scope, msg, data),
    error: (msg, data) => push('error', scope, msg, data),
  };
}

interface FulaGlobal {
  readonly logs: LogEntry[];
  getLogs(): LogEntry[];
  enableDebug(on?: boolean): void;
  clear(): void;
}

// `globalThis.__fula.logs` is the live array (the buffer is trimmed in place, so the reference stays valid).
const g = globalThis as typeof globalThis & { __fula?: FulaGlobal };
if (g.__fula === undefined) {
  g.__fula = {
    get logs() {
      return entries;
    },
    getLogs: getDebugLog,
    enableDebug,
    clear: clearDebugLog,
  };
}

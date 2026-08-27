/**
 * clientLogger — the `phoneLogger` port (apps/box side of blox-ai's phone_context contract, schema v1).
 *
 * Gathers the client-side state and ships it to POST /troubleshoot/phone-context when the user taps "Share my
 * context". PRIVACY: never leaves the user's blox. The Share modal shows the literal JSON before sending.
 *
 * Field names MUST match fula-ota `plugins/blox-ai/api/phone_context.schema.json` (v1). Web deviation: the
 * schema's `os` enum is closed to `android | ios`; the browser sends `android` on Android Chrome and `web`
 * elsewhere — `web` needs the enum extended in blox-ai (open item, listed in the status doc).
 */
import { kvStore, type KeyValueStore } from '@/platform/kvStore';
import { connectionInfo, onConnectionChange } from '@/platform/network';
import { appVersion, browserName, isAndroid, osName } from '@/platform/deviceInfo';

export type Transport = 'libp2p' | 'ble' | 'hotspot';

export interface ConnectionAttempt {
  ts: string; // ISO 8601 UTC
  transport: Transport;
  target_blox_id?: string;
  success: boolean;
  error?: string;
  duration_ms?: number;
}

export interface NetworkChange {
  ts: string;
  from?: string;
  to?: string;
}

export interface AppError {
  ts: string;
  screen?: string;
  error_summary: string;
}

export interface NetInfoSummary {
  is_connected?: boolean;
  is_internet_reachable?: boolean | null;
  type?: 'wifi' | 'cellular' | 'ethernet' | 'none' | 'bluetooth' | 'unknown' | 'wimax' | 'vpn';
  wifi_ssid?: string;
  wifi_strength?: number;
  cellular_generation?: '2g' | '3g' | '4g' | '5g' | 'unknown';
}

export interface PhoneContext {
  app_version: string;
  os: 'android' | 'ios' | 'web';
  os_version: string;
  device_model?: string;
  netinfo?: NetInfoSummary;
  recent_connection_attempts?: ConnectionAttempt[];
  last_successful_blox_interaction_ts?: string;
  recent_network_changes?: NetworkChange[];
  recent_app_errors?: AppError[];
}

const STORAGE_KEY = 'fula.phoneLogger.v1';
const MAX_CONNECTION_ATTEMPTS = 20;
const MAX_NETWORK_CHANGES = 10;
const MAX_APP_ERRORS = 10;

interface PersistedState {
  connection_attempts: ConnectionAttempt[];
  network_changes: NetworkChange[];
  app_errors: AppError[];
  last_successful_blox_interaction_ts?: string;
}

const EMPTY_STATE: PersistedState = { connection_attempts: [], network_changes: [], app_errors: [] };

let store: KeyValueStore = kvStore;
/** Test hook. */
export function _setStoreForTests(s: KeyValueStore): void {
  store = s;
}

let writeChain: Promise<void> = Promise.resolve();

async function readState(): Promise<PersistedState> {
  try {
    const raw = await store.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_STATE };
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      connection_attempts: Array.isArray(parsed.connection_attempts) ? parsed.connection_attempts : [],
      network_changes: Array.isArray(parsed.network_changes) ? parsed.network_changes : [],
      app_errors: Array.isArray(parsed.app_errors) ? parsed.app_errors : [],
      last_successful_blox_interaction_ts:
        typeof parsed.last_successful_blox_interaction_ts === 'string' ? parsed.last_successful_blox_interaction_ts : undefined,
    };
  } catch {
    return { ...EMPTY_STATE };
  }
}

async function writeState(s: PersistedState): Promise<void> {
  try {
    await store.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* non-fatal */
  }
}

function enqueueWrite(mutator: (s: PersistedState) => PersistedState): Promise<void> {
  const next = writeChain.then(async () => {
    const cur = await readState();
    const updated = mutator(cur);
    await writeState(updated);
  });
  writeChain = next.catch(() => undefined);
  return next;
}

export function recordConnectionAttempt(a: ConnectionAttempt): Promise<void> {
  return enqueueWrite((s) => {
    const arr = [...s.connection_attempts, a].slice(-MAX_CONNECTION_ATTEMPTS);
    return {
      ...s,
      connection_attempts: arr,
      last_successful_blox_interaction_ts: a.success ? a.ts : s.last_successful_blox_interaction_ts,
    };
  });
}

export function recordNetworkChange(c: NetworkChange): Promise<void> {
  return enqueueWrite((s) => ({ ...s, network_changes: [...s.network_changes, c].slice(-MAX_NETWORK_CHANGES) }));
}

export function recordAppError(e: AppError): Promise<void> {
  return enqueueWrite((s) => ({ ...s, app_errors: [...s.app_errors, e].slice(-MAX_APP_ERRORS) }));
}

// ---- network-change subscriber (installed once at boot) ----

let netUnsubscribe: (() => void) | null = null;
let lastSeenNetwork: string | null = null;

function describeNetwork(): string {
  const c = connectionInfo();
  if (!c.online) return 'none';
  const t = c.type ?? 'unknown';
  return c.effectiveType ? `${t}:${c.effectiveType}` : t;
}

export function installNetworkLogger(): () => void {
  if (netUnsubscribe) return netUnsubscribe;
  lastSeenNetwork = describeNetwork();
  const off = onConnectionChange(() => {
    const cur = describeNetwork();
    if (cur !== lastSeenNetwork) {
      const change: NetworkChange = { ts: new Date().toISOString() };
      if (lastSeenNetwork) change.from = lastSeenNetwork;
      if (cur) change.to = cur;
      if (change.from || change.to) void recordNetworkChange(change);
      lastSeenNetwork = cur;
    }
  });
  netUnsubscribe = () => {
    off();
    netUnsubscribe = null;
    lastSeenNetwork = null;
  };
  return netUnsubscribe;
}

// ---- gatherContext ----

function mapConnectionType(t: string | undefined): NetInfoSummary['type'] {
  switch (t) {
    case 'wifi':
    case 'cellular':
    case 'ethernet':
    case 'none':
    case 'bluetooth':
    case 'wimax':
    case 'vpn':
      return t;
    default:
      return 'unknown';
  }
}

export async function gatherContext(): Promise<PhoneContext> {
  const state = await readState();

  let netinfo: NetInfoSummary | undefined;
  try {
    const c = connectionInfo();
    netinfo = { is_connected: c.online, is_internet_reachable: null, type: mapConnectionType(c.type) };
    if (c.effectiveType && /^(2g|3g|4g|5g)$/.test(c.effectiveType) && c.type === 'cellular') {
      netinfo.cellular_generation = c.effectiveType as NetInfoSummary['cellular_generation'];
    }
  } catch {
    /* leave undefined */
  }

  const ctx: PhoneContext = {
    app_version: truncate(appVersion, 32),
    os: isAndroid() ? 'android' : 'web',
    os_version: truncate(osName(), 32),
    device_model: truncate(browserName(), 64),
  };
  if (netinfo) ctx.netinfo = netinfo;
  if (state.connection_attempts.length > 0) {
    ctx.recent_connection_attempts = state.connection_attempts.slice(-MAX_CONNECTION_ATTEMPTS).map(sanitizeAttempt);
  }
  if (state.network_changes.length > 0) {
    ctx.recent_network_changes = state.network_changes.slice(-MAX_NETWORK_CHANGES).map(sanitizeNetworkChange);
  }
  if (state.app_errors.length > 0) {
    ctx.recent_app_errors = state.app_errors.slice(-MAX_APP_ERRORS).map(sanitizeAppError);
  }
  if (state.last_successful_blox_interaction_ts) {
    ctx.last_successful_blox_interaction_ts = state.last_successful_blox_interaction_ts;
  }
  return ctx;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

function sanitizeAttempt(a: ConnectionAttempt): ConnectionAttempt {
  const out: ConnectionAttempt = { ts: a.ts, transport: a.transport, success: a.success };
  if (a.target_blox_id) out.target_blox_id = truncate(a.target_blox_id, 128);
  if (a.error) out.error = truncate(a.error, 500);
  if (typeof a.duration_ms === 'number') out.duration_ms = Math.max(0, Math.min(600000, Math.floor(a.duration_ms)));
  return out;
}

function sanitizeNetworkChange(c: NetworkChange): NetworkChange {
  const out: NetworkChange = { ts: c.ts };
  if (c.from) out.from = truncate(c.from, 64);
  if (c.to) out.to = truncate(c.to, 64);
  return out;
}

function sanitizeAppError(e: AppError): AppError {
  const out: AppError = { ts: e.ts, error_summary: truncate(e.error_summary, 500) };
  if (e.screen) out.screen = truncate(e.screen, 64);
  return out;
}

export async function clearPhoneLogger(): Promise<void> {
  return enqueueWrite(() => ({ ...EMPTY_STATE }));
}

// ---- diagnostics ring buffer (debug-mode banner "copy log") ----

export interface LogLine {
  ts: number;
  level: 'log' | 'warn' | 'error';
  message: string;
}

const RING_MAX = 500;
const ring: LogLine[] = [];

export function appendLog(level: LogLine['level'], ...args: unknown[]): void {
  const message = args
    .map((a) => {
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
  ring.push({ ts: Date.now(), level, message });
  if (ring.length > RING_MAX) ring.shift();
}

export function getLogLines(): readonly LogLine[] {
  return ring;
}

export function formatLogLines(): string {
  return ring.map((l) => `${new Date(l.ts).toISOString()} [${l.level}] ${l.message}`).join('\n');
}

export function clearLogLines(): void {
  ring.length = 0;
}

/**
 * httpAiClient — LAN HTTP transport for the Blox AI plugin's HTTP API (`http://<lan-ip>:8083`).
 *
 * Ported from mobile with `react-native-sse` replaced by `platform/sse` (fetch + ReadableStream). Error kinds,
 * timeouts, `DIAG_FALLBACK_TOOLS`, `enableRemoteSupport` and the SSE lifecycle invariant (onError fires once;
 * onComplete never fires on the same tick after an error; nothing after cancel()) are unchanged.
 *
 * Requires firmware PR-B (CORSMiddleware on blox-ai); `/support/wireguard` needs `X-Fula-Support` in the
 * allow-headers.
 */
import type { BloxAiEvent, RecommendedActionEvent, ExecutionResultEvent } from './bloxAiEvents';
import { parseBloxAiEvent } from './bloxAiEvents';
import { openSse, type SseError, type SseHandle, type SseMessage } from '@/platform/sse';

export const DEFAULT_BLOX_AI_PORT = 8083;
export const HEALTH_TIMEOUT_MS = 1000;
export const HEALTH_CACHE_TTL_MS = 10_000;
export const REQUEST_TIMEOUT_MS = 30_000;
export const DIAG_BUNDLE_TIMEOUT_MS = 35_000;
export const SUPPORT_TIMEOUT_MS = 120_000;

export const DIAG_FALLBACK_TOOLS = [
  'internet', 'relay', 'time', 'power', 'storage', 'containers',
  'wireguard', 'heartbeat', 'events', 'readiness',
  'discovery_state', 'systemd_services', 'network_interface',
  'uniondrive', 'identity_health',
  'kubo_health', 'fula_go_health', 'image_versions', 'ble_state', 'plugins',
] as const;
const DIAG_FALLBACK_PER_TOOL_TIMEOUT_MS = 18_000;
const DIAG_FALLBACK_CONCURRENCY = 5;

export type AiTransportName = 'lan-http' | 'ble';

export interface HealthResult {
  ok: boolean;
  latencyMs: number;
  cached?: boolean;
}

export type AiClientErrorKind =
  | 'http-busy'
  | 'http-bad-request'
  | 'http-not-found'
  | 'http-server'
  | 'network'
  | 'no-transport'
  | 'sse-malformed'
  | 'sse-aborted'
  | 'unknown';

export interface AiClientError {
  kind: AiClientErrorKind;
  message: string;
  transient: boolean;
  httpStatus?: number;
}

export interface AiCallbacks {
  onEvent: (event: BloxAiEvent) => void;
  /** Fires per event with the SSE `id:` (per-session monotonic seq); synthetic events carry `null`. */
  onSeq?: (seq: number | null) => void;
  onComplete?: () => void;
  onError?: (err: AiClientError) => void;
}

export interface SessionHandle {
  sessionId: string;
  cancel: () => void;
}

export interface ExecuteResult {
  ok: boolean;
  payload?: ExecutionResultEvent;
  error?: AiClientError;
}

export interface DiagBundle {
  generated_at: string;
  tools: Record<string, unknown>;
}

export interface DiagBundleResult {
  ok: boolean;
  payload?: DiagBundle;
  error?: AiClientError;
}

export interface WireguardStatus {
  installed?: boolean;
  registered?: boolean;
  active?: boolean;
  endpoint?: string;
  assigned_ip?: string;
  peer_id_registered?: boolean;
  last_handshake_age_sec?: number;
  rx_bytes?: number;
  tx_bytes?: number;
  persistent_keepalive_sec?: number;
}

export interface RemoteSupportPayload {
  success?: boolean;
  exit_code?: number;
  stdout_excerpt?: string;
  stderr_excerpt?: string;
  error?: string;
  status?: WireguardStatus | null;
  installed_on_demand?: boolean;
}

export interface RemoteSupportResult {
  ok: boolean;
  payload?: RemoteSupportPayload;
  error?: AiClientError;
}

// Local helpers --------------------------------------------------------------

function isAbortError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  return (e as { name?: unknown }).name === 'AbortError';
}

function errorMessage(e: unknown): string | undefined {
  return e instanceof Error ? e.message : typeof e === 'string' ? e : undefined;
}

function networkError(message: string): AiClientError {
  return { kind: 'network', message, transient: true };
}

export function fromHttpStatus(status: number, body: string): AiClientError {
  if (status === 429) {
    return { kind: 'http-busy', message: body || 'device busy', transient: false, httpStatus: status };
  }
  if (status === 404) {
    return { kind: 'http-not-found', message: body || 'not found', transient: false, httpStatus: status };
  }
  if (status >= 400 && status < 500) {
    return { kind: 'http-bad-request', message: body || `HTTP ${status}`, transient: false, httpStatus: status };
  }
  return { kind: 'http-server', message: body || `HTTP ${status}`, transient: true, httpStatus: status };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', () => controller.abort());
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i] as T);
    }
  };
  const size = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: size }, () => worker()));
  return results;
}

/** Parse the SSE `id:` field into a seq number; "-1" (synthetic truncation marker) and junk → null. */
export function seqFromId(rawId: string | undefined): number | null {
  if (typeof rawId === 'string' && rawId !== '' && rawId !== '-1') {
    const n = Number(rawId);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return null;
}

// Public client --------------------------------------------------------------

export class HttpAiClient {
  public readonly baseUrl: string;
  public readonly lanIp: string;
  public readonly port: number;

  private healthCache: { result: HealthResult; cachedAt: number } | null = null;

  constructor(lanIp: string, port: number = DEFAULT_BLOX_AI_PORT) {
    if (!lanIp) {
      throw new Error('HttpAiClient: lanIp is required');
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`HttpAiClient: invalid port ${port}`);
    }
    this.lanIp = lanIp;
    this.port = port;
    this.baseUrl = `http://${lanIp}:${port}`;
  }

  public async health(timeoutMs: number = HEALTH_TIMEOUT_MS): Promise<HealthResult> {
    if (this.healthCache) {
      const age = Date.now() - this.healthCache.cachedAt;
      if (age < HEALTH_CACHE_TTL_MS) {
        return { ...this.healthCache.result, cached: true };
      }
    }
    const start = Date.now();
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/health`, { method: 'GET' }, timeoutMs);
      const latencyMs = Date.now() - start;
      const body = await res.text().catch(() => '');
      const ok = res.status === 200 && /"ok"\s*:\s*true/.test(body);
      const result: HealthResult = { ok, latencyMs };
      this.healthCache = { result, cachedAt: Date.now() };
      return result;
    } catch {
      const latencyMs = Date.now() - start;
      const result: HealthResult = { ok: false, latencyMs };
      this.healthCache = { result, cachedAt: Date.now() };
      return result;
    }
  }

  public invalidateHealthCache(): void {
    this.healthCache = null;
  }

  /**
   * Shared SSE session wiring for runAi / runTree / resume. Lifecycle order on error: safeError FIRST (while
   * closed === false), THEN closed = true, THEN close the stream — so a synchronous close can never fire
   * onComplete on the same tick as onError.
   */
  private startStream(
    url: string,
    init: { method: 'GET' | 'POST'; body?: string },
    seedSessionId: string,
    cb: AiCallbacks,
    opts: { serverCancel: boolean },
  ): SessionHandle {
    let resolvedSessionId = seedSessionId;
    let closed = false;
    let handle: SseHandle | null = null;

    const safeError = (err: AiClientError) => {
      if (closed) return;
      try {
        cb.onError?.(err);
      } catch {
        /* swallow */
      }
    };
    const safeComplete = () => {
      if (closed) return;
      try {
        cb.onComplete?.();
      } catch {
        /* swallow */
      }
    };

    const onMessage = (event: SseMessage) => {
      if (closed) return;
      const raw = event.data;
      if (typeof raw !== 'string' || !raw.length) return;
      let frame: unknown;
      try {
        frame = JSON.parse(raw);
      } catch {
        safeError({ kind: 'sse-malformed', message: 'SSE frame is not JSON', transient: false });
        return;
      }
      const parsed = parseBloxAiEvent(frame);
      if (parsed.type === 'session_started') {
        resolvedSessionId = parsed.session_id;
      }
      if (cb.onSeq) {
        try {
          cb.onSeq(seqFromId(event.id));
        } catch {
          /* swallow */
        }
      }
      try {
        cb.onEvent(parsed);
      } catch {
        /* swallow */
      }
    };

    const onError = (e: SseError) => {
      if (closed) return;
      if (e.kind === 'http' && typeof e.status === 'number') {
        safeError(fromHttpStatus(e.status, e.body ?? e.message));
      } else if (e.kind === 'aborted') {
        safeError({ kind: 'sse-aborted', message: 'aborted', transient: true });
      } else {
        safeError(networkError(e.message || 'SSE network error'));
      }
      closed = true;
      try {
        handle?.close();
      } catch {
        /* ignore */
      }
    };

    const onClose = () => {
      if (closed) return;
      // Deliver onComplete BEFORE latching `closed` (the mobile client latched first, so its onComplete never
      // fired on a clean stream end — masked there because `verdict` already cleared `streaming`). Same order
      // as BleAiClient.
      safeComplete();
      closed = true;
    };

    handle = openSse(
      url,
      {
        method: init.method,
        headers: init.method === 'POST' ? { 'Content-Type': 'application/json', Accept: 'text/event-stream' } : { Accept: 'text/event-stream' },
        body: init.body,
      },
      { onMessage, onError, onClose },
    );

    const cancel = () => {
      if (closed) return;
      closed = true;
      try {
        handle?.close();
      } catch {
        /* ignore */
      }
      if (opts.serverCancel && resolvedSessionId) {
        this.cancel(resolvedSessionId).catch(() => undefined);
      }
    };

    return {
      get sessionId() {
        return resolvedSessionId;
      },
      cancel,
    } as unknown as SessionHandle;
  }

  /** Start an AI session via POST /troubleshoot (SSE response stream). */
  public runAi(prompt: string, sessionId: string | undefined, cb: AiCallbacks): SessionHandle {
    const seedSession = sessionId ?? '';
    const body = JSON.stringify({ prompt, ...(seedSession ? { session_id: seedSession } : {}) });
    return this.startStream(`${this.baseUrl}/troubleshoot`, { method: 'POST', body }, seedSession, cb, { serverCancel: true });
  }

  /** Deterministic tree session via POST /troubleshoot/tree (SSE). 404 = unknown scenario; 503 = runner down. */
  public runTree(scenarioId: string, sessionId: string | undefined, cb: AiCallbacks): SessionHandle {
    const seedSession = sessionId ?? '';
    const body = JSON.stringify({ scenario_id: scenarioId, ...(seedSession ? { session_id: seedSession } : {}) });
    return this.startStream(`${this.baseUrl}/troubleshoot/tree`, { method: 'POST', body }, seedSession, cb, { serverCancel: true });
  }

  /** One-shot LLM classifier. Returns 'other' on any error. */
  public async classify(prompt: string): Promise<string> {
    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/troubleshoot/classify`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) },
        REQUEST_TIMEOUT_MS,
      );
      if (!res.ok) return 'other';
      const body = (await res.json().catch(() => null)) as { scenario_id?: string } | null;
      const sid = body?.scenario_id;
      if (typeof sid === 'string' && sid.length) {
        return sid;
      }
      return 'other';
    } catch {
      return 'other';
    }
  }

  public async userReply(sessionId: string, questionId: string, replyText: string): Promise<void> {
    const res = await fetchWithTimeout(
      `${this.baseUrl}/troubleshoot/user-reply`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, question_id: questionId, reply_text: replyText }),
      },
      REQUEST_TIMEOUT_MS,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw fromHttpStatus(res.status, body);
    }
  }

  public async phoneContext(sessionId: string, context: Record<string, unknown>): Promise<void> {
    const res = await fetchWithTimeout(
      `${this.baseUrl}/troubleshoot/phone-context`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, phone_context: context }),
      },
      REQUEST_TIMEOUT_MS,
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw fromHttpStatus(res.status, body);
    }
  }

  public async executeAction(action: Pick<RecommendedActionEvent, 'action_id' | 'approval_token'>, securityCode?: string): Promise<ExecuteResult> {
    const body: Record<string, unknown> = { action_id: action.action_id, approval_token: action.approval_token };
    if (securityCode) body.security_code = securityCode;

    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/execute-action`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        REQUEST_TIMEOUT_MS,
      );
      const raw = await res.text();
      if (!res.ok) {
        return { ok: false, error: fromHttpStatus(res.status, raw) };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return { ok: false, error: { kind: 'sse-malformed', message: 'execute-action body is not JSON', transient: false } };
      }
      return { ok: true, payload: parsed as ExecutionResultEvent };
    } catch (e) {
      if (isAbortError(e)) {
        return { ok: false, error: networkError('execute-action aborted') };
      }
      return { ok: false, error: networkError(errorMessage(e) ?? 'execute-action failed') };
    }
  }

  /**
   * Reattach to an in-flight session via GET /troubleshoot/resume?session_id&from. On 404 fires onError with
   * 'http-not-found' so the caller clears its persisted snapshot.
   */
  public resume(sessionId: string, fromSeq: number, cb: AiCallbacks): SessionHandle {
    const safeFrom = Number.isInteger(fromSeq) && fromSeq >= 0 ? fromSeq : 0;
    const url = `${this.baseUrl}/troubleshoot/resume?session_id=${encodeURIComponent(sessionId)}&from=${safeFrom}`;
    return this.startStream(url, { method: 'GET' }, sessionId, cb, { serverCancel: false });
  }

  public async cancel(sessionId: string): Promise<void> {
    try {
      await fetchWithTimeout(
        `${this.baseUrl}/cancel`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId }) },
        5_000,
      );
    } catch {
      // ignore
    }
  }

  public async fetchDiagBundle(): Promise<DiagBundleResult> {
    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/diag/bundle`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
        DIAG_BUNDLE_TIMEOUT_MS,
      );
      const raw = await res.text();
      if (!res.ok) {
        if (res.status === 405 || res.status === 404) {
          return this.fetchDiagBundleViaTools();
        }
        return { ok: false, error: fromHttpStatus(res.status, raw) };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return { ok: false, error: { kind: 'sse-malformed', message: 'diag/bundle body is not JSON', transient: false } };
      }
      return { ok: true, payload: parsed as DiagBundle };
    } catch (e) {
      if (isAbortError(e)) {
        return { ok: false, error: networkError('diag/bundle aborted') };
      }
      return { ok: false, error: networkError(errorMessage(e) ?? 'diag/bundle failed') };
    }
  }

  private async fetchDiagTool(tool: string): Promise<unknown> {
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/diag/${tool}`, { method: 'GET' }, DIAG_FALLBACK_PER_TOOL_TIMEOUT_MS);
      const raw = await res.text();
      if (!res.ok) {
        return { error: `HTTP ${res.status}`, http_status: res.status };
      }
      try {
        return JSON.parse(raw);
      } catch {
        return { error: 'non-JSON response' };
      }
    } catch (e) {
      if (isAbortError(e)) return { error: 'timeout' };
      return { error: errorMessage(e) ?? 'fetch failed' };
    }
  }

  private async fetchDiagBundleViaTools(): Promise<DiagBundleResult> {
    const values = await mapWithConcurrency(DIAG_FALLBACK_TOOLS, DIAG_FALLBACK_CONCURRENCY, (tool) => this.fetchDiagTool(tool));
    const tools: Record<string, unknown> = {};
    DIAG_FALLBACK_TOOLS.forEach((tool, i) => {
      tools[tool] = values[i];
    });
    const allFailed = values.every((v) => v != null && typeof v === 'object' && 'error' in (v as object));
    if (allFailed) {
      return { ok: false, error: networkError('no diag tools reachable') };
    }
    return { ok: true, payload: { generated_at: new Date().toISOString(), tools } };
  }

  public async enableRemoteSupport(securityCode: string): Promise<RemoteSupportResult> {
    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/support/wireguard`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Fula-Support': 'enable' },
          body: JSON.stringify({ security_code: securityCode }),
        },
        SUPPORT_TIMEOUT_MS,
      );
      const raw = await res.text();
      let parsed: RemoteSupportPayload | undefined;
      try {
        parsed = JSON.parse(raw) as RemoteSupportPayload;
      } catch {
        parsed = undefined;
      }
      if (!res.ok) {
        return { ok: false, error: fromHttpStatus(res.status, raw), payload: parsed };
      }
      return { ok: true, payload: parsed };
    } catch (e) {
      if (isAbortError(e)) {
        return { ok: false, error: networkError('support/wireguard aborted') };
      }
      return { ok: false, error: networkError(errorMessage(e) ?? 'support/wireguard failed') };
    }
  }
}

export type { BloxAiEvent, RecommendedActionEvent, UserQuestionEvent, ExecutionResultEvent } from './bloxAiEvents';

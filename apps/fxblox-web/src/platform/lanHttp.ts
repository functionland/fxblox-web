/**
 * LAN HTTP — the axios replacement for the Blox hotspot API (`http://10.42.0.1:3500`) and any other
 * private-network target reached from the https:// origin.
 *
 *  - `fetch(url, { mode: 'cors', cache: 'no-store', credentials: 'omit', signal, targetAddressSpace: 'local' })`
 *    (`targetAddressSpace` only for private/loopback targets — it is what triggers Chrome's Local Network Access
 *    prompt and mixed-content exemption; other browsers ignore the key).
 *  - Simple-request discipline: GET, HEAD, or POST `application/x-www-form-urlencoded`; NEVER custom headers
 *    (a preflight would need firmware PR-A even on the hotspot).
 *  - Error taxonomy `LanHttpError.kind`: 'timeout' | 'unreachable' | 'cors' | 'lna-denied' | 'http' | 'aborted'.
 *    A TypeError from fetch is ambiguous, so it is classified with `permissions.query('local-network-access')`
 *    and a `no-cors` probe: reachable-but-no-CORS → 'cors' (old firmware → offer BLE).
 */
import { ipIsPrivateLan } from '@/utils/ipIsPrivateLan';

export type LanHttpErrorKind = 'timeout' | 'unreachable' | 'cors' | 'lna-denied' | 'http' | 'aborted';

export class LanHttpError extends Error {
  readonly kind: LanHttpErrorKind;
  readonly url: string;
  readonly status?: number;
  readonly body?: string;
  override readonly cause?: unknown;

  constructor(kind: LanHttpErrorKind, url: string, message: string, opts: { status?: number; body?: string; cause?: unknown } = {}) {
    super(message);
    this.name = 'LanHttpError';
    this.kind = kind;
    this.url = url;
    if (opts.status !== undefined) this.status = opts.status;
    if (opts.body !== undefined) this.body = opts.body;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }
}

export function isLanHttpError(e: unknown): e is LanHttpError {
  return e instanceof LanHttpError || (typeof e === 'object' && e !== null && (e as { name?: string }).name === 'LanHttpError');
}

export type FormValues = Record<string, string | number | boolean | undefined | null> | URLSearchParams;

export interface LanRequestInit {
  method?: 'GET' | 'POST' | 'HEAD';
  /** Query-string parameters appended to the URL (go-fula `r.FormValue` reads these too). */
  query?: FormValues;
  /** Form body (`application/x-www-form-urlencoded`) — only for POST. */
  form?: FormValues;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Skip the TypeError classification probe (saves a round trip when the caller does not care). */
  classify?: boolean;
}

export const DEFAULT_LAN_TIMEOUT_MS = 15_000;
export const PROBE_TIMEOUT_MS = 3_000;

type FetchLike = typeof fetch;

function toParams(values: FormValues | undefined): URLSearchParams {
  if (!values) return new URLSearchParams();
  if (values instanceof URLSearchParams) return values;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === null) continue;
    p.append(k, String(v));
  }
  return p;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/** Private IP literal, loopback or `localhost`. */
export function isLocalTarget(url: string): boolean {
  const host = hostOf(url).replace(/^\[|\]$/g, '');
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.local')) return true;
  if (/^127\./.test(host) || host === '::1') return true;
  return ipIsPrivateLan(host);
}

/**
 * True when the PAGE is itself in a local address space (dev on localhost, or the app served off a LAN IP).
 *
 * `targetAddressSpace` is an assertion, not a hint: setting it makes Chrome run a Private Network Access
 * preflight and refuse the request unless the server answers it. That gate exists to protect local devices
 * from PUBLIC pages, so it is only meaningful when the page is more public than the target. Asserting it from
 * a page that is already local buys nothing and breaks the request outright — verified against a real Blox,
 * where `fetch(..., { targetAddressSpace: 'local' })` from http://127.0.0.1:5173 threw "Failed to fetch"
 * while the identical fetch without it returned 200.
 */
export function pageIsLocal(hostname = globalThis.location?.hostname ?? ''): boolean {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.local')) return true;
  if (/^127\./.test(host) || host === '::1') return true;
  return ipIsPrivateLan(host);
}

export interface BuiltLanRequest {
  url: string;
  init: RequestInit & { targetAddressSpace?: 'local' | 'private' | 'public' };
}

/**
 * Pure request composer (unit-tested): URL + query, form body, and the fixed simple-request options.
 */
export function buildLanRequest(url: string, init: LanRequestInit = {}): BuiltLanRequest {
  if ('headers' in (init as Record<string, unknown>)) {
    throw new Error('lanHttp: custom headers are not allowed (simple-request discipline)');
  }
  const method = init.method ?? (init.form ? 'POST' : 'GET');
  const query = toParams(init.query).toString();
  const fullUrl = query ? `${url}${url.includes('?') ? '&' : '?'}${query}` : url;
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (method === 'POST') {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = init.form ? toParams(init.form).toString() : '';
  } else if (init.form) {
    throw new Error('lanHttp: form body requires POST');
  }
  const request: BuiltLanRequest['init'] = {
    method,
    mode: 'cors',
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'follow',
    headers,
  };
  if (body !== undefined) request.body = body;
  // Only assert the target address space when crossing INTO it from a more public page — see `pageIsLocal`.
  if (isLocalTarget(fullUrl) && !pageIsLocal()) request.targetAddressSpace = 'local';
  return { url: fullUrl, init: request };
}

function isAbortError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'AbortError';
}

export type LnaPermissionState = PermissionState | 'unsupported';

export async function lnaPermissionState(): Promise<LnaPermissionState> {
  try {
    const perms = navigator.permissions;
    if (!perms?.query) return 'unsupported';
    const status = await perms.query({ name: 'local-network-access' as PermissionName });
    return status.state;
  } catch {
    return 'unsupported';
  }
}

/**
 * `no-cors` reachability probe: an opaque response means the host answered (CORS is the problem, not the
 * network); a TypeError means nothing answered; an abort means it timed out.
 */
export async function probeNoCors(
  url: string,
  timeoutMs = PROBE_TIMEOUT_MS,
  fetchImpl: FetchLike = fetch,
): Promise<'reachable' | 'unreachable' | 'timeout'> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const init: BuiltLanRequest['init'] = {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    };
    if (isLocalTarget(url)) init.targetAddressSpace = 'local';
    await fetchImpl(url, init);
    return 'reachable';
  } catch (e) {
    return isAbortError(e) ? 'timeout' : 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Turn an opaque `TypeError: Failed to fetch` into one of the taxonomy kinds.
 */
export async function classifyNetworkFailure(
  url: string,
  opts: { fetchImpl?: FetchLike; probeTimeoutMs?: number } = {},
): Promise<Exclude<LanHttpErrorKind, 'http' | 'aborted'>> {
  if (isLocalTarget(url)) {
    const lna = await lnaPermissionState();
    if (lna === 'denied') return 'lna-denied';
  }
  const probe = await probeNoCors(url, opts.probeTimeoutMs ?? PROBE_TIMEOUT_MS, opts.fetchImpl ?? fetch);
  if (probe === 'reachable') return 'cors';
  if (probe === 'timeout') return 'timeout';
  return 'unreachable';
}

/**
 * fetch with the LAN discipline + taxonomy. Resolves with the Response for 2xx/3xx; throws `LanHttpError`
 * otherwise (kind 'http' for non-2xx with the body text attached).
 */
export async function lanFetch(
  url: string,
  init: LanRequestInit = {},
  deps: { fetchImpl?: FetchLike } = {},
): Promise<Response> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const built = buildLanRequest(url, init);
  const controller = new AbortController();
  const timeoutMs = init.timeoutMs ?? DEFAULT_LAN_TIMEOUT_MS;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const callerSignal = init.signal;
  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
  }
  try {
    const res = await fetchImpl(built.url, { ...built.init, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new LanHttpError('http', built.url, `HTTP ${res.status} ${res.statusText || ''}`.trim(), {
        status: res.status,
        body,
      });
    }
    return res;
  } catch (e) {
    if (isLanHttpError(e)) throw e;
    if (isAbortError(e)) {
      if (timedOut) throw new LanHttpError('timeout', built.url, `Timed out after ${timeoutMs} ms`, { cause: e });
      throw new LanHttpError('aborted', built.url, 'Request aborted', { cause: e });
    }
    const kind = init.classify === false ? 'unreachable' : await classifyNetworkFailure(built.url, { fetchImpl });
    throw new LanHttpError(kind, built.url, describeKind(kind, built.url), { cause: e });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', onCallerAbort);
  }
}

export function describeKind(kind: LanHttpErrorKind, url: string): string {
  switch (kind) {
    case 'cors':
      return `${hostOf(url)} answered without CORS headers (firmware predates the web CORS update)`;
    case 'lna-denied':
      return 'Local network access is blocked for this site (chrome://settings/content/localNetworkAccess)';
    case 'unreachable':
      return `${hostOf(url)} is unreachable`;
    case 'timeout':
      return `${hostOf(url)} did not answer in time`;
    case 'aborted':
      return 'Request aborted';
    case 'http':
      return 'HTTP error';
  }
}

export interface LanResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

function parseBody<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

/**
 * axios-style `{ data }` envelope so the ported `api/*` functions and `useFetch` consumers stay untouched.
 * JSON bodies are parsed; anything else (e.g. `"Wifi connected!"`) is returned as the raw string — the same
 * behaviour as axios' default `transformResponse`.
 */
export async function lanJson<T = unknown>(url: string, init: LanRequestInit = {}, deps?: { fetchImpl?: FetchLike }): Promise<LanResponse<T>> {
  const res = await lanFetch(url, init, deps);
  const text = await res.text();
  return { data: parseBody<T>(text), status: res.status, headers: res.headers };
}

export const lanHttp = { fetch: lanFetch, json: lanJson, probeNoCors, classifyNetworkFailure, lnaPermissionState, buildLanRequest, isLocalTarget };

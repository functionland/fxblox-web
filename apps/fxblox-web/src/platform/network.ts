/**
 * Network — the NetInfo replacement. `navigator.onLine` is a hint only (a hotspot with no upstream reports
 * online), so `isOnline()` confirms with a `no-cors` GET of Google's `generate_204` (allowed in the CSP).
 */

export const INTERNET_PROBE_URL = 'https://www.google.com/generate_204';
export const INTERNET_PROBE_TIMEOUT_MS = 5_000;

export interface NetworkProbeOptions {
  timeoutMs?: number;
  url?: string;
  fetchImpl?: typeof fetch;
}

export async function probeInternet(opts: NetworkProbeOptions = {}): Promise<boolean> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? INTERNET_PROBE_TIMEOUT_MS);
  try {
    await fetchImpl(`${opts.url ?? INTERNET_PROBE_URL}?t=${Date.now()}`, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    return true; // opaque response = the request left the device and something answered
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** navigator.onLine gate first (cheap, definitive when false), then the probe. */
export async function isOnline(opts: NetworkProbeOptions = {}): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  return probeInternet(opts);
}

export function onOnlineChange(cb: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const on = () => cb(true);
  const off = () => cb(false);
  window.addEventListener('online', on);
  window.addEventListener('offline', off);
  return () => {
    window.removeEventListener('online', on);
    window.removeEventListener('offline', off);
  };
}

interface NetworkInformationLike {
  type?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  addEventListener?: (type: 'change', cb: () => void) => void;
  removeEventListener?: (type: 'change', cb: () => void) => void;
}

function connection(): NetworkInformationLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

export interface ConnectionInfo {
  online: boolean;
  type?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

export function connectionInfo(): ConnectionInfo {
  const c = connection();
  const info: ConnectionInfo = { online: typeof navigator === 'undefined' ? true : navigator.onLine !== false };
  if (c?.type) info.type = c.type;
  if (c?.effectiveType) info.effectiveType = c.effectiveType;
  if (typeof c?.downlink === 'number') info.downlink = c.downlink;
  if (typeof c?.rtt === 'number') info.rtt = c.rtt;
  return info;
}

export function onConnectionChange(cb: (info: ConnectionInfo) => void): () => void {
  const c = connection();
  const handler = () => cb(connectionInfo());
  c?.addEventListener?.('change', handler);
  const offOnline = onOnlineChange(handler);
  return () => {
    c?.removeEventListener?.('change', handler);
    offOnline();
  };
}

export const network = { isOnline, probeInternet, onOnlineChange, connectionInfo, onConnectionChange };

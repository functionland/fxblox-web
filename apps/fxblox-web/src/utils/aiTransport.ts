/**
 * aiTransport — picks the right transport for the Blox AI plugin (ported from mobile; `mdnsCache` → `lanIpCache`).
 *
 * Order:
 *   1. LAN HTTP via a FRESH LAN-IP record (authorizer + RFC1918/link-local IP + 1 s /health probe all pass)
 *   2. LAN HTTP via a user-typed manual IP — same gate + probe; tried before any refresh, even without peer ids
 *   3. LAN HTTP via a discovery `/find-box` private ip4 entry (fula-ota PR-D; a no-op today) when `scanIfEmpty`
 *   4. BLE (fallback) — the caller wires `BleAiClient` over the registry's session
 *
 * This module does NOT touch `helper.ts:initFula` (libp2p client setup is a separate concern).
 */
import { HttpAiClient, DEFAULT_BLOX_AI_PORT } from './httpAiClient';
import * as lanIpCache from './lanIpCache';
import { ipIsPrivateLan } from './ipIsPrivateLan';

export { ipIsPrivateLan };

export const LAN_HTTP_PROBE_TIMEOUT_MS = 1000;
export const MDNS_FRESHNESS_MAX_AGE_MS = 90_000;

export type AiTransportKind = 'lan-http' | 'ble';

export interface AiTransportChoice {
  kind: AiTransportKind;
  /** Populated when kind === 'lan-http'. */
  httpClient?: HttpAiClient;
  /** Why this transport was chosen (for telemetry + debugging). */
  reason: string;
}

export interface SelectorOptions {
  probeTimeoutMs?: number;
  mdnsMaxAgeMs?: number;
  /** Run a one-shot discovery refresh when the cache lookup fails (default false). */
  scanIfEmpty?: boolean;
  manualIp?: string;
}

export async function selectAiTransport(bloxPeerId: string, appPeerId: string, opts: SelectorOptions = {}): Promise<AiTransportChoice> {
  const probeTimeoutMs = opts.probeTimeoutMs ?? LAN_HTTP_PROBE_TIMEOUT_MS;
  const mdnsMaxAgeMs = opts.mdnsMaxAgeMs ?? MDNS_FRESHNESS_MAX_AGE_MS;
  const scanIfEmpty = opts.scanIfEmpty ?? false;
  const manualIp = (opts.manualIp ?? '').trim();

  // Probe + qualify a user-typed manual IP. The RFC1918/link-local gate is re-applied HERE as the hard backstop:
  // never POST AI actions to a non-private address.
  const qualifyManual = async (): Promise<AiTransportChoice | null> => {
    if (!manualIp || !ipIsPrivateLan(manualIp)) return null;
    const client = new HttpAiClient(manualIp, DEFAULT_BLOX_AI_PORT);
    const probe = await client.health(probeTimeoutMs);
    if (!probe.ok) return null;
    return { kind: 'lan-http', httpClient: client, reason: `manual IP ${manualIp}, /health 200 in ${probe.latencyMs}ms` };
  };

  if (!bloxPeerId || !appPeerId) {
    const manual = await qualifyManual();
    if (manual) return manual;
    return { kind: 'ble', reason: 'missing bloxPeerId or appPeerId — cannot qualify LAN HTTP' };
  }

  // 1) Cache first; a FRESH record reflects the current network and always wins over a possibly-stale manual IP.
  let hit = lanIpCache.findAuthorizedBlox(bloxPeerId, appPeerId, mdnsMaxAgeMs);

  // 2) Cache miss: manual IP BEFORE the refresh.
  if (!hit) {
    const manual = await qualifyManual();
    if (manual) return manual;
  }

  // 3) Still nothing and caller permits: one-shot discovery refresh.
  if (!hit && scanIfEmpty) {
    await lanIpCache.refreshOnce(bloxPeerId, appPeerId);
    hit = lanIpCache.findAuthorizedBlox(bloxPeerId, appPeerId, mdnsMaxAgeMs);
  }

  if (!hit) {
    return { kind: 'ble', reason: 'no fresh mDNS record matching bloxPeerId+appPeerId' };
  }

  const ip = hit.service.txt?.ipAddress ?? hit.service.host ?? '';
  if (!ipIsPrivateLan(ip)) {
    return { kind: 'ble', reason: `IP "${ip}" is not RFC1918/link-local; refusing LAN HTTP` };
  }

  const port = readBloxAiPortFromTxt(hit.service.txt) ?? DEFAULT_BLOX_AI_PORT;
  const client = new HttpAiClient(ip, port);

  const probe = await client.health(probeTimeoutMs);
  if (probe.ok) {
    return { kind: 'lan-http', httpClient: client, reason: `mDNS verified, /health 200 in ${probe.latencyMs}ms` };
  }
  return { kind: 'ble', reason: `LAN HTTP /health probe failed (latency=${probe.latencyMs}ms)` };
}

function readBloxAiPortFromTxt(txt: Record<string, unknown> | undefined): number | undefined {
  if (!txt) return undefined;
  const raw = txt.bloxAiPort ?? txt.ai_port;
  if (raw === undefined || raw === null) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return undefined;
  return n;
}

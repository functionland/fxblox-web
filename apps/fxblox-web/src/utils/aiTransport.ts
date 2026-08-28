/**
 * aiTransport — picks the right transport for the Blox AI plugin (ported from mobile; `mdnsCache` → `lanIpCache`).
 *
 * Order:
 *   1. LAN HTTP via a FRESH LAN-IP record (authorizer + RFC1918/link-local IP + 1 s /health probe all pass)
 *   2. LAN HTTP via a user-typed manual IP — same gate + probe; tried before any refresh, even without peer ids
 *   3. LAN HTTP via the REMEMBERED address for this Blox — the last one the app actually talked to, persisted
 *      across reloads; no age gate, the /health probe decides
 *   4. LAN HTTP via a discovery `/find-box` private ip4 entry (fula-ota PR-D; a no-op today) when `scanIfEmpty`
 *   5. BLE (fallback) — the caller wires `BleAiClient` over the registry's session
 *
 * Tier 3 exists because a browser has no mDNS. Without it the only automatic LAN candidate was a record from
 * this page's own session, so a reload left Blox AI with nothing to try — `/find-box` is blocked for browsers
 * and no manual IP is set by default — and it reported "Cannot reach your Blox over LAN or Bluetooth" about a
 * Blox on the same switch that setup had reached minutes earlier.
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

  // Probe + qualify the last address this app actually reached the Blox at. Same RFC1918 backstop; no age
  // gate, because a remembered address is a hint and /health is what confirms it.
  const qualifyRemembered = async (): Promise<AiTransportChoice | null> => {
    const remembered = await lanIpCache.rememberedLanIp(bloxPeerId, appPeerId);
    if (!remembered || !ipIsPrivateLan(remembered.ip)) return null;
    const client = new HttpAiClient(remembered.ip, remembered.port ?? DEFAULT_BLOX_AI_PORT);
    const probe = await client.health(probeTimeoutMs);
    if (!probe.ok) return null;
    return {
      kind: 'lan-http',
      httpClient: client,
      reason: `remembered IP ${remembered.ip}, /health 200 in ${probe.latencyMs}ms`,
    };
  };

  if (!bloxPeerId || !appPeerId) {
    const manual = await qualifyManual();
    if (manual) return manual;
    return { kind: 'ble', reason: 'missing bloxPeerId or appPeerId — cannot qualify LAN HTTP' };
  }

  // 1) Cache first; a FRESH record reflects the current network and always wins over a possibly-stale manual IP.
  let hit = lanIpCache.findAuthorizedBlox(bloxPeerId, appPeerId, mdnsMaxAgeMs);

  // 2) Cache miss: manual IP BEFORE the refresh. A typed address beats a remembered one — the user is
  //    correcting us when they set it.
  if (!hit) {
    const manual = await qualifyManual();
    if (manual) return manual;
  }

  // 3) Then the remembered address from a previous session.
  if (!hit) {
    const remembered = await qualifyRemembered();
    if (remembered) return remembered;
  }

  // 4) Still nothing and caller permits: one-shot discovery refresh.
  if (!hit && scanIfEmpty) {
    await lanIpCache.refreshOnce(bloxPeerId, appPeerId);
    hit = lanIpCache.findAuthorizedBlox(bloxPeerId, appPeerId, mdnsMaxAgeMs);
  }

  if (!hit) {
    return { kind: 'ble', reason: 'no LAN candidate: no fresh record, no manual IP, no remembered address' };
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

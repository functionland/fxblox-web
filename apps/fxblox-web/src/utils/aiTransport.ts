/**
 * aiTransport — picks the right transport for the Blox AI plugin (ported from mobile; `mdnsCache` → `lanIpCache`).
 *
 * Order:
 *   1. LAN HTTP via a FRESH LAN-IP record (authorizer + RFC1918/link-local IP + 1 s /health probe all pass)
 *   2. LAN HTTP via a user-typed manual IP — same gate + probe; tried before any refresh, even without peer ids
 *   3. LAN HTTP via the REMEMBERED address for this Blox — the last one the app actually talked to, persisted
 *      across reloads; no age gate, because the Blox's peer id (from `diag/kubo_health`) is checked instead
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

  /**
   * Confirm the thing answering at this address is the Blox we mean.
   *
   * `/health` proves only that SOMETHING is listening on `<ip>:8083`. Private ranges repeat across networks, so
   * an address that was right at home can point at a stranger's machine on another network with the same
   * subnet — and an approved remediation action would then be POSTed to it. `diag/kubo_health` returns the
   * Blox's `peer_id`, so identity is checkable with no firmware change.
   *
   * `null` from `identity()` means "cannot tell" (older firmware, unparseable reply), which is NOT a mismatch.
   * `required` decides what to do with that: an address the app picked on its own must prove itself; one the
   * user typed keeps working against an older Blox, and is still refused on a definite mismatch.
   */
  const identityOk = async (client: HttpAiClient, required: boolean): Promise<boolean> => {
    const id = await client.identity(probeTimeoutMs);
    if (!id) return !required;
    return id.peerId === bloxPeerId;
  };

  // Probe + qualify a user-typed manual IP. The RFC1918/link-local gate is re-applied HERE as the hard backstop:
  // never POST AI actions to a non-private address.
  const qualifyManual = async (): Promise<AiTransportChoice | null> => {
    if (!manualIp || !ipIsPrivateLan(manualIp)) return null;
    const client = new HttpAiClient(manualIp, DEFAULT_BLOX_AI_PORT);
    const probe = await client.health(probeTimeoutMs);
    if (!probe.ok) return null;
    // Deliberate, but still worth catching a typo or a Blox that has since moved.
    if (bloxPeerId && !(await identityOk(client, false))) return null;
    return { kind: 'lan-http', httpClient: client, reason: `manual IP ${manualIp}, /health 200 in ${probe.latencyMs}ms` };
  };

  // Probe + qualify the last address this app actually reached the Blox at. Same RFC1918 backstop, plus a hard
  // identity check: no age gate, so the peer id is what makes a remembered address safe to reuse.
  const qualifyRemembered = async (): Promise<AiTransportChoice | null> => {
    const remembered = await lanIpCache.rememberedLanIp(bloxPeerId, appPeerId);
    if (!remembered || !ipIsPrivateLan(remembered.ip)) return null;
    const client = new HttpAiClient(remembered.ip, remembered.port ?? DEFAULT_BLOX_AI_PORT);
    const probe = await client.health(probeTimeoutMs);
    if (!probe.ok) return null;
    if (!(await identityOk(client, true))) return null;
    return {
      kind: 'lan-http',
      httpClient: client,
      reason: `remembered IP ${remembered.ip}, identity confirmed, /health 200 in ${probe.latencyMs}ms`,
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

  // 5) Search this network directly. `refreshOnce` above only asks discovery `/find-box` for private `/ip4/`
  //    entries, which needs fula-ota PR-D and returns nothing today — so before this tier existed, a browser
  //    with no remembered address and no typed IP had literally nothing left to try and reported "cannot
  //    reach your Blox" about a Blox on the same switch, one that the setup screen's own search finds in
  //    seconds. This is that same search.
  if (!hit && scanIfEmpty) {
    const scanned = await qualifyLanScan(bloxPeerId, appPeerId, probeTimeoutMs);
    if (scanned) return scanned;
  }

  if (!hit) {
    return {
      kind: 'ble',
      reason: 'no LAN candidate: no fresh record, no manual IP, no remembered address, nothing on this network',
    };
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

/** A `.local` name is local by definition; anything else has to be an RFC1918/link-local address. */
export function hostIsLocal(host: string): boolean {
  return host.toLowerCase().endsWith('.local') || ipIsPrivateLan(host);
}

/**
 * Search this network for the Blox, the way the setup screen does.
 *
 * `discoverBloxesOnLan` probes candidate `.local` names AND sweeps the subnets this device is on, reading each
 * answer's peer id from blox-ai's `/diag/relay`. That peer id is a STRONGER identity check than the `/health`
 * probe the other tiers rely on — the address is only used if the box behind it says it is the one we mean, so
 * a private address that points at a stranger on some other network is rejected before anything is sent to it.
 *
 * A found IPv4 address is written back to the cache, so the next session takes tier 3 and never pays for this
 * scan again.
 */
async function qualifyLanScan(
  bloxPeerId: string,
  appPeerId: string,
  probeTimeoutMs: number,
): Promise<AiTransportChoice | null> {
  let outcome;
  try {
    const { discoverBloxesOnLan } = await import('@/services/lanDiscovery');
    outcome = await discoverBloxesOnLan();
  } catch {
    return null;
  }
  const match = outcome.found.find((blox) => blox.peerId === bloxPeerId);
  if (!match || !hostIsLocal(match.host)) return null;
  const client = new HttpAiClient(match.host, DEFAULT_BLOX_AI_PORT);
  const probe = await client.health(probeTimeoutMs);
  if (!probe.ok) return null;
  // Only an address is worth remembering; a `.local` name would fail tier 3's RFC1918 gate on the way back in.
  if (ipIsPrivateLan(match.host)) {
    lanIpCache.noteLanIp({ ip: match.host, bloxPeerId, authorizer: appPeerId });
  }
  return {
    kind: 'lan-http',
    httpClient: client,
    reason: `network scan found ${match.host}, peer id matched, /health 200 in ${probe.latencyMs}ms`,
  };
}

function readBloxAiPortFromTxt(txt: Record<string, unknown> | undefined): number | undefined {
  if (!txt) return undefined;
  const raw = txt.bloxAiPort ?? txt.ai_port;
  if (raw === undefined || raw === null) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return undefined;
  return n;
}

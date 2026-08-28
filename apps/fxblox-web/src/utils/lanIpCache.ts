/**
 * lanIpCache — the `mdnsCache` replacement. Browsers have no mDNS, so records are fed by HTTP interactions
 * (`api/bloxHardware.getBloxPropertiesAtIp`, setup flows, a successful manual IP) and — once fula-ota PR-D
 * publishes LAN addrs — by discovery `/find-box` private `/ip4/` entries. The query API is the mDNS one
 * (`noteRecord`, `findAuthorizedBlox`, `refreshOnce`, `clear`) so `aiTransport` is unchanged.
 */
import { findBox } from '@/services/discoveryClient';
import { kvStore, type KeyValueStore } from '@/platform/kvStore';
import type { MDNSBloxService, TBloxProperty } from '@/models/blox';
import { ipIsPrivateLan } from './ipIsPrivateLan';

const DEFAULT_FRESHNESS_MAX_AGE_MS = 90_000;

interface CachedRecord {
  service: MDNSBloxService;
  observedAt: number;
}

const records = new Map<string, CachedRecord>(); // keyed by hardwareID (falls back to peerId / host)
let inflight: Promise<void> | null = null;

/**
 * Last-known LAN IP per Blox, persisted.
 *
 * The in-memory records above are the mDNS-shaped cache and expire in 90 s, which is right for "is this record
 * describing the network as it is now". But it also meant the app threw away an IP it had genuinely confirmed:
 * every reload started with nothing, even though setup or Blox discovery had just fetched `/properties`
 * successfully at a known address. Blox AI then had no LAN candidate at all — no mDNS in a browser, no manual
 * IP typed, `/find-box` blocked — and fell through to "Cannot reach your Blox over LAN or Bluetooth" on a Blox
 * sitting on the same switch.
 *
 * A remembered IP is a HINT, not a claim about the present: it carries no freshness gate, and the 1 s /health
 * probe in `selectAiTransport` is what decides whether it is still right. That is exactly how a user-typed
 * manual IP is already treated.
 */
const REMEMBERED_KEY_PREFIX = '@blox-ai/lan-ip/v1';

export interface RememberedLanIp {
  ip: string;
  port?: number;
  /** The app peer id this Blox was authorized to when the address was observed. */
  authorizer: string;
  savedAt: number;
}

let store: KeyValueStore = kvStore;
/** Test hook. */
export function _setStoreForTests(s: KeyValueStore): void {
  store = s;
}

function rememberedKey(bloxPeerId: string): string {
  return `${REMEMBERED_KEY_PREFIX}/${bloxPeerId}`;
}

/** Persist a confirmed LAN address. Failures are non-fatal: this is a convenience tier, never a requirement. */
export async function rememberLanIp(bloxPeerId: string, entry: Omit<RememberedLanIp, 'savedAt'>): Promise<void> {
  if (!bloxPeerId || !ipIsPrivateLan(entry.ip)) return;
  try {
    await store.setItem(rememberedKey(bloxPeerId), JSON.stringify({ ...entry, savedAt: Date.now() }));
  } catch (e) {
    console.warn('[lanIpCache] rememberLanIp failed', e);
  }
}

/** The last address confirmed for this Blox under this identity, if any. Never age-gated — the probe decides. */
export async function rememberedLanIp(bloxPeerId: string, appPeerId: string): Promise<RememberedLanIp | null> {
  if (!bloxPeerId) return null;
  try {
    const raw = await store.getItem(rememberedKey(bloxPeerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedLanIp>;
    if (typeof parsed?.ip !== 'string' || !ipIsPrivateLan(parsed.ip)) return null;
    // Same guard the live cache applies: an address observed under a different identity is not ours to use.
    if (appPeerId && parsed.authorizer && parsed.authorizer !== appPeerId) return null;
    return {
      ip: parsed.ip,
      ...(typeof parsed.port === 'number' ? { port: parsed.port } : {}),
      authorizer: parsed.authorizer ?? '',
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    };
  } catch (e) {
    console.warn('[lanIpCache] rememberedLanIp failed', e);
    return null;
  }
}

export async function forgetLanIp(bloxPeerId: string): Promise<void> {
  if (!bloxPeerId) return;
  try {
    await store.removeItem(rememberedKey(bloxPeerId));
  } catch {
    /* non-fatal */
  }
}

function recordKey(s: MDNSBloxService): string {
  return s.txt?.hardwareID || s.txt?.bloxPeerIdString || s.host || s.name;
}

export function noteRecord(s: MDNSBloxService): void {
  const key = recordKey(s);
  if (!key) return;
  records.set(key, { service: s, observedAt: Date.now() });
}

export interface LanIpNote {
  ip: string;
  bloxPeerId: string;
  authorizer: string;
  hardwareID?: string;
  clusterPeerId?: string;
  port?: number;
  poolName?: string;
}

/**
 * Convenience for HTTP-fed records.
 *
 * Also persists the address: every caller here has just talked to the Blox at this IP, which is the strongest
 * evidence the app ever gets, and it used to be discarded on the next reload.
 */
export function noteLanIp(n: LanIpNote): void {
  if (!ipIsPrivateLan(n.ip)) return;
  void rememberLanIp(n.bloxPeerId, {
    ip: n.ip,
    ...(n.port !== undefined ? { port: n.port } : {}),
    authorizer: n.authorizer,
  });
  noteRecord({
    addresses: [n.ip],
    fullName: `${n.ip}._fulatower._tcp`,
    host: n.ip,
    name: 'fulatower',
    port: n.port ?? 8080,
    txt: {
      authorizer: n.authorizer,
      bloxPeerIdString: n.bloxPeerId,
      hardwareID: n.hardwareID ?? n.bloxPeerId,
      poolName: n.poolName ?? '',
      ipfsClusterID: n.clusterPeerId,
      ipAddress: n.ip,
    },
  });
}

/** Feed the cache from a `/properties` response fetched at a known LAN ip. */
export function noteFromProperties(ip: string, props: Partial<TBloxProperty> | null | undefined, port?: number): void {
  const bloxPeerId = props?.kubo_peer_id;
  if (!bloxPeerId || !props?.authorizer) return;
  noteLanIp({
    ip,
    bloxPeerId,
    authorizer: props.authorizer,
    hardwareID: props.hardwareID,
    clusterPeerId: props.ipfs_cluster_peer_id,
    port,
  });
}

export function findAuthorizedBlox(
  bloxPeerId: string,
  appPeerId: string,
  maxAgeMs: number = DEFAULT_FRESHNESS_MAX_AGE_MS,
): { service: MDNSBloxService; observedAt: number } | null {
  const now = Date.now();
  for (const rec of records.values()) {
    if (rec.service.txt?.bloxPeerIdString !== bloxPeerId) continue;
    if (rec.service.txt?.authorizer !== appPeerId) continue;
    if (now - rec.observedAt > maxAgeMs) continue;
    return rec;
  }
  return null;
}

/** Extract private `/ip4/<ip>/...` (non-circuit) entries from discovery multiaddrs. */
export function privateIpsFromMultiaddrs(addrs: string[]): string[] {
  const out: string[] = [];
  for (const a of addrs) {
    if (a.includes('/p2p-circuit')) continue;
    const m = a.match(/^\/ip4\/(\d{1,3}(?:\.\d{1,3}){3})\//);
    if (m?.[1] && ipIsPrivateLan(m[1]) && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/**
 * One-shot refresh from the discovery service (PR-D publishes LAN addrs; a no-op today). Records are tagged
 * with the caller's `appPeerId` as authorizer because the box's own heartbeat is authoritative for its peer id.
 */
export function refreshOnce(bloxPeerId?: string, appPeerId?: string): Promise<void> {
  if (inflight) return inflight;
  if (!bloxPeerId || !appPeerId) return Promise.resolve();
  inflight = (async () => {
    try {
      const addrs = await findBox(bloxPeerId);
      for (const ip of privateIpsFromMultiaddrs(addrs)) {
        noteLanIp({ ip, bloxPeerId, authorizer: appPeerId });
      }
    } catch (e) {
      console.warn('[lanIpCache] refreshOnce failed', e);
    }
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function clear(): void {
  records.clear();
}

export function _internalRecords(): ReadonlyMap<string, CachedRecord> {
  return records;
}

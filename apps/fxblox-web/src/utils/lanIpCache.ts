/**
 * lanIpCache — the `mdnsCache` replacement. Browsers have no mDNS, so records are fed by HTTP interactions
 * (`api/bloxHardware.getBloxPropertiesAtIp`, setup flows, a successful manual IP) and — once fula-ota PR-D
 * publishes LAN addrs — by discovery `/find-box` private `/ip4/` entries. The query API is the mDNS one
 * (`noteRecord`, `findAuthorizedBlox`, `refreshOnce`, `clear`) so `aiTransport` is unchanged.
 */
import { findBox } from '@/services/discoveryClient';
import type { MDNSBloxService, TBloxProperty } from '@/models/blox';
import { ipIsPrivateLan } from './ipIsPrivateLan';

const DEFAULT_FRESHNESS_MAX_AGE_MS = 90_000;

interface CachedRecord {
  service: MDNSBloxService;
  observedAt: number;
}

const records = new Map<string, CachedRecord>(); // keyed by hardwareID (falls back to peerId / host)
let inflight: Promise<void> | null = null;

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

/** Convenience for HTTP-fed records. */
export function noteLanIp(n: LanIpNote): void {
  if (!ipIsPrivateLan(n.ip)) return;
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

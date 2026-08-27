/**
 * Diagnostics probes (pure helpers, tested separately from the screen):
 *   - this device's internet (`platform/network.probeInternet`, the generate_204 no-cors probe)
 *   - discovery API + relay list (`services/discoveryClient.listRelays` — live → cache → hardcoded FXRelay)
 *   - relay reachability = `'unsupported'`: a web page cannot open TCP :4001 (rendered "Can't be tested from a browser")
 *   - plugin presence (3-state, per-blox fetch status + list)
 */
import { probeInternet } from '@/platform/network';
import { listRelays } from '@/services/discoveryClient';
import { FXRelay } from '@/utils/constants';
import type { PluginsFetchStatus } from '@/stores/usePluginsStore';

export type ProbeStatus = 'checking' | 'ok' | 'failed';
export type RelayProbeStatus = ProbeStatus | 'unsupported';
export type RelaySource = 'live' | 'cache' | 'hardcoded' | 'none';
export type PluginPresence = 'checking' | 'installed' | 'notInstalledOrUnavailable';

export interface RelayInfo {
  dnsName: string;
  status: RelayProbeStatus;
}

export interface DiscoveryProbeResult {
  discovery: ProbeStatus;
  relays: RelayInfo[];
  source: RelaySource;
  fetchedAt?: number;
}

export const BLOX_AI_PLUGIN_NAME = 'blox-ai';

export async function probeBrowserInternet(): Promise<ProbeStatus> {
  try {
    return (await probeInternet()) ? 'ok' : 'failed';
  } catch {
    return 'failed';
  }
}

/** Hostname of the hardcoded relay multiaddr (`/dns/<host>/…`). */
export function hardcodedRelayDnsName(): string | null {
  const m = FXRelay.match(/^\/dns4?\/([^/]+)/);
  return m?.[1] ?? null;
}

export async function probeDiscoveryAndListRelays(): Promise<DiscoveryProbeResult> {
  let discovery: ProbeStatus = 'failed';
  try {
    const listing = await listRelays();
    discovery = listing.source === 'live' ? 'ok' : 'failed';
    const names = listing.relays
      .map((r) => r?.dnsName)
      .filter((x): x is string => typeof x === 'string' && x.length > 0);
    if (names.length > 0) {
      const result: DiscoveryProbeResult = {
        discovery,
        relays: names.map((dnsName) => ({ dnsName, status: 'unsupported' })),
        source: listing.source === 'live' ? 'live' : 'cache',
      };
      if (listing.fetchedAt !== undefined) result.fetchedAt = listing.fetchedAt;
      return result;
    }
  } catch {
    discovery = 'failed';
  }
  const hardcoded = hardcodedRelayDnsName();
  return {
    discovery,
    relays: hardcoded ? [{ dnsName: hardcoded, status: 'unsupported' }] : [],
    source: hardcoded ? 'hardcoded' : 'none',
  };
}

/**
 * 3-state plugin presence (Codex review): `idle`/`loading` → checking; `loaded`/`error` → installed only when
 * `blox-ai` is in the list (an unreachable / old-firmware blox reads "not installed or unavailable", never "installed").
 */
export function computePluginPresence(activePlugins: unknown, status: PluginsFetchStatus): PluginPresence {
  if (status === 'idle' || status === 'loading') return 'checking';
  const list = Array.isArray(activePlugins) ? (activePlugins as unknown[]) : [];
  return list.includes(BLOX_AI_PLUGIN_NAME) ? 'installed' : 'notInstalledOrUnavailable';
}

export interface Freshness {
  key: 'freshnessJustNow' | 'freshnessMinutes' | 'freshnessHours' | 'freshnessDays';
  count: number;
}

export function relayFreshness(fetchedAt: number, now: number = Date.now()): Freshness {
  const ageMs = Math.max(0, now - fetchedAt);
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return { key: 'freshnessJustNow', count: 0 };
  if (minutes < 60) return { key: 'freshnessMinutes', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: 'freshnessHours', count: hours };
  return { key: 'freshnessDays', count: Math.floor(hours / 24) };
}

/**
 * useHotspotReachable — the `useIsConnectedToBox` replacement. Browsers cannot read the joined SSID, so the
 * hook polls `GET ${API_URL}/readiness` (any HTTP answer — even a 404 on old firmware — means the Blox is
 * there) every 3 s while enabled:
 *   'unknown' | 'reachable' | 'unreachable' | 'blocked'   (blocked = CORS missing or LNA denied)
 * The FIRST LAN call must come from a click (Chrome's LNA prompt needs a gesture), so `enabled` defaults to
 * false and the ConnectToBlox screen turns it on from its button.
 */
import { useEffect, useRef, useState } from 'react';
import { API_URL } from '@/api';
import { isLanHttpError, lanFetch, type LanHttpError } from '@/platform/lanHttp';
import { DEFAULT_NETWORK_NAME } from '@/utils/constants';

export { DEFAULT_NETWORK_NAME };

export type HotspotReachability = 'unknown' | 'reachable' | 'unreachable' | 'blocked';

export interface ProbeHotspotDeps {
  fetchImpl?: typeof fetch;
}

export async function probeHotspot(baseUrl: string = API_URL, timeoutMs = 2500, deps: ProbeHotspotDeps = {}): Promise<HotspotReachability> {
  try {
    await lanFetch(`${baseUrl}/readiness`, { timeoutMs }, deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {});
    return 'reachable';
  } catch (e) {
    if (!isLanHttpError(e)) return 'unreachable';
    return classify(e);
  }
}

export function classify(e: LanHttpError): HotspotReachability {
  switch (e.kind) {
    case 'http':
      return 'reachable'; // the server answered (old firmware without /readiness)
    case 'cors':
    case 'lna-denied':
      return 'blocked';
    case 'aborted':
      return 'unknown';
    default:
      return 'unreachable';
  }
}

export interface UseHotspotReachableOptions {
  enabled?: boolean;
  intervalMs?: number;
  baseUrl?: string;
}

export function useHotspotReachable(opts: UseHotspotReachableOptions = {}): HotspotReachability {
  const { enabled = false, intervalMs = 3000, baseUrl = API_URL } = opts;
  const [state, setState] = useState<HotspotReachability>('unknown');
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const result = await probeHotspot(baseUrl);
        if (!cancelled) setState(result);
      } finally {
        inFlight.current = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, intervalMs, baseUrl]);

  return state;
}

/** Mobile compatibility: true when the hotspot API answers. */
export function useIsConnectedToBox(enabled = false): boolean {
  return useHotspotReachable({ enabled }) === 'reachable';
}

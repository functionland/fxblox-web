/**
 * useEnsureFulaClient — the port of the `MainTabs.navigator.tsx` effect that initialises the shared libp2p
 * client for the SELECTED blox once credentials exist. The web shell has no MainTabs navigator, so the main-tab
 * screens call this hook (it is idempotent: one init per blox, skipped when the client is already ready for
 * that blox or when `switchToBlox` owns the init — `_initFulaSource === 'switch'`).
 *
 * Readiness is written with the peer-aware setter (`setFulaIsReady(true, peerId)`) after the mobile 5 s
 * relay-settle wait, so a switch during the wait cannot mark the wrong blox ready (audit M4/S2).
 */
import { useEffect } from 'react';
import { useBloxsStore } from '@/stores/useBloxsStore';
import { useUserProfileStore } from '@/stores/useUserProfileStore';

export const FULA_READY_SETTLE_MS = 5000;

let inFlightPeerId: string | null = null;
let statusProbeInFlight: string | null = null;

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
export const isValidIp = (ip: string): boolean => IPV4.test(ip.trim());

/** Test hook. */
export function _resetEnsureFulaForTests(): void {
  inFlightPeerId = null;
  statusProbeInFlight = null;
}

export function useEnsureFulaClient(): void {
  const password = useUserProfileStore((s) => s.password);
  const signiture = useUserProfileStore((s) => s.signiture);
  const currentBloxPeerId = useBloxsStore((s) => s.currentBloxPeerId);
  const fulaIsReady = useUserProfileStore((s) => s.fulaIsReady);
  const fulaReadyForPeerId = useUserProfileStore((s) => s.fulaReadyForPeerId);
  const bloxsConnectionStatus = useBloxsStore((s) => s.bloxsConnectionStatus);

  useEffect(() => {
    if (!password || !signiture || !currentBloxPeerId) return;
    const bloxsState = useBloxsStore.getState();
    if (bloxsState._initFulaSource === 'switch') {
      // switchToBlox already (re)initialised the client for this blox.
      useBloxsStore.setState({ _initFulaSource: null });
      return;
    }
    const profile = useUserProfileStore.getState();
    if (profile.fulaIsReady && profile.fulaReadyForPeerId === currentBloxPeerId) return;
    if (inFlightPeerId === currentBloxPeerId) return;
    inFlightPeerId = currentBloxPeerId;

    const localIp = profile.useLocalIp;
    const bloxAddr =
      localIp && localIp !== 'scan' && localIp !== 'delete' && isValidIp(localIp)
        ? `/ip4/${localIp}/tcp/40001/p2p/${currentBloxPeerId}`
        : '';
    profile.setFulaIsReady(false);

    void (async () => {
      try {
        const Helper = await import('@/utils/helper');
        await Helper.initFula({ password, signiture, bloxAddr, bloxPeerId: currentBloxPeerId });
        // Wait for libp2p to establish relay connections before marking ready (mobile parity).
        await new Promise((r) => setTimeout(r, FULA_READY_SETTLE_MS));
        useUserProfileStore.getState().setFulaIsReady(true, currentBloxPeerId);
      } catch (e) {
        console.warn('[fula] initFula failed', e);
        useUserProfileStore.getState().setFulaIsReady(false);
      } finally {
        if (inFlightPeerId === currentBloxPeerId) inFlightPeerId = null;
      }
    })();
    // No cleanup on purpose: the init must finish even if the screen unmounts (the setter is peer-aware).
  }, [password, signiture, currentBloxPeerId]);

  /**
   * Establish the per-blox connection status once the client is ready.
   *
   * `bloxsConnectionStatus` is runtime-only (not persisted), so it starts empty on every load, and until it has
   * an entry the UI reports the blox as disconnected and every per-blox feature gated on CONNECTED stays inert —
   * `useRefetchActivePluginsOnConnect` never fires, so the Plugins screen sits on "Checking installed plugins…"
   * forever. On mobile the Blox tab is always the landing screen and its own effect filled this in; on the web
   * any deep link or reload onto another screen skipped it entirely.
   *
   * Observed against a real Blox: the client was connected and `/x/fula-ping` was answering, while the map was
   * still `{}` and the header read "Disconnected". Only fires when the status is genuinely UNKNOWN, so it never
   * competes with the Blox screen's own checks or overwrites a known-bad state.
   */
  useEffect(() => {
    if (!currentBloxPeerId) return;
    const profile = useUserProfileStore.getState();
    if (!profile.fulaIsReady || profile.fulaReadyForPeerId !== currentBloxPeerId) return;
    if (useBloxsStore.getState().bloxsConnectionStatus[currentBloxPeerId] !== undefined) return;
    if (statusProbeInFlight === currentBloxPeerId) return;
    statusProbeInFlight = currentBloxPeerId;

    void (async () => {
      try {
        await useBloxsStore.getState().checkBloxConnection();
      } catch (e) {
        console.warn('[fula] initial connection check failed', e);
      } finally {
        if (statusProbeInFlight === currentBloxPeerId) statusProbeInFlight = null;
      }
    })();
  }, [currentBloxPeerId, fulaIsReady, fulaReadyForPeerId, bloxsConnectionStatus]);
}

export default useEnsureFulaClient;

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

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
export const isValidIp = (ip: string): boolean => IPV4.test(ip.trim());

/** Test hook. */
export function _resetEnsureFulaForTests(): void {
  inFlightPeerId = null;
}

export function useEnsureFulaClient(): void {
  const password = useUserProfileStore((s) => s.password);
  const signiture = useUserProfileStore((s) => s.signiture);
  const currentBloxPeerId = useBloxsStore((s) => s.currentBloxPeerId);

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
}

export default useEnsureFulaClient;

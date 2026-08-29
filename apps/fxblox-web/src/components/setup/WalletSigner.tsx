/**
 * The "Sign with Wallet" action of LinkPassword — the only part of the setup flow that needs Reown AppKit.
 * Loaded lazily by LinkPassword (`React.lazy` whose loader calls `initAppKit()` first, because the AppKit React
 * hooks throw until `createAppKit()` ran).
 *
 * ## Two taps, on purpose
 *
 * Mobile browsers block an app-switch that does not happen inside a real user gesture. This screen used to
 * connect the wallet and then auto-fire `personal_sign` from a 500 ms `setTimeout`, which is exactly such a
 * blocked context: the request went out over the WalletConnect relay, the wallet was never brought to the
 * front, and the user sat on a spinner while an unseen prompt waited inside an app they had no reason to open.
 *
 * So connecting and signing are now two separate taps. The second tap is what makes WalletConnect's own
 * deep-link work, and the pause between them also gives the session time to settle — a signature published a
 * few hundred milliseconds after `connected` flips is not reliably delivered.
 *
 * ## The second tap does not switch apps by itself either
 *
 * WalletConnect deep-links to the wallet at the same moment it publishes the request, not after — the two run
 * as concurrent arms of one `Promise.all`. On Android the app-switch then takes the network away from this page
 * before the publish finishes, so the wallet comes to the front to collect a request that never left. That is
 * the "MetaMask opens and hangs" report. `walletRedirect.ts` holds the redirect back; here we wait for
 * `session_request_sent` — emitted only once the relay has the payload — and hop then, carrying the request id
 * the wallet needs to find the prompt.
 *
 * `signChainCode()` stays byte-identical to mobile: the signature seeds the DID secret key, so a changed byte
 * means web and mobile derive different identities from the same password and wallet.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxSpinner, FxText } from '@functionland/fx-ui';
import { assign } from '@/platform/linking';
import { useColorMode } from '@/stores/useSettingsStore';
import { setAppKitTheme } from '@/wallet/appkit';
import { signChainCode } from '@/wallet/signChainCode';
import { connectedWalletLink } from '@/wallet/walletLink';
import { captureAutoRedirect, onceSessionRequestSent, requestLinkFrom } from '@/wallet/walletRedirect';
import { useWallet } from '@/wallet/useWallet';

/**
 * `idle` nothing started · `connecting` the AppKit modal is up · `readyToSign` the wallet is connected and we
 * are waiting for the tap that carries the signature request into the wallet · `signing` the request is out.
 */
export type SignerPhase = 'idle' | 'connecting' | 'readyToSign' | 'signing';

/**
 * How long to wait before offering "open your wallet".
 *
 * Long enough that a desktop extension — which raises its own popup instantly — is normally approved before it
 * appears, short enough that a phone user is not stranded. It never cancels anything: the same request stays
 * awaited, so a signature approved two minutes later still lands.
 */
export const WALLET_NUDGE_MS = 4000;

export interface WalletSignerProps {
  password: string;
  disabled: boolean;
  onLinkingChange: (linking: boolean) => void;
  onPhaseChange?: (phase: SignerPhase) => void;
  onSignature: (signature: string) => void;
  onError: (error: unknown) => void;
  signLabel: string;
  cancelLabel: string;
  flex?: number;
}

export default function WalletSigner({
  password,
  disabled,
  onLinkingChange,
  onPhaseChange,
  onSignature,
  onError,
  signLabel,
  cancelLabel,
  flex,
}: WalletSignerProps) {
  const { t } = useTranslation();
  const wallet = useWallet();
  const mode = useColorMode();
  const awaitingConnectionRef = useRef(false);
  const cancelledRef = useRef(false);
  const [phase, setPhase] = useState<SignerPhase>('idle');
  const [showNudge, setShowNudge] = useState(false);
  // Set once the request is on the relay: the deep link that opens the wallet ON this request, rather than on
  // its home screen. Mirrored into a ref for the stable tap handler below.
  const [requestLink, setRequestLink] = useState<string | null>(null);
  const requestLinkRef = useRef<string | null>(null);
  requestLinkRef.current = requestLink;
  // Latest props / wallet state for the stable callbacks below (the mobile effects closed over stale state).
  const latest = useRef({ password, onLinkingChange, onPhaseChange, onSignature, onError, wallet });
  latest.current = { password, onLinkingChange, onPhaseChange, onSignature, onError, wallet };

  useEffect(() => {
    setAppKitTheme(mode);
  }, [mode]);

  // The parent swaps the password field for a spinner while we are busy. `readyToSign` is NOT busy — the user
  // has to see the button to press it — so it deliberately does not count.
  useEffect(() => {
    latest.current.onLinkingChange(phase === 'connecting' || phase === 'signing');
    latest.current.onPhaseChange?.(phase);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'signing') {
      setShowNudge(false);
      return undefined;
    }
    const timer = setTimeout(() => setShowNudge(true), WALLET_NUDGE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  /**
   * The wallet connected while the AppKit modal was up. Move to `readyToSign` and stop — signing from here
   * would be the blocked-deep-link bug described in the file header.
   */
  useEffect(() => {
    if (!awaitingConnectionRef.current) return;
    if (!wallet.connected || !wallet.account || !wallet.provider) return;
    awaitingConnectionRef.current = false;
    console.log('Wallet connected after modal — waiting for the sign tap');
    setPhase('readyToSign');
  }, [wallet.connected, wallet.account, wallet.provider]);

  const cancel = useCallback(async () => {
    // Signal the in-progress personalSign to stop at the next checkpoint. Disconnecting also makes a pending
    // request reject, which is the only way out of a `provider.request` that is still waiting on the wallet.
    cancelledRef.current = true;
    awaitingConnectionRef.current = false;
    setPhase('idle');
    try {
      await latest.current.wallet.disconnect();
      console.log('Wallet disconnected for retry');
    } catch (e) {
      console.log('Wallet disconnect error (non-fatal):', e);
    }
  }, []);

  const handleSignPress = useCallback(async () => {
    const { wallet: w, password: pwd } = latest.current;
    // Not connected yet: open the chooser and stop. The signature needs its own tap (file header).
    if (!w.connected || !w.account) {
      console.log('Wallet not connected, opening AppKit modal...');
      awaitingConnectionRef.current = true;
      setPhase('connecting');
      try {
        await w.open({ view: 'Connect' });
      } catch (err) {
        awaitingConnectionRef.current = false;
        latest.current.onError(err);
      } finally {
        // AppKit resolves `open()` once the modal is UP, not when it closes. Staying busy past that point
        // would leave anyone who dismisses the chooser without picking a wallet looking at a Cancel button
        // and no way back to Sign. The flag above still catches the connection if they do pick one.
        setPhase('idle');
      }
      return;
    }
    cancelledRef.current = false;
    setPhase('signing');
    setRequestLink(null);
    // Hold WalletConnect's own app-switch back so it cannot cut the publish off mid-flight, then hop ourselves
    // once the relay has acknowledged the request. Both are no-ops for an extension wallet, which never leaves
    // the page. See walletRedirect.ts for what goes wrong without this.
    const href = connectedWalletLink(w.provider);
    const capture = captureAutoRedirect();
    const unsubscribe = onceSessionRequestSent(w.provider, (event) => {
      const link = requestLinkFrom(capture, href, event);
      if (!link) return;
      setRequestLink(link);
      // Only hop if the library's redirect was actually held back. If it slipped through, the wallet is already
      // in front and a second navigation would bounce the user for no reason.
      // This runs a few hundred ms after the tap, inside Chrome's transient user activation window — but if a
      // slow publish outlasts it the navigation is dropped silently, which is what the button below is for.
      if (capture.captured()) assign(link);
    });
    try {
      if (!w.provider) throw new Error('Provider not available');
      const signature = await signChainCode(w.provider, w.account, pwd);
      if (cancelledRef.current) throw new Error('Cancelled by user');
      latest.current.onSignature(signature);
      setPhase('idle');
    } catch (err) {
      console.log(err);
      setPhase('idle');
      latest.current.onError(err);
    } finally {
      unsubscribe();
      capture.release();
    }
  }, []);

  /**
   * Bring the wallet app forward. Must run in the tap handler — see walletLink.ts.
   *
   * Same-tab `assign`, not a new tab: the OS hands the link to the wallet either way, and this tab is where
   * the user has to come back to. A universal (https) link opened in a new tab would strand them on a blank
   * page behind the one still waiting for the signature.
   */
  const openWallet = useCallback(() => {
    const link = requestLinkRef.current ?? connectedWalletLink(latest.current.wallet.provider);
    if (link) assign(link);
  }, []);

  const busy = phase === 'connecting' || phase === 'signing';
  // The request-scoped link once we have one, else the bare wallet scheme — which at least opens the app, and
  // is all there is to offer before the request reaches the relay.
  const walletLink = phase === 'signing' ? (requestLink ?? connectedWalletLink(wallet.provider)) : null;
  // A request-scoped link means the hop was already attempted and may have been dropped, so the button belongs
  // on screen immediately. Without one, it stays on the timer: a desktop extension needs no button at all.
  const showOpenWallet = walletLink !== null && (requestLink !== null || showNudge);

  return (
    <FxBox flex={flex ?? 1} gap="8">
      {phase === 'readyToSign' && (
        <FxText variant="bodyXSRegular" color="content2" textAlign="center" testID="ready-to-sign">
          {t('setup.linkPassword.walletConnectedTapSign')}
        </FxText>
      )}
      {showOpenWallet && walletLink && (
        <FxButton size="large" onPress={openWallet} testID="open-wallet">
          {t('setup.linkPassword.openWalletToApprove')}
        </FxButton>
      )}
      <FxButton
        size="large"
        disabled={disabled && !busy}
        onPress={() => void (busy ? cancel() : handleSignPress())}
        testID="sign-with-wallet"
      >
        {busy ? (
          <>
            <FxSpinner size={16} color="white" label={null} /> {cancelLabel}
          </>
        ) : (
          signLabel
        )}
      </FxButton>
    </FxBox>
  );
}

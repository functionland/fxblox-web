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
 * `session_request_sent` — which means the engine has finished TRYING to publish, success or not — and hop
 * then, carrying the request id the wallet needs to find the prompt.
 *
 * ## And the wallet can still hang, for a reason that is not ours
 *
 * A later report: MetaMask on Android wedges on its splash screen on the first hop after connecting, every
 * time, and recovers only once it is force-quit and reopened. Two things were then tried on the phone. A retry
 * from a real tap, same URL — hangs. A retry sending the bare `metamask://` instead of the request link, so the
 * wallet is asked only to come to the front — hangs too. A cold wallet works; a warm one does not, whatever
 * this page sends it.
 *
 * So the wallet deadlocks on being resumed by a deep link, and there is no URL that avoids it. Nothing here can
 * fix that. What is left is to be quick and honest about it: tell the user the moment they come back, rather
 * than on a timer that runs out while they are still staring at the wallet, and name the one step that
 * actually works instead of offering a retry that does not.
 *
 * `signChainCode()` stays byte-identical to mobile: the signature seeds the DID secret key, so a changed byte
 * means web and mobile derive different identities from the same password and wallet.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxSpinner, FxText } from '@functionland/fx-ui';
import { useColorMode } from '@/stores/useSettingsStore';
import { getAppKit, setAppKitTheme } from '@/wallet/appkit';
import { signChainCode } from '@/wallet/signChainCode';
import { connectedWalletLink } from '@/wallet/walletLink';
import {
  captureAutoRedirect,
  hopToWallet,
  onceSessionRequestSent,
  requestLinkFrom,
} from '@/wallet/walletRedirect';
import { isRelayConnected, useRelayWake, wakeRelay } from '@/wallet/relayWake';
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

/**
 * How long before offering the way out of a wallet that opened and then wedged.
 *
 * MetaMask on Android sometimes comes to the front from a backgrounded state and sits on its splash screen
 * without ever rendering the prompt; a full quit and a second hop fixes it. That is a wallet-side fault with a
 * long tail of open reports (MetaMask/metamask-mobile#4827, #2045, reown-com/appkit#4785), and a web page has
 * no way to reach into it — so the honest thing is to say what happened and how to get past it.
 *
 * Long enough not to accuse a wallet that is merely slow, since the prompt often takes several seconds.
 *
 * A backstop, not the main signal: this timer runs while the user is inside the wallet, so on its own it only
 * ever tells them something they have already found out. Coming back with the request still unanswered shows
 * the same hint immediately.
 */
export const WALLET_STUCK_MS = 12000;

/**
 * How long the `window.open` intercept outlives the request that installed it.
 *
 * The engine's redirect runs as a separate arm of a `Promise.all` that rejects on the first failure without
 * waiting for it, so the redirect can still fire after the request is over. See the `finally` below.
 */
export const REDIRECT_GRACE_MS = 5000;

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
  const [showStuckHint, setShowStuckHint] = useState(false);
  // Have we sent them into the wallet for THIS request (a ref: the stable tap handler below writes it), and
  // did they come back with it still unanswered?
  const wentToWalletRef = useRef(false);
  const [walletShowedNothing, setWalletShowedNothing] = useState(false);
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

  // Coming back from the wallet lands on a socket Android killed while we were backgrounded. Reconnect it now
  // rather than waiting out the library's backoff, which is the several seconds of "connecting" a user sees
  // after they have already approved.
  //
  // `wallet.provider` is only set once a session EXISTS (`ProviderController.setProvider` runs on connect), so
  // for the connect round-trip itself — the first, and the one every user makes — it is undefined and the wake
  // had nothing to act on. The socket that the approval has to arrive over lives on AppKit's UniversalProvider,
  // which exists from the moment the chooser opens; ask AppKit for it directly.
  const [universalProvider, setUniversalProvider] = useState<unknown>(undefined);
  useEffect(() => {
    let alive = true;
    void getAppKit()
      ?.getUniversalProvider()
      .then((p) => alive && setUniversalProvider(p))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  useRelayWake(wallet.provider ?? universalProvider);

  // The parent swaps the password field for a spinner while we are busy. `readyToSign` is NOT busy — the user
  // has to see the button to press it — so it deliberately does not count.
  useEffect(() => {
    latest.current.onLinkingChange(phase === 'connecting' || phase === 'signing');
    latest.current.onPhaseChange?.(phase);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'signing') {
      setShowNudge(false);
      setShowStuckHint(false);
      setWalletShowedNothing(false);
      wentToWalletRef.current = false;
      return undefined;
    }
    const nudge = setTimeout(() => setShowNudge(true), WALLET_NUDGE_MS);
    const stuck = setTimeout(() => setShowStuckHint(true), WALLET_STUCK_MS);
    return () => {
      clearTimeout(nudge);
      clearTimeout(stuck);
    };
  }, [phase]);

  /**
   * The user went to the wallet and came back, and the request is still unanswered.
   *
   * That is the strongest evidence available that the wallet showed them nothing: they looked at it and
   * returned. It beats the timer above, which ticks while they are still inside the wallet and therefore only
   * ever arrives after the fact — the hint they need to read reaches them once they are already stuck.
   *
   * It also changes where the next tap sends them; see `openWallet`.
   */
  useEffect(() => {
    if (phase !== 'signing') return undefined;
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (!wentToWalletRef.current) return;
      console.log('[sign] back on this page with the request still out — the wallet showed nothing');
      setWalletShowedNothing(true);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
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
    let settled = false;
    const unsubscribe = onceSessionRequestSent(w.provider, (event) => {
      const link = requestLinkFrom(capture, href, event);
      if (!link) return;
      setRequestLink(link);
      // `session_request_sent` is not a success signal — the engine emits it even when the publish REJECTED
      // (see onceSessionRequestSent). Hopping then would send the user to a wallet with nothing waiting for
      // it, which is the hang this whole change exists to remove. The rejection is already queued by the time
      // this listener runs, so yielding one macrotask is enough to see it. It costs nothing against Chrome's
      // transient user activation, which is measured in seconds.
      setTimeout(() => {
        if (settled) {
          console.log('[sign] not opening the wallet: the request already settled');
          return;
        }
        // With the socket down the request is not on the relay, whatever the publish reported — the engine
        // queues a failed publish and retries it. Opening the wallet now is what produces a wallet sitting on
        // its splash screen with nothing to show. Wake the socket instead and leave the user here, where the
        // button and the hint are.
        if (isRelayConnected(latest.current.wallet.provider) === false) {
          console.log('[sign] not opening the wallet: relay socket is down, waking it instead');
          wakeRelay(latest.current.wallet.provider);
          return;
        }
        // Hop unless something already navigated. A captured URL means the library's redirect was held back
        // and we are still here. Nothing captured AND nothing passed through means nobody navigated at all —
        // no deep-link choice stored, or the publish announced itself first — which is still ours to do. The
        // remaining case is a navigation in a shape we did not recognise: the wallet is already in front, and
        // hopping again would bounce the user twice.
        if (capture.captured() || !capture.sawOpen()) {
          console.log('[sign] opening the wallet on the request:', link);
          wentToWalletRef.current = true;
          hopToWallet(link);
        } else {
          console.log('[sign] not opening the wallet: something already navigated');
        }
      }, 0);
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
      settled = true;
      unsubscribe();
      // NOT released here. The engine's redirect arm can still be in flight: its `Promise.all` rejects on the
      // FIRST rejection and does not wait for the other arms, so a failed publish tears us down while the
      // redirect is still pending. Releasing at that moment hands the redirect back the real `window.open`,
      // and it opens the wallet on the request that just failed — a wallet with nothing to show, which is
      // exactly the splash-screen hang. Holding the intercept longer costs nothing: it only ever swallows
      // wallet-request URLs, which nothing else in this app produces.
      setTimeout(() => capture.release(), REDIRECT_GRACE_MS);
    }
  }, []);

  /**
   * Bring the wallet app forward. Must run in the tap handler — see walletLink.ts.
   *
   * Scheme-aware — see `hopToWallet` in walletRedirect.ts for why an https universal link must not go through
   * `assign`.
   *
   * ## What this cannot do, and does not pretend to
   *
   * A previous version dropped the request id on a second attempt, on the theory that `…/wc?requestId=` was
   * what wedged MetaMask — that it put the wallet into a route waiting for a request to arrive over its own
   * Android-suspended socket, and that a bare `metamask://` would merely resume the app instead.
   *
   * Tested on the reporter's phone, that is wrong. A warm MetaMask sits on its splash screen for the bare
   * scheme exactly as it does for the request link. The wallet deadlocks on being resumed by a deep link at
   * all, and no URL a web page can produce avoids it; only force-quitting and reopening clears it.
   *
   * So the link never changes. Always the request-scoped one, which is the correct link for the case that does
   * work — a cold wallet, where it surfaces THIS prompt rather than the home screen. The recovery is a thing
   * the user has to do, and `walletStuckHint` says so plainly rather than offering a retry that will not help.
   */
  const openWallet = useCallback(() => {
    const link = requestLinkRef.current ?? connectedWalletLink(latest.current.wallet.provider);
    if (!link) return;
    console.log('[sign] opening the wallet by hand:', link);
    wentToWalletRef.current = true;
    hopToWallet(link);
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
      {(showStuckHint || walletShowedNothing) && walletLink && (
        <FxText variant="bodyXSRegular" color="content2" textAlign="center" testID="wallet-stuck-hint">
          {t('setup.linkPassword.walletStuckHint')}
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

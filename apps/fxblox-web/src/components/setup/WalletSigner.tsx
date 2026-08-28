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
        setPhase('idle');
        latest.current.onError(err);
      }
      return;
    }
    cancelledRef.current = false;
    setPhase('signing');
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
    const link = connectedWalletLink(latest.current.wallet.provider);
    if (link) assign(link);
  }, []);

  const busy = phase === 'connecting' || phase === 'signing';
  const walletLink = phase === 'signing' ? connectedWalletLink(wallet.provider) : null;

  return (
    <FxBox flex={flex ?? 1} gap="8">
      {phase === 'readyToSign' && (
        <FxText variant="bodyXSRegular" color="content2" textAlign="center" testID="ready-to-sign">
          {t('setup.linkPassword.walletConnectedTapSign')}
        </FxText>
      )}
      {showNudge && walletLink && (
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

/**
 * The "Sign with Wallet" action of LinkPassword — the only part of the setup flow that needs Reown AppKit.
 * Loaded lazily by LinkPassword (`React.lazy` whose loader calls `initAppKit()` first, because the AppKit React
 * hooks throw until `createAppKit()` ran). The signing logic is the mobile `LinkPassword.screen.tsx` one:
 *
 *  - not connected → `open({ view: 'Connect' })` and remember `awaitingConnectionRef`; once `connected && account
 *    && provider` the effect auto-triggers signing after 500 ms ("Wallet connected after modal, auto-triggering");
 *  - `cancelledRef` checkpoints around the `personal_sign` so "Cancel" (= disconnect) aborts at the next step;
 *  - `signChainCode()` is byte-identical to mobile (`personal_sign(hex(utf8(HDKEY(password).chainCode)),
 *    account.toLowerCase())`).
 */
import { useCallback, useEffect, useRef } from 'react';
import { FxButton, FxSpinner } from '@functionland/fx-ui';
import { useColorMode } from '@/stores/useSettingsStore';
import { setAppKitTheme } from '@/wallet/appkit';
import { signChainCode } from '@/wallet/signChainCode';
import { useWallet } from '@/wallet/useWallet';

export interface WalletSignerProps {
  password: string;
  disabled: boolean;
  linking: boolean;
  onLinkingChange: (linking: boolean) => void;
  onSignature: (signature: string) => void;
  onError: (error: unknown) => void;
  signLabel: string;
  cancelLabel: string;
  flex?: number;
}

export default function WalletSigner({
  password,
  disabled,
  linking,
  onLinkingChange,
  onSignature,
  onError,
  signLabel,
  cancelLabel,
  flex,
}: WalletSignerProps) {
  const wallet = useWallet();
  const mode = useColorMode();
  const awaitingConnectionRef = useRef(false);
  const cancelledRef = useRef(false);
  // Latest props / wallet state for the stable callbacks below (the mobile effects closed over stale state).
  const latest = useRef({ password, linking, onLinkingChange, onSignature, onError, wallet });
  latest.current = { password, linking, onLinkingChange, onSignature, onError, wallet };

  useEffect(() => {
    setAppKitTheme(mode);
  }, [mode]);

  const disconnectWallet = useCallback(async () => {
    // Signal the in-progress personalSign to stop at the next checkpoint
    cancelledRef.current = true;
    awaitingConnectionRef.current = false;
    latest.current.onLinkingChange(false);
    // Disconnect wallet so next connect starts fresh
    try {
      await latest.current.wallet.disconnect();
      console.log('Wallet disconnected for retry');
    } catch (e) {
      console.log('Wallet disconnect error (non-fatal):', e);
    }
  }, []);

  const personalSign = useCallback(async (): Promise<string | null> => {
    const { wallet: w, password: pwd } = latest.current;
    // If not connected, open AppKit modal and signal caller to wait
    if (!w.connected || !w.account) {
      console.log('Wallet not connected, opening AppKit modal...');
      awaitingConnectionRef.current = true;
      await w.open({ view: 'Connect' });
      return null;
    }
    cancelledRef.current = false;
    if (!w.provider) throw new Error('Provider not available');
    if (cancelledRef.current) throw new Error('Cancelled by user');
    const signature = await signChainCode(w.provider, w.account, pwd);
    if (cancelledRef.current) throw new Error('Cancelled by user');
    return signature;
  }, []);

  const handleLinkPassword = useCallback(async () => {
    const p = latest.current;
    if (p.linking) {
      p.onLinkingChange(false);
      return;
    }
    p.onLinkingChange(true);
    try {
      const sig = await personalSign();
      if (!sig) {
        // Wallet connect modal was opened; signing auto-triggers once the wallet connects (effect below).
        console.log('Wallet connect modal opened, waiting for connection...');
        latest.current.onLinkingChange(false);
        return;
      }
      latest.current.onSignature(sig);
    } catch (err) {
      console.log(err);
      latest.current.onError(err);
    } finally {
      latest.current.onLinkingChange(false);
    }
  }, [personalSign]);

  // Auto-trigger signing once wallet connects after opening the modal
  useEffect(() => {
    if (awaitingConnectionRef.current && wallet.connected && wallet.account && wallet.provider) {
      awaitingConnectionRef.current = false;
      console.log('Wallet connected after modal, auto-triggering sign...');
      const timer = setTimeout(() => void handleLinkPassword(), 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [wallet.connected, wallet.account, wallet.provider, handleLinkPassword]);

  return (
    <FxButton
      size="large"
      flex={flex}
      disabled={disabled}
      onPress={() => void (linking ? disconnectWallet() : handleLinkPassword())}
      testID="sign-with-wallet"
    >
      {linking ? (
        <>
          <FxSpinner size={16} color="white" label={null} /> {cancelLabel}
        </>
      ) : (
        signLabel
      )}
    </FxButton>
  );
}

/**
 * Port of apps/box/src/screens/InitialSetup/LinkPassword.screen.tsx ("Set Identity").
 *
 * State/flow verbatim: password + consent checkboxes (multi-select radio groups), wallet signing (lazy
 * `WalletSigner`, see components/setup/WalletSigner.tsx), the manual-signature path (portal at fxblox.fx.land,
 * paste signature + wallet address), `setKeys` on a fresh signature (DIDPassword + Signiture into the secure
 * store), the "existing identity" view with the DID, "Reset Identity" (`setWalletId('', true)` + wallet
 * disconnect), and the shortcuts (Connect to Blox / Reconnect existing / Bluetooth commands / manual setup).
 *
 * Web-specific: "Clear App Storage" is an in-app wipe (secure store + KV + localStorage + caches) followed by a
 * reload (mobile opened the OS app settings); the notifee foreground service and the console logging of the
 * password / signature are dropped.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxCopyButton,
  FxRadioButton,
  FxRadioButtonWithLabel,
  FxSpinner,
  FxText,
  FxTextInput,
  useConfirm,
  useToast,
} from '@functionland/fx-ui';
import { paths } from '@/app/paths';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SetupNav } from '@/components/setup/SetupNav';
import { SetupScreen } from '@/components/setup/SetupScreen';
// Type only — importing the value would pull the AppKit chunk into the initial bundle.
import type { SignerPhase } from '@/components/setup/WalletSigner';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useLogger } from '@/hooks/useLogger';
import { kvStore } from '@/platform/kvStore';
import { openUrl } from '@/platform/linking';
import * as secureStore from '@/platform/secureStore';
import { resolveColorMode, useSettingsStore } from '@/stores/useSettingsStore';
import { useUserProfileStore } from '@/stores/useUserProfileStore';
import { getMyDID } from '@/utils/helper';

export const SIGNATURE_PORTAL_URL = 'https://fxblox.fx.land';
/** sessionStorage flag set right before the post-wipe reload so the "storage cleared" note shows once. */
export const STORAGE_CLEARED_FLAG = 'fx.setup.storageCleared';

/**
 * AppKit must be created before the wallet hooks render, so the loader initialises it (idempotent) before
 * resolving the component. The `lazy()` wrapper is created per mount (see the screen) so a chunk failure is not
 * cached for the lifetime of the module; the dynamic imports themselves are cached by the browser.
 */
let appKitModule: Promise<typeof import('@/wallet/appkit')> | null = null;
/** One shared import of the AppKit chunk (the wallet signer and "Reset identity" both need it). */
function loadAppKit(): Promise<typeof import('@/wallet/appkit')> {
  appKitModule ??= import('@/wallet/appkit').catch((e: unknown) => {
    appKitModule = null; // let a later attempt retry a failed chunk load
    throw e;
  });
  return appKitModule;
}

async function loadWalletSigner() {
  const [{ initAppKit }, mod] = await Promise.all([
    loadAppKit(),
    import('@/components/setup/WalletSigner'),
  ]);
  initAppKit({ themeMode: resolveColorMode(useSettingsStore.getState()) });
  return mod;
}

/** In-app "Clear App Storage": every browser-side store this origin uses (the deep-link stash is kept). */
export async function clearAppStorage(): Promise<void> {
  await secureStore.wipe();
  await kvStore.clear();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  if (typeof caches !== 'undefined') {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}

function readStorageClearedFlag(): boolean {
  try {
    if (sessionStorage.getItem(STORAGE_CLEARED_FLAG)) {
      sessionStorage.removeItem(STORAGE_CLEARED_FLAG);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export default function LinkPassword() {
  const { t } = useTranslation();
  const { navigate, back } = useAppNavigate();
  const { queueToast } = useToast();
  const { confirm } = useConfirm();
  const logger = useLogger();

  const [iKnow, setIKnow] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const [walletPhase, setWalletPhase] = useState<SignerPhase>('idle');
  const [signatureData, setSignatureData] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState('');
  const [manualSignature, setManualSignature] = useState(false);
  const [mSig, setMSig] = useState('');
  const [walletAddressInput, setWalletAddressInput] = useState('');
  const [identityReset, setIdentityReset] = useState(false);
  const [appStorageCleared, setAppStorageCleared] = useState(readStorageClearedFlag);
  const [clearingStorage, setClearingStorage] = useState(false);
  const [WalletSigner] = useState(() => lazy(loadWalletSigner));

  const setKeyChainValue = useUserProfileStore((state) => state.setKeyChainValue);
  const signiture = useUserProfileStore((state) => state.signiture);
  const password = useUserProfileStore((state) => state.password);
  const setWalletId = useUserProfileStore((state) => state.setWalletId);
  const setManualSignatureWalletAddress = useUserProfileStore(
    (state) => state.setManualSignatureWalletAddress,
  );
  const manualSignatureWalletAddress = useUserProfileStore(
    (state) => state.manualSignatureWalletAddress,
  );

  // Initialize wallet address from store on mount
  useEffect(() => {
    if (manualSignatureWalletAddress) {
      setWalletAddressInput(manualSignatureWalletAddress);
    }
  }, [manualSignatureWalletAddress]);

  const hasExistingIdentity = !!(password && signiture) && !identityReset;

  const latest = useRef({ passwordInput, setKeyChainValue, logger, queueToast, t });
  latest.current = { passwordInput, setKeyChainValue, logger, queueToast, t };

  // Persist a fresh signature (wallet or manual) + the password into the secure store.
  useEffect(() => {
    if (!signatureData) return;
    const {
      passwordInput: pwd,
      setKeyChainValue: setKey,
      logger: log,
      queueToast: toast,
      t: tr,
    } = latest.current;
    let cancelled = false;
    const setKeys = async (walletSignature: string) => {
      try {
        await setKey(secureStore.Service.DIDPassword, pwd);
        await setKey(secureStore.Service.Signiture, walletSignature);
      } catch (err) {
        console.log(err);
        log.logError('handleLinkPassword', err);
        if (!cancelled) {
          toast({
            title: tr('linkPassword.error'),
            message: tr('linkPassword.unableToSignWallet'),
            type: 'error',
            autoHideDuration: 3000,
          });
        }
      } finally {
        if (!cancelled) setLinking(false);
      }
    };
    setIdentityReset(false); // Clear reset flag — fresh signature received
    void setKeys(signatureData.toString());
    return () => {
      cancelled = true;
    };
  }, [signatureData]);

  const onWalletError = useCallback(
    (err: unknown) => {
      logger.logError('handleLinkPassword', err);
      queueToast({
        title: t('linkPassword.error'),
        message: t('linkPassword.unableToSignWallet'),
        type: 'error',
        autoHideDuration: 3000,
      });
    },
    [logger, queueToast, t],
  );

  const handleConnectToBlox = () => void navigate(paths.setup.connectBlox);
  const handleConnectToExistingBlox = () => void navigate(paths.setup.connectExisting);
  const handleOnBluetoothCommand = () => void navigate(paths.setup.bluetooth);
  const handleSkipToManualSetup = () => void navigate(paths.setup.setAuthorizer({ manual: true }));

  const handleClearCachedIdentity = async () => {
    // Clear cached signature and password data
    await setWalletId('', true); // true flag clears signature data
    setIdentityReset(true);
    setSignatureData(''); // Clear so re-sign with same password triggers the setKeys effect
    // Disconnect wallet so user can connect a different one (safe when AppKit was never initialised)
    try {
      const { disconnectWallet } = await loadAppKit();
      await disconnectWallet();
    } catch (e) {
      console.log('Wallet disconnect on reset (non-fatal):', e);
    }
    queueToast({
      type: 'success',
      message: t('linkPassword.cachedDataCleared'),
      autoHideDuration: 3000,
    });
  };

  const handleOpenSignaturePortal = () => {
    // Save wallet address to store before opening the portal
    if (walletAddressInput) {
      setManualSignatureWalletAddress(walletAddressInput);
    }
    openUrl(SIGNATURE_PORTAL_URL, { newTab: true });
  };

  const handleClearAppStorage = async () => {
    const ok = await confirm({
      title: t('linkPassword.clearAppStorageTitle'),
      message: t('setup.linkPassword.clearAppStorageWebMessage'),
      confirmText: t('setup.linkPassword.clearAppStorageConfirm'),
      cancelText: t('linkPassword.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setClearingStorage(true);
    try {
      await clearAppStorage();
      try {
        sessionStorage.setItem(STORAGE_CLEARED_FLAG, '1');
      } catch {
        /* ignore */
      }
      setAppStorageCleared(true);
      window.location.reload();
    } catch (error) {
      console.error('Failed to clear app storage:', error);
      queueToast({
        type: 'error',
        message: t('setup.linkPassword.clearAppStorageFailed'),
        autoHideDuration: 3000,
      });
    } finally {
      setClearingStorage(false);
    }
  };

  const handleManualSignatureButtonPress = () => {
    if (manualSignature && mSig) {
      // Mode 3: User has entered signature, submit
      if (walletAddressInput) {
        setManualSignatureWalletAddress(walletAddressInput);
      }
      setSignatureData(mSig);
    } else if (manualSignature) {
      // Mode 2: User clicked button, now show signature field and open URL
      handleOpenSignaturePortal();
    } else {
      // Mode 1: User enters password, show signature field
      setManualSignature(true);
    }
  };

  const manualButtonLabel = manualSignature
    ? mSig !== ''
      ? t('linkPassword.submit')
      : t('linkPassword.getSignatureManually')
    : t('linkPassword.signManually');
  const manualButtonDisabled =
    !passwordInput || !iKnow || (manualSignature && !!mSig && !walletAddressInput);

  const did = hasExistingIdentity && password && signiture ? getMyDID(password, signiture) : '';

  return (
    <SetupScreen id="link-password" title={t('linkPassword.title')}>
      {hasExistingIdentity ? (
        <FxBox gap="16" paddingVertical="8">
          <FxBox
            padding="16"
            backgroundColor="backgroundSecondary"
            borderRadius="m"
            gap="8"
            testID="existing-identity"
          >
            <FxText variant="bodyMediumRegular" textAlign="center" color="greenBase">
              {t('linkPassword.existingIdentity')}
            </FxText>
            <FxBox flexDirection="row" alignItems="center" justifyContent="center" gap="4">
              <FxText
                textAlign="center"
                color="greenBase"
                className="min-w-0 break-all font-mono"
                testID="did"
              >
                {did}
              </FxText>
              <FxCopyButton
                value={did}
                label={t('setup.linkPassword.copyDid')}
                copiedLabel={t('setup.common.copied')}
                color="greenBase"
                onCopied={(ok) => {
                  if (ok)
                    queueToast({
                      type: 'success',
                      message: t('setup.linkPassword.didCopied'),
                      autoHideDuration: 3000,
                    });
                }}
              />
            </FxBox>
          </FxBox>
          <FxButton
            size="large"
            variant="inverted"
            onPress={() => void handleClearCachedIdentity()}
            testID="reset-identity"
          >
            {t('linkPassword.clearCachedData')}
          </FxButton>
          <FxButton
            size="large"
            variant="inverted"
            onPress={handleConnectToExistingBlox}
            testID="reconnect-existing"
          >
            {t('linkPassword.reconnectExisting')}
          </FxButton>
          {logger.isDebugModeEnable && (
            <FxButton
              size="large"
              variant="inverted"
              onPress={handleOnBluetoothCommand}
              testID="bluetooth-commands"
            >
              {t('linkPassword.bluetoothCommands')}
            </FxButton>
          )}
          <FxButton variant="inverted" onPress={handleSkipToManualSetup} testID="skip-manual-setup">
            {t('linkPassword.skipManualSetup')}
          </FxButton>
        </FxBox>
      ) : (
        <FxBox gap="16" paddingVertical="8">
          {/* Clear App Storage warning and button - shown when no saved identity */}
          {!appStorageCleared && (
            <FxBox padding="16" backgroundColor="backgroundSecondary" borderRadius="m" gap="12">
              <FxText variant="bodyMediumRegular" textAlign="center" color="warningBase">
                {t('linkPassword.clearStorageWarning')}
              </FxText>
              <FxButton
                variant="inverted"
                size="large"
                loading={clearingStorage}
                onPress={() => void handleClearAppStorage()}
                testID="clear-app-storage"
              >
                {t('linkPassword.clearAppStorage')}
              </FxButton>
            </FxBox>
          )}
          {appStorageCleared && (
            <FxBox padding="12" backgroundColor="greenBase" borderRadius="m" role="status">
              <FxText variant="bodySmallRegular" textAlign="center" color="white">
                {t('linkPassword.storageCleared')}
              </FxText>
            </FxBox>
          )}

          {!linking ? (
            <FxTextInput
              caption={t('linkPassword.password')}
              autoFocus
              secureTextEntry
              autoComplete="off"
              value={passwordInput}
              onChangeText={setPasswordInput}
              testID="password-input"
            />
          ) : (
            <FxBox alignItems="center" paddingVertical="12">
              {/*
                "Connecting" and "waiting for you to approve a signature" are different waits, and calling the
                second one "Connecting Wallet…" tells a user who has already connected that nothing has
                happened yet.
              */}
              <FxSpinner
                size="large"
                label={
                  walletPhase === 'signing'
                    ? t('setup.linkPassword.approveInWallet')
                    : t('linkPassword.connectingWallet')
                }
              />
            </FxBox>
          )}

          {/* Wallet Address + Signature fields - only when using manual signature */}
          {!linking && manualSignature && (
            <FxBox gap="16">
              <FxText variant="bodySmallRegular" color="content2">
                {t('setup.linkPassword.signaturePortalHint')}
              </FxText>
              <FxTextInput
                caption={t('linkPassword.walletAddress')}
                placeholder="0x..."
                mono
                autoComplete="off"
                value={walletAddressInput}
                onChangeText={setWalletAddressInput}
                testID="wallet-address-input"
              />
              <FxTextInput
                caption={t('linkPassword.signature')}
                autoFocus
                secureTextEntry
                autoComplete="off"
                value={mSig}
                onChangeText={setMSig}
                testID="signature-input"
              />
            </FxBox>
          )}

          <FxBox gap="4">
            <FxText
              variant="bodyMediumRegular"
              color="warningBase"
              textAlign="center"
              paddingBottom="12"
            >
              {t('linkPassword.warning')}
            </FxText>
            <FxRadioButton.Group
              value={iKnow ? [1] : []}
              onValueChange={(val: (string | number)[]) => setIKnow(val[0] === 1)}
            >
              <FxRadioButtonWithLabel label={t('linkPassword.passwordRisk')} value={1} />
            </FxRadioButton.Group>
            {/* Only show wallet checkbox when NOT using manual signature */}
            {!manualSignature && (
              <FxRadioButton.Group
                value={walletOpen ? [1] : []}
                onValueChange={(val: (string | number)[]) => setWalletOpen(val[0] === 1)}
              >
                <FxRadioButtonWithLabel label={t('linkPassword.walletOpen')} value={1} />
              </FxRadioButton.Group>
            )}
          </FxBox>

          {!manualSignature && (
            <FxButton
              size="large"
              variant="inverted"
              disabled={manualButtonDisabled}
              onPress={handleManualSignatureButtonPress}
              testID="sign-manually"
            >
              {manualButtonLabel}
            </FxButton>
          )}
        </FxBox>
      )}

      <SetupNav onBack={() => back(paths.setup.requirements)}>
        {hasExistingIdentity ? (
          <FxButton size="large" flex={1} onPress={handleConnectToBlox} testID="setup-continue">
            {t('linkPassword.continueWithExisting')}
          </FxButton>
        ) : manualSignature ? (
          <FxButton
            size="large"
            flex={1}
            disabled={manualButtonDisabled}
            onPress={handleManualSignatureButtonPress}
            testID="manual-signature-action"
          >
            {manualButtonLabel}
          </FxButton>
        ) : (
          <FxBox flex={1}>
            <ErrorBoundary
              fallback={
                <FxText variant="bodySmallRegular" color="warningBase" role="alert">
                  {t('setup.linkPassword.walletUnavailable')}
                </FxText>
              }
            >
              <Suspense
                fallback={
                  <FxButton size="large" loading testID="wallet-loading">
                    {t('setup.linkPassword.walletLoading')}
                  </FxButton>
                }
              >
                <WalletSigner
                  password={passwordInput}
                  disabled={!passwordInput || !iKnow || !walletOpen}
                  onLinkingChange={setLinking}
                  onPhaseChange={setWalletPhase}
                  onSignature={setSignatureData}
                  onError={onWalletError}
                  signLabel={t('linkPassword.signWithWallet')}
                  cancelLabel={t('linkPassword.cancel')}
                />
              </Suspense>
            </ErrorBoundary>
          </FxBox>
        )}
      </SetupNav>
    </SetupScreen>
  );
}

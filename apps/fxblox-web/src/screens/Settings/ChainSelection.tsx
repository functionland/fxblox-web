/**
 * Port of apps/box/src/screens/Settings/ChainSelection.screen.tsx: SKALE vs Base radios (Base gated by the
 * authorization code → `useSettingsStore.baseAuthorized`), connect / disconnect wallet, the compact wallet
 * notification (switch network via `useWalletNetwork`), the manual wallet-address editor
 * (`manualSignatureWalletAddress`), reset-Base-authorization `confirm()`, middle-truncated addresses.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxRadioButton,
  FxText,
  FxTextInput,
  useConfirm,
  useToast,
} from '@functionland/fx-ui';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { WalletNotification } from '@/components/settings/WalletNotification';
import { truncateMiddle } from '@/components/settings/format';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { useContractIntegration } from '@/hooks/useContractIntegration';
import { useWallet } from '@/wallet/useWallet';
import { useUserProfileStore } from '@/stores/useUserProfileStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { CHAIN_DISPLAY_NAMES } from '@/contracts/config';
import type { SupportedChain } from '@/contracts/types';

function Address({ value, testID }: { value: string; testID?: string }) {
  return (
    <FxText
      variant="bodySmallRegular"
      numberOfLines={1}
      title={value}
      className="font-mono"
      testID={testID}
    >
      {truncateMiddle(value, 10, 8)}
    </FxText>
  );
}

export default function ChainSelection() {
  const { t } = useTranslation();
  const { queueToast } = useToast();
  const { confirm } = useConfirm();
  const [authCode, setAuthCode] = useState('');
  const [showAuthInput, setShowAuthInput] = useState(false);
  const [isEditingWalletAddress, setIsEditingWalletAddress] = useState(false);
  const [walletAddressInput, setWalletAddressInput] = useState('');

  const { connected, account, connecting, connectWallet, disconnectWallet } = useWalletConnection();
  // Contract integration for chain switching (no notification); the hook re-initialises on chain change.
  useContractIntegration({ showConnectedNotification: false });
  const { provider } = useWallet();

  const manualSignatureWalletAddress = useUserProfileStore(
    (state) => state.manualSignatureWalletAddress,
  );
  const setManualSignatureWalletAddress = useUserProfileStore(
    (state) => state.setManualSignatureWalletAddress,
  );

  useEffect(() => {
    if (manualSignatureWalletAddress) setWalletAddressInput(manualSignatureWalletAddress);
  }, [manualSignatureWalletAddress]);

  const selectedChain = useSettingsStore((state) => state.selectedChain);
  const baseAuthorized = useSettingsStore((state) => state.baseAuthorized);
  const setSelectedChain = useSettingsStore((state) => state.setSelectedChain);
  const authorizeBase = useSettingsStore((state) => state.authorizeBase);
  const resetBaseAuthorization = useSettingsStore((state) => state.resetBaseAuthorization);

  const handleChainSelection = async (chain: SupportedChain) => {
    // Read the store directly: right after `authorizeBase()` the render-scoped `baseAuthorized` is still
    // stale (mobile re-showed the code box here and never switched until the user tapped Base again).
    if (chain === 'base' && !useSettingsStore.getState().baseAuthorized) {
      setShowAuthInput(true);
      return;
    }
    // Always just update the setting — no automatic wallet opening.
    setSelectedChain(chain);
    queueToast({
      type: 'success',
      title: t('settings.chain.chainUpdated.title'),
      message:
        connected && provider
          ? t('settings.chain.chainUpdated.messageConnected', { chain: CHAIN_DISPLAY_NAMES[chain] })
          : t('settings.chain.chainUpdated.messageDisconnected', {
              chain: CHAIN_DISPLAY_NAMES[chain],
            }),
    });
  };

  const handleBaseAuthorization = async () => {
    if (authorizeBase(authCode)) {
      setShowAuthInput(false);
      setAuthCode('');
      await handleChainSelection('base');
    } else {
      queueToast({
        type: 'error',
        title: t('settings.chain.invalidCode.title'),
        message: t('settings.chain.invalidCode.message'),
      });
    }
  };

  const handleResetBaseAuth = async () => {
    const ok = await confirm({
      title: t('settings.chain.resetConfirm.title'),
      message: t('settings.chain.resetConfirm.message'),
      confirmText: t('settings.chain.resetConfirm.confirm'),
      cancelText: t('settings.chain.resetConfirm.cancel'),
      destructive: true,
    });
    if (!ok) return;
    resetBaseAuthorization();
    queueToast({
      type: 'info',
      title: t('settings.chain.resetDone.title'),
      message: t('settings.chain.resetDone.message'),
    });
  };

  const saveWalletAddress = () => {
    if (walletAddressInput && walletAddressInput.startsWith('0x')) {
      setManualSignatureWalletAddress(walletAddressInput);
      setIsEditingWalletAddress(false);
      queueToast({
        type: 'success',
        title: t('settings.chain.addressSaved.title'),
        message: t('settings.chain.addressSaved.message'),
      });
    } else {
      queueToast({
        type: 'error',
        title: t('settings.chain.invalidAddress.title'),
        message: t('settings.chain.invalidAddress.message'),
      });
    }
  };

  const validAddressInput = Boolean(walletAddressInput && walletAddressInput.startsWith('0x'));

  return (
    <SettingsScreen title={t('settings.chain.title')} screen="chain-selection">
      {/* Wallet connect / disconnect */}
      <FxBox marginTop="16" marginBottom="8" flexDirection="row" alignItems="center" gap="8">
        {connected && account ? (
          <>
            <FxButton
              variant="inverted"
              onPress={() => void disconnectWallet()}
              disabled={connecting}
              testID="chain-disconnect-wallet"
            >
              {t('settings.chain.disconnectWallet')}
            </FxButton>
            <FxText variant="bodyXSRegular" color="content2" numberOfLines={1} title={account}>
              {truncateMiddle(account, 8, 6)}
            </FxText>
          </>
        ) : manualSignatureWalletAddress ? (
          <FxText variant="bodyXSRegular" color="content2">
            {t('settings.chain.manualWalletStored')}
          </FxText>
        ) : (
          <FxButton
            onPress={() => void connectWallet()}
            disabled={!!connecting}
            testID="chain-connect-wallet"
          >
            {t('settings.chain.connectWallet')}
          </FxButton>
        )}
      </FxBox>

      {/* Wallet account display / edit */}
      <FxBox
        marginTop="16"
        padding="16"
        backgroundColor="backgroundSecondary"
        borderRadius="m"
        marginBottom="16"
        testID="chain-wallet-account"
      >
        <FxBox
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
          marginBottom="12"
        >
          <FxText variant="bodyMediumRegular">{t('settings.chain.walletAccount')}</FxText>
          {!account && (
            <FxButton
              variant="inverted"
              onPress={() => setIsEditingWalletAddress(!isEditingWalletAddress)}
              testID="chain-edit-address"
            >
              {isEditingWalletAddress ? t('settings.common.cancel') : t('settings.common.edit')}
            </FxButton>
          )}
        </FxBox>

        {account && (
          <FxBox>
            <FxText variant="bodyXSRegular" color="content2" marginBottom="4">
              {t('settings.chain.connectedViaWallet')}
            </FxText>
            <Address value={account} testID="chain-connected-address" />
          </FxBox>
        )}

        {!account && manualSignatureWalletAddress && !isEditingWalletAddress && (
          <FxBox>
            <FxText variant="bodyXSRegular" color="content2" marginBottom="4">
              {t('settings.chain.manualSignatureWallet')}
            </FxText>
            <Address value={manualSignatureWalletAddress} testID="chain-manual-address" />
          </FxBox>
        )}

        {!account && !manualSignatureWalletAddress && !isEditingWalletAddress && (
          <FxText variant="bodyXSRegular" color="content2">
            {t('settings.chain.noWallet')}
          </FxText>
        )}

        {!account && isEditingWalletAddress && (
          <FxBox>
            <FxTextInput
              placeholder={t('settings.chain.walletAddressPlaceholder')}
              caption={t('settings.chain.walletAddress')}
              value={walletAddressInput}
              onChangeText={setWalletAddressInput}
              onSubmitEditing={saveWalletAddress}
              mono
              marginBottom="12"
              testID="chain-address-input"
            />
            <FxBox flexDirection="row" justifyContent="space-between" gap="16">
              <FxButton
                variant="inverted"
                flex={1}
                onPress={() => {
                  setIsEditingWalletAddress(false);
                  setWalletAddressInput(manualSignatureWalletAddress || '');
                }}
              >
                {t('settings.common.cancel')}
              </FxButton>
              <FxButton
                flex={1}
                onPress={saveWalletAddress}
                disabled={!validAddressInput}
                testID="chain-save-address"
              >
                {t('settings.common.save')}
              </FxButton>
            </FxBox>
          </FxBox>
        )}
      </FxBox>

      {/* Network switch notification (user-initiated) */}
      <WalletNotification compact />

      <FxBox marginTop="24">
        <FxText as="h2" variant="bodyMediumRegular" marginBottom="16" id="chain-select-label">
          {t('settings.chain.selectNetwork')}
        </FxText>

        <FxRadioButton.Group
          value={selectedChain}
          onValueChange={(val: string | number) => void handleChainSelection(val as SupportedChain)}
          aria-labelledby="chain-select-label"
          testID="chain-radio-group"
        >
          {(['skale', 'base'] as const).map((chain) => (
            <label
              key={chain}
              className="fx-box mb-2 cursor-pointer flex-row items-center gap-3 rounded-fx-m px-4 py-3"
              style={{
                backgroundColor:
                  selectedChain === chain ? 'var(--fx-background-secondary)' : 'transparent',
              }}
              data-testid={`chain-option-${chain}`}
            >
              <FxRadioButton value={chain} aria-label={CHAIN_DISPLAY_NAMES[chain]} />
              <FxBox flex={1} minWidth={0}>
                <FxText variant="bodyMediumRegular">{CHAIN_DISPLAY_NAMES[chain]}</FxText>
                <FxText variant="bodyXSRegular" color="content2" marginTop="4">
                  {chain === 'skale'
                    ? t('settings.chain.skaleDescription')
                    : t('settings.chain.baseDescription') +
                      (baseAuthorized ? t('settings.chain.authorizedSuffix') : '')}
                </FxText>
              </FxBox>
            </label>
          ))}
        </FxRadioButton.Group>

        {showAuthInput && (
          <FxBox
            marginTop="16"
            padding="16"
            backgroundColor="backgroundSecondary"
            borderRadius="m"
            testID="chain-auth-box"
          >
            <FxText variant="bodyMediumRegular" marginBottom="12">
              {t('settings.chain.enterAuthCode')}
            </FxText>
            <FxTextInput
              placeholder={t('settings.chain.authCodePlaceholder')}
              aria-label={t('settings.chain.authCodePlaceholder')}
              value={authCode}
              onChangeText={setAuthCode}
              onSubmitEditing={() => void handleBaseAuthorization()}
              secureTextEntry
              marginBottom="12"
              testID="chain-auth-input"
            />
            <FxBox flexDirection="row" justifyContent="space-between" gap="16">
              <FxButton
                variant="inverted"
                flex={1}
                onPress={() => {
                  setShowAuthInput(false);
                  setAuthCode('');
                }}
              >
                {t('settings.common.cancel')}
              </FxButton>
              <FxButton
                flex={1}
                onPress={() => void handleBaseAuthorization()}
                disabled={!authCode.trim()}
                testID="chain-authorize"
              >
                {t('settings.chain.authorize')}
              </FxButton>
            </FxBox>
          </FxBox>
        )}

        {baseAuthorized && (
          <FxBox marginTop="24">
            <FxButton
              variant="inverted"
              onPress={() => void handleResetBaseAuth()}
              testID="chain-reset-base"
            >
              {t('settings.chain.resetBaseAuth')}
            </FxButton>
          </FxBox>
        )}

        <FxBox
          marginTop="24"
          padding="16"
          backgroundColor="backgroundSecondary"
          borderRadius="m"
          testID="chain-current"
        >
          <FxText variant="bodyMediumRegular" marginBottom="8">
            {t('settings.chain.currentSelection')}
          </FxText>
          <FxText variant="bodyLargeRegular" color="primary">
            {CHAIN_DISPLAY_NAMES[selectedChain]}
          </FxText>
          <FxText variant="bodyXSRegular" color="content2" marginTop="4">
            {t('settings.chain.currentSelectionHint')}
          </FxText>
        </FxBox>
      </FxBox>
    </SettingsScreen>
  );
}

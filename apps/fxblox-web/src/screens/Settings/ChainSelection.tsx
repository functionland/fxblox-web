/**
 * Port of apps/box/src/screens/Settings/ChainSelection.screen.tsx: SKALE vs Base radios, connect / disconnect
 * wallet, the compact wallet notification (switch network via `useWalletNetwork`), the manual wallet-address editor
 * (`manualSignatureWalletAddress`), middle-truncated addresses. Base is no longer gated by an authorization code;
 * instead every switch first runs `checkChainSwitchAllowed` so a Blox in a pool (or with a pending join request) on
 * the current chain is not stranded.
 */
import { useEffect, useRef, useState } from 'react';
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
import { useBloxsStore } from '@/stores/useBloxsStore';
import { usePoolsStore } from '@/stores/usePoolsStore';
import { checkChainSwitchAllowed } from '@/services/chainSwitchGuard';
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
  const [checkingPools, setCheckingPools] = useState(false);
  const checkingRef = useRef(false);
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
  const setSelectedChain = useSettingsStore((state) => state.setSelectedChain);

  const applyChain = (chain: SupportedChain) => {
    // Just update the setting — no automatic wallet opening.
    setSelectedChain(chain);
    usePoolsStore.getState().setDirty();
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

  const handleChainSelection = async (chain: SupportedChain) => {
    const fromChain = useSettingsStore.getState().selectedChain;
    if (chain === fromChain || checkingRef.current) return;
    checkingRef.current = true;
    setCheckingPools(true);
    try {
      const { bloxs, getClusterPeerIdForBlox } = useBloxsStore.getState();
      const result = await checkChainSwitchAllowed(fromChain, chain, {
        bloxs,
        getClusterPeerId: getClusterPeerIdForBlox,
        account: account || manualSignatureWalletAddress,
      });
      const fromName = CHAIN_DISPLAY_NAMES[fromChain];
      if (result.ok) {
        applyChain(chain);
      } else if (result.reason === 'unverified') {
        console.warn('Chain switch: pool status unverified', result.detail);
        const proceed = await confirm({
          title: t('settings.chain.unverified.title'),
          message: t('settings.chain.unverified.message', {
            blox: result.bloxName ?? t('settings.chain.unverified.yourBloxes'),
            chain: fromName,
          }),
          confirmText: t('settings.chain.unverified.confirm'),
          cancelText: t('settings.common.cancel'),
          destructive: true,
        });
        if (proceed) applyChain(chain);
      } else {
        const key = result.reason === 'member' ? 'blockedMember' : 'blockedPending';
        queueToast({
          type: 'error',
          title: t(`settings.chain.${key}.title`),
          message: t(`settings.chain.${key}.message`, {
            blox: result.bloxName,
            pool: result.poolName,
            chain: fromName,
          }),
        });
      }
    } finally {
      checkingRef.current = false;
      setCheckingPools(false);
    }
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
              <FxRadioButton
                value={chain}
                aria-label={CHAIN_DISPLAY_NAMES[chain]}
                disabled={checkingPools}
              />
              <FxBox flex={1} minWidth={0}>
                <FxText variant="bodyMediumRegular">{CHAIN_DISPLAY_NAMES[chain]}</FxText>
                <FxText variant="bodyXSRegular" color="content2" marginTop="4">
                  {chain === 'skale'
                    ? t('settings.chain.skaleDescription')
                    : t('settings.chain.baseDescription')}
                </FxText>
              </FxBox>
            </label>
          ))}
        </FxRadioButton.Group>

        {checkingPools && (
          <FxText
            variant="bodyXSRegular"
            color="content2"
            marginTop="8"
            role="status"
            testID="chain-checking"
          >
            {t('settings.chain.checkingPools')}
          </FxText>
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

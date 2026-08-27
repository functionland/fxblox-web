/**
 * Port of apps/box/src/screens/Settings/AutoPinPairing/AutoPinPairing.screen.tsx.
 *   /autopin-pair       deep-link mode: params from the URL FRAGMENT first, query as fallback (AUTOPIN-HANDOFF
 *                       v1.1), validated before acting; `fula.isReady()` → `blockchain.autoPinPair(token,
 *                       endpoint)` → register the "FxFiles Auto-Pin" dApp → "Open FxFiles" (a user click runs
 *                       `location.assign` on the returnUrl with `$secret/$hardwareId/$bloxPeerId/$bloxName`
 *                       substituted). The token is captured once into state and stripped from the address bar.
 *   /settings/autopin   manual mode: API key + endpoint (or a QR scan) → `autoPinPair` → show / copy the secret.
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Trans, useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxPressableOpacity,
  FxText,
  FxTextInput,
  useConfirm,
} from '@functionland/fx-ui';
import { paths } from '@/app/paths';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { errorMessage } from '@/components/settings/format';
import { blockchain, fula } from '@/lib/fula';
import { copyToClipboard } from '@/platform/clipboard';
import { assign } from '@/platform/linking';
import { useBloxsStore } from '@/stores/useBloxsStore';
import { useDAppsStore } from '@/stores/dAppsSettingsStore';
import { QRScannerDialog } from './QRScannerDialog';
import {
  buildReturnUrl,
  parseAutoPinParams,
  validateAutoPinParams,
  type AutoPinParams,
} from './autopinParams';

export const AUTOPIN_DAPP_BUNDLE_ID = 'land.fx.files';

export default function AutoPinPairing() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { confirm, alert } = useConfirm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [returnLink, setReturnLink] = useState<string | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  // Manual mode state
  const [tokenInput, setTokenInput] = useState('');
  const [endpointInput, setEndpointInput] = useState('');
  const [pairingSecret, setPairingSecret] = useState<string | null>(null);

  const bloxs = useBloxsStore((state) => state.bloxs);
  const currentBloxPeerId = useBloxsStore((state) => state.currentBloxPeerId);
  const addOrUpdateDApp = useDAppsStore((state) => state.addOrUpdateDApp);

  // Deep-link params: captured once (fragment first, then query) and then stripped from the URL so the
  // bearer token is not left in the address bar / history.
  const [params] = useState<AutoPinParams>(() =>
    parseAutoPinParams({ hash: location.hash, search: location.search }),
  );
  const isDeepLinkRoute = location.pathname.replace(/\/+$/, '') === paths.autopinPair();
  const isDeepLinkMode = isDeepLinkRoute || !!params.token;
  const validation = validateAutoPinParams(params);

  useEffect(() => {
    if (params.source !== 'none' && (location.hash || location.search)) {
      void navigate({ pathname: location.pathname, search: '', hash: '' }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { token, endpoint, returnUrl } = params;
  const currentBlox = currentBloxPeerId ? bloxs[currentBloxPeerId] : undefined;
  const bloxName = currentBlox?.name || t('settings.autopin.defaultBloxName');

  const registerDApp = () =>
    addOrUpdateDApp({
      name: t('settings.autopin.dAppName'),
      peerId: '',
      bundleId: AUTOPIN_DAPP_BUNDLE_ID,
      bloxPeerId: currentBloxPeerId,
      authorized: true,
      lastUpdate: new Date(),
      storageUsed: 0,
    });

  // Deep-link mode handler
  const handleDeepLinkPair = async () => {
    if (!validation.ok) {
      setError(t(`settings.autopin.${validation.error}`));
      return;
    }
    if (!token || !endpoint) {
      setError(t('settings.autopin.missingParams'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await fula.isReady(false);
      const result = await blockchain.autoPinPair(token, endpoint);

      if (result?.pairing_secret) {
        setSuccess(true);
        const alreadyPaired = result.status === 'already_paired';
        const alertTitle = alreadyPaired
          ? t('settings.autopin.alreadyPaired.title')
          : t('settings.autopin.paired.title');
        const alertMsg = alreadyPaired
          ? t('settings.autopin.alreadyPaired.message', { blox: bloxName })
          : t('settings.autopin.paired.message', { blox: bloxName });

        registerDApp();

        if (returnUrl) {
          const finalUrl = buildReturnUrl(returnUrl, {
            secret: result.pairing_secret,
            hardwareId: result.hardware_id || '',
            bloxPeerId: currentBloxPeerId || '',
            bloxName,
          });
          setReturnLink(finalUrl);
          const open = await confirm({
            title: alertTitle,
            message: t('settings.autopin.returnQuestion', { message: alertMsg }),
            confirmText: t('settings.autopin.openFxFiles'),
            cancelText: t('settings.autopin.stayHere'),
          });
          if (open) assign(finalUrl);
        } else {
          await alert({ title: alertTitle, message: alertMsg });
        }
      } else {
        setError(t('settings.autopin.unexpectedResponse'));
      }
    } catch (e) {
      setError(errorMessage(e, t('settings.common.unknownError')));
    } finally {
      setLoading(false);
    }
  };

  // Manual mode handler
  const handleManualPair = async () => {
    if (!tokenInput || !endpointInput) {
      setError(t('settings.autopin.fillBoth'));
      return;
    }
    setLoading(true);
    setError(null);
    setPairingSecret(null);
    try {
      await fula.isReady(false);
      const result = await blockchain.autoPinPair(tokenInput, endpointInput);
      if (result?.pairing_secret) {
        setPairingSecret(result.pairing_secret);
      } else {
        setError(t('settings.autopin.unexpectedResponse'));
      }
    } catch (e) {
      setError(errorMessage(e, t('settings.common.unknownError')));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (pairingSecret) {
      await copyToClipboard(pairingSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleQRScanned = (api: string, qrEndpoint: string) => {
    setTokenInput(api);
    setEndpointInput(qrEndpoint);
    setScannerVisible(false);
  };

  const errorBox = error && (
    <FxBox backgroundColor="errorBase" padding="16" borderRadius="s" marginBottom="16" role="alert">
      <FxText color="white">{error}</FxText>
    </FxBox>
  );

  // Deep-link mode UI
  if (isDeepLinkMode) {
    const paramError = validation.ok ? null : t(`settings.autopin.${validation.error}`);
    return (
      <SettingsScreen title={t('settings.autopin.title')} screen="autopin-pairing">
        <FxBox marginTop="16" data-autopin-source={params.source}>
          <FxText variant="bodyMediumRegular" marginBottom="24" color="content2">
            <Trans
              i18nKey="settings.autopin.deepLinkIntro"
              values={{ blox: bloxName }}
              components={{
                bold: <FxText as="strong" variant="bodySmallSemibold" color="content1" />,
              }}
            />
          </FxText>

          {errorBox ||
            (paramError && !success && (
              <FxBox
                backgroundColor="errorBase"
                padding="16"
                borderRadius="s"
                marginBottom="16"
                role="alert"
                testID="autopin-param-error"
              >
                <FxText color="white">{paramError}</FxText>
              </FxBox>
            ))}

          {success ? (
            <FxBox
              backgroundColor="greenBackground"
              padding="16"
              borderRadius="s"
              gap="12"
              role="status"
            >
              <FxText color="content1">{t('settings.autopin.successBanner')}</FxText>
              {returnLink && (
                <FxButton
                  onPress={() => assign(returnLink)}
                  alignSelf="flex-start"
                  testID="autopin-open-fxfiles"
                >
                  {t('settings.autopin.openFxFiles')}
                </FxButton>
              )}
            </FxBox>
          ) : (
            <FxButton
              size="large"
              onPress={() => void handleDeepLinkPair()}
              disabled={loading || !validation.ok}
              loading={loading}
              testID="autopin-enable"
            >
              {loading ? t('settings.autopin.pairing') : t('settings.autopin.enable')}
            </FxButton>
          )}
        </FxBox>
      </SettingsScreen>
    );
  }

  // Manual mode UI
  return (
    <SettingsScreen title={t('settings.autopin.title')} screen="autopin-pairing">
      <FxBox marginTop="16">
        <FxText variant="bodyMediumRegular" marginBottom="24" color="content2">
          {t('settings.autopin.manualIntro')}
        </FxText>

        <FxButton
          size="large"
          marginBottom="24"
          onPress={() => setScannerVisible(true)}
          testID="autopin-scan-qr"
        >
          {t('settings.autopin.scanQr')}
        </FxButton>

        <FxTextInput
          caption={t('settings.autopin.apiKey')}
          value={tokenInput}
          onChangeText={setTokenInput}
          placeholder={t('settings.autopin.apiKeyPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          mono
          marginBottom="16"
          testID="autopin-token"
        />

        <FxTextInput
          caption={t('settings.autopin.endpoint')}
          value={endpointInput}
          onChangeText={setEndpointInput}
          placeholder={t('settings.autopin.endpointPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          mono
          marginBottom="16"
          testID="autopin-endpoint"
        />

        {errorBox}

        {pairingSecret ? (
          <FxBox marginBottom="16">
            <FxText variant="bodySmallSemibold" marginBottom="8" color="content2">
              {t('settings.autopin.pairingSecret')}
            </FxText>
            <FxPressableOpacity
              onPress={() => void handleCopy()}
              backgroundColor="backgroundSecondary"
              padding="16"
              borderRadius="s"
              flexDirection="row"
              alignItems="center"
              justifyContent="space-between"
              gap="12"
              className="w-full text-left"
              aria-label={t('settings.autopin.copy')}
              testID="autopin-secret"
            >
              <FxText
                variant="bodyMediumRegular"
                color="content1"
                className="min-w-0 break-all font-mono"
              >
                {pairingSecret}
              </FxText>
              <FxText
                variant="bodySmallSemibold"
                color={copied ? 'greenBase' : 'primary'}
                flexShrink={0}
              >
                {copied ? t('settings.autopin.copied') : t('settings.autopin.copy')}
              </FxText>
            </FxPressableOpacity>
          </FxBox>
        ) : (
          <FxButton
            size="large"
            onPress={() => void handleManualPair()}
            disabled={loading || !tokenInput || !endpointInput}
            loading={loading}
            testID="autopin-get-secret"
          >
            {loading ? t('settings.autopin.gettingSecret') : t('settings.autopin.getSecret')}
          </FxButton>
        )}
      </FxBox>

      <QRScannerDialog
        open={scannerVisible}
        onScanned={handleQRScanned}
        onClose={() => setScannerVisible(false)}
      />
    </SettingsScreen>
  );
}

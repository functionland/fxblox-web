/**
 * Requirements — replaces the mobile ConnectToWallet screen (which only warmed a notifee foreground service).
 * Explains the Chrome Local Network Access prompt, the Bluetooth chooser and the (optional) camera permission,
 * states the Chromium requirement, shows what this browser supports, offers the language dropdown and Continue.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxCopyButton,
  FxDropdown,
  FxStatusDot,
  FxText,
  type FxStatus,
} from '@functionland/fx-ui';
import { paths } from '@/app/paths';
import { SetupNav } from '@/components/setup/SetupNav';
import { SetupScreen } from '@/components/setup/SetupScreen';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { changeLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n';
import { isWebBluetoothSupported } from '@/platform/bluetooth';
import { detectBrowserSupport } from '@/platform/browserSupport';
import { lnaPermissionState, type LnaPermissionState } from '@/platform/lanHttp';
import { CHROME_LNA_SETTINGS_URL } from '@/platform/linking';

const REQUIREMENTS = ['lna', 'bluetooth', 'camera', 'chromium'] as const;

function StatusRow({ label, status, text }: { label: string; status: FxStatus; text: string }) {
  return (
    <FxBox flexDirection="row" alignItems="center" justifyContent="space-between" gap="8">
      <FxText variant="bodySmallRegular" color="content1">
        {label}
      </FxText>
      <FxBox flexDirection="row" alignItems="center" gap="4">
        <FxStatusDot status={status} label={null} />
        <FxText variant="bodyXSRegular" color="content3">
          {text}
        </FxText>
      </FxBox>
    </FxBox>
  );
}

export default function Requirements() {
  const { t, i18n } = useTranslation();
  const { navigate, back } = useAppNavigate();
  const [lna, setLna] = useState<LnaPermissionState | null>(null);

  useEffect(() => {
    let alive = true;
    void lnaPermissionState().then((state) => {
      if (alive) setLna(state);
    });
    return () => {
      alive = false;
    };
  }, []);

  const support = detectBrowserSupport();
  const webBluetooth = isWebBluetoothSupported();
  const camera =
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
  const available = t('setup.requirements.status.available');
  const unavailable = t('setup.requirements.status.unavailable');

  const lnaStatus: { status: FxStatus; text: string } =
    lna === 'granted'
      ? { status: 'connected', text: t('setup.requirements.status.granted') }
      : lna === 'denied'
        ? { status: 'disconnected', text: t('setup.requirements.status.denied') }
        : lna === 'prompt'
          ? { status: 'warning', text: t('setup.requirements.status.prompt') }
          : { status: 'idle', text: t('setup.requirements.status.unsupported') };

  const languageOptions = SUPPORTED_LANGUAGES.map((code) => ({
    label: t(`shell.language.${code}`),
    value: code,
  }));
  const currentLanguage: SupportedLanguage =
    SUPPORTED_LANGUAGES.find((code) => (i18n.language ?? '').toLowerCase().startsWith(code)) ??
    'en';

  return (
    <SetupScreen
      id="requirements"
      title={t('setup.requirements.title')}
      subtitle={t('setup.requirements.intro')}
    >
      <FxBox gap="12">
        {REQUIREMENTS.map((key) => (
          <FxBox
            key={key}
            as="article"
            backgroundColor="backgroundPrimary"
            borderRadius="m"
            padding="16"
            gap="4"
            testID={`requirement-${key}`}
          >
            <FxText as="h2" variant="bodySmallSemibold" color="content1">
              {t(`setup.requirements.${key}.title`)}
            </FxText>
            <FxText variant="bodySmallRegular" color="content2">
              {t(`setup.requirements.${key}.body`)}
            </FxText>
            {key === 'lna' && (
              <FxBox flexDirection="row" alignItems="center" gap="8" marginTop="4">
                <FxText
                  as="code"
                  variant="bodyXSRegular"
                  color="content3"
                  className="break-all font-mono"
                >
                  {CHROME_LNA_SETTINGS_URL}
                </FxText>
                <FxCopyButton
                  value={CHROME_LNA_SETTINGS_URL}
                  label={t('setup.common.copy')}
                  copiedLabel={t('setup.common.copied')}
                />
              </FxBox>
            )}
          </FxBox>
        ))}

        <FxBox
          as="section"
          aria-label={t('setup.requirements.status.title')}
          backgroundColor="backgroundPrimary"
          borderRadius="m"
          padding="16"
          gap="8"
          testID="browser-status"
        >
          <FxText as="h2" variant="bodySmallSemibold" color="content1">
            {t('setup.requirements.status.title')}
          </FxText>
          <StatusRow
            label={t('setup.requirements.status.chromium')}
            status={support.chromium ? 'connected' : 'disconnected'}
            text={support.chromium ? available : unavailable}
          />
          <StatusRow
            label={t('setup.requirements.status.webBluetooth')}
            status={webBluetooth ? 'connected' : 'disconnected'}
            text={webBluetooth ? available : unavailable}
          />
          <StatusRow
            label={t('setup.requirements.status.lna')}
            status={lnaStatus.status}
            text={lnaStatus.text}
          />
          <StatusRow
            label={t('setup.requirements.status.camera')}
            status={camera ? 'connected' : 'warning'}
            text={camera ? available : unavailable}
          />
        </FxBox>

        <FxDropdown
          caption={t('setup.requirements.language')}
          options={languageOptions}
          selectedValue={currentLanguage}
          onValueChange={(value) => void changeLanguage(String(value))}
          testID="language-dropdown"
        />
      </FxBox>

      <SetupNav onBack={() => back(paths.setup.welcome)}>
        <FxButton
          size="large"
          flex={1}
          onPress={() => void navigate(paths.setup.linkPassword)}
          testID="setup-continue"
        >
          {t('setup.requirements.continue')}
        </FxButton>
      </SetupNav>
    </SetupScreen>
  );
}

/**
 * Requirements — replaces the mobile ConnectToWallet screen (which only warmed a notifee foreground service).
 *
 * This screen used to print four explanatory cards (local network, Bluetooth, camera, "Chrome or Edge
 * required") plus a capability table, to everyone, always. That is a wall of technical text about things the
 * app can check itself, and it landed on people at the very start of setup — before they have a Blox, an
 * identity, or any reason to care.
 *
 * It now says nothing when there is nothing to do. Each item is checked, and only the ones that need a human
 * appear, with a button that performs the action rather than a paragraph describing it:
 *
 *   Browser      only when NOT Chromium — the one thing the user cannot fix from here, so it is a warning.
 *                On Chromium it renders nothing: the check passed, saying so is noise.
 *   Camera       only when not granted. Optional (QR pairing; pasting the code always works), so it never
 *                blocks Continue.
 *   Local network  only when explicitly DENIED. It cannot be re-prompted from JS once refused, so this is the
 *                one case a settings link genuinely helps. In the normal `prompt` state nothing is shown:
 *                Chrome asks at the moment of first contact, and `LanErrorCard` on the connect screens owns
 *                that retry with a real Blox to talk to. Offering a "grant" button here would fire a request
 *                at a Blox that is not there yet and reliably do nothing.
 *   Bluetooth    not shown at all. There is no queryable Web Bluetooth permission (`getDevices()` is behind a
 *                flag and absent on stock Chrome), so any status here would be a guess, and the next screens
 *                already offer "Connect via Bluetooth" as a real button.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxCopyButton, FxDropdown, FxText } from '@functionland/fx-ui';
import { paths } from '@/app/paths';
import { SetupNav } from '@/components/setup/SetupNav';
import { SetupScreen } from '@/components/setup/SetupScreen';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { changeLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n';
import { detectBrowserSupport } from '@/platform/browserSupport';
import {
  cameraPermissionState,
  requestCameraPermission,
  type CameraPermission,
} from '@/platform/cameraPermission';
import { lnaPermissionState, type LnaPermissionState } from '@/platform/lanHttp';
import { CHROME_LNA_SETTINGS_URL } from '@/platform/linking';

/** One attention item. Rendered only when something is actually wrong or unasked. */
function IssueCard({
  testID,
  tone = 'warning',
  title,
  body,
  children,
}: {
  testID: string;
  tone?: 'warning' | 'error';
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <FxBox
      as="article"
      backgroundColor={tone === 'error' ? 'errorMuted' : 'warningMuted'}
      borderRadius="m"
      padding="16"
      gap="8"
      role={tone === 'error' ? 'alert' : 'status'}
      testID={testID}
    >
      <FxText as="h2" variant="bodySmallSemibold" color="content1">
        {title}
      </FxText>
      <FxText variant="bodySmallRegular" color="content2">
        {body}
      </FxText>
      {children}
    </FxBox>
  );
}

export default function Requirements() {
  const { t, i18n } = useTranslation();
  const { navigate, back } = useAppNavigate();
  const [lna, setLna] = useState<LnaPermissionState | null>(null);
  const [camera, setCamera] = useState<CameraPermission>('pending');
  const [askingCamera, setAskingCamera] = useState(false);
  const [cameraRefused, setCameraRefused] = useState(false);

  useEffect(() => {
    let alive = true;
    void lnaPermissionState().then((s) => alive && setLna(s));
    void cameraPermissionState().then((s) => alive && setCamera(s));
    return () => {
      alive = false;
    };
  }, []);

  const onAllowCamera = useCallback(async () => {
    setAskingCamera(true);
    setCameraRefused(false);
    try {
      const next = await requestCameraPermission();
      setCamera(next);
      setCameraRefused(next !== 'granted');
    } finally {
      setAskingCamera(false);
    }
  }, []);

  const support = detectBrowserSupport();
  // Only a definite refusal is actionable: `prompt` is the normal pre-first-contact state and Chrome raises
  // the dialog itself at that moment.
  const lnaBlocked = lna === 'denied';
  const cameraAskable = camera === 'prompt' || camera === 'denied';
  const nothingToDo = support.chromium && !lnaBlocked && !cameraAskable;

  const languageOptions = SUPPORTED_LANGUAGES.map((code) => ({
    label: t(`shell.language.${code}`),
    value: code,
  }));
  const currentLanguage: SupportedLanguage =
    SUPPORTED_LANGUAGES.find((code) => (i18n.language ?? '').toLowerCase().startsWith(code)) ?? 'en';

  return (
    <SetupScreen
      id="requirements"
      title={t('setup.requirements.title')}
      subtitle={t('setup.requirements.intro')}
    >
      <FxBox gap="12">
        {!support.chromium && (
          <IssueCard
            testID="requirement-browser"
            tone="error"
            title={t('setup.requirements.browser.title')}
            body={t('setup.requirements.browser.body')}
          />
        )}

        {lnaBlocked && (
          <IssueCard
            testID="requirement-lna"
            title={t('setup.requirements.lna.title')}
            body={t('setup.requirements.lna.blocked')}
          >
            <FxBox flexDirection="row" alignItems="center" gap="8">
              <FxText as="code" variant="bodyXSRegular" color="content3" className="break-all font-mono">
                {CHROME_LNA_SETTINGS_URL}
              </FxText>
              <FxCopyButton
                value={CHROME_LNA_SETTINGS_URL}
                label={t('setup.common.copy')}
                copiedLabel={t('setup.common.copied')}
              />
            </FxBox>
          </IssueCard>
        )}

        {cameraAskable && (
          <IssueCard
            testID="requirement-camera"
            title={t('setup.requirements.camera.title')}
            body={t('setup.requirements.camera.optional')}
          >
            <FxBox alignItems="flex-start" gap="8">
              <FxButton
                size="small"
                loading={askingCamera}
                onPress={() => void onAllowCamera()}
                testID="camera-allow"
              >
                {t('setup.requirements.camera.allow')}
              </FxButton>
              {cameraRefused && (
                <FxText variant="bodyXSRegular" color="content3" testID="camera-refused">
                  {t('setup.requirements.camera.refused')}
                </FxText>
              )}
            </FxBox>
          </IssueCard>
        )}

        {nothingToDo && (
          <FxBox
            backgroundColor="successMuted"
            borderRadius="m"
            padding="16"
            role="status"
            testID="requirements-ok"
          >
            <FxText variant="bodySmallRegular" color="content1">
              {t('setup.requirements.allGood')}
            </FxText>
          </FxBox>
        )}

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

/**
 * Port of apps/box/src/screens/InitialSetup/Welcome.screen.tsx.
 *  - light mode: the `welcome_bg_light.png` background with the copy at the bottom; dark mode: `blox_dark.png`.
 *  - 3 s press-and-hold on the picture toggles debug mode (pointer events via FxPressableOpacity), plus an explicit
 *    visually-hidden button for keyboard / screen-reader users.
 *  - Terms → new tab; "Agree & Setup my Blox" → /setup/requirements (mobile: ConnectToWallet).
 *  The language selector and the version live in the SetupShell header/footer.
 */
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxPressableOpacity, FxText, useToast } from '@functionland/fx-ui';
import { paths } from '@/app/paths';
import { SetupNav } from '@/components/setup/SetupNav';
import { SetupScreen } from '@/components/setup/SetupScreen';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useLogger } from '@/hooks/useLogger';
import { openUrl } from '@/platform/linking';
import { isDebugModeActive, useColorMode, useSettingsStore } from '@/stores/useSettingsStore';
import bloxDark from '@/assets/images/blox_dark.png';
import welcomeBgLight from '@/assets/images/welcome_bg_light.png';

export const TERMS_URL = 'https://fx.land/terms';
export const DEBUG_LONG_PRESS_MS = 3000;

export default function Welcome() {
  const { t } = useTranslation();
  const { navigate } = useAppNavigate();
  const { toggleDebugMode } = useLogger();
  const { queueToast } = useToast();
  const colorScheme = useColorMode();
  const light = colorScheme === 'light';

  const handleToggleDebugMode = () => {
    const wasActive = isDebugModeActive(useSettingsStore.getState().debugMode);
    toggleDebugMode();
    queueToast({
      type: 'info',
      message: wasActive ? t('setup.welcome.debugDisabled') : t('setup.welcome.debugEnabled'),
      autoHideDuration: 3000,
    });
  };

  const onConnectToBox = () => void navigate(paths.setup.requirements);

  const textColor = light ? 'backgroundPrimary' : 'content1';

  const content = (
    <FxBox paddingHorizontal="20" paddingVertical="40" alignItems="center">
      <FxText letterSpacing={2} variant="bodyXXSRegular" marginBottom="16" color={textColor}>
        {t('welcome.title')}
      </FxText>
      <FxText
        as="h1"
        fontFamily="var(--fx-font-heading)"
        fontWeight={600}
        fontSize={36}
        lineHeight={48}
        textAlign="center"
        marginBottom="16"
        color={textColor}
      >
        {t('welcome.appTitle')}
      </FxText>
      <FxText variant="bodySmallRegular" textAlign="center" color={textColor}>
        {t('welcome.disclaimer')}
      </FxText>
    </FxBox>
  );

  return (
    <SetupScreen id="welcome" className="-mx-5 -mt-4 min-h-0">
      <FxPressableOpacity
        as="div"
        role="presentation"
        tabIndex={-1}
        delayLongPress={DEBUG_LONG_PRESS_MS}
        onLongPress={handleToggleDebugMode}
        flex={1}
        className="flex min-h-[60vh] w-full cursor-default flex-col justify-end rounded-none active:opacity-100"
        style={
          light
            ? {
                backgroundImage: `url(${welcomeBgLight})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : undefined
        }
        testID="welcome-hero"
      >
        {!light && (
          <FxBox flex={1} justifyContent="center" alignItems="center" paddingTop="20">
            <img
              src={bloxDark}
              alt={t('setup.welcome.imageAlt')}
              className="max-h-[40vh] w-full object-contain"
              draggable={false}
            />
          </FxBox>
        )}
        {content}
      </FxPressableOpacity>
      <button
        type="button"
        className="fx-visually-hidden"
        onClick={handleToggleDebugMode}
        data-testid="toggle-debug-mode"
      >
        {t('setup.welcome.debugToggle')}
      </button>

      <SetupNav
        above={
          <FxButton
            variant="inverted"
            size="large"
            onPress={() => openUrl(TERMS_URL, { newTab: true })}
            testID="terms"
          >
            {t('welcome.termsButton')}
          </FxButton>
        }
      >
        <FxButton size="large" flex={1} onPress={onConnectToBox} testID="setup-continue">
          {t('welcome.setupButton')}
        </FxButton>
      </SetupNav>
    </SetupScreen>
  );
}

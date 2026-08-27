/**
 * Port of apps/box/src/screens/Settings/Mode.screen.tsx: light/dark previews (radios disabled while
 * "Automatic dark mode" is on), the automatic switch, language EN / 中文, the debug-mode switch, plus the
 * web-only "Prefer Bluetooth" switch (`useSettingsStore.preferBluetooth`, plan PM4).
 */
import { useTranslation } from 'react-i18next';
import { FxBox, FxRadioButton, FxRadioButtonWithLabel, FxText } from '@functionland/fx-ui';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { SettingRow } from '@/components/settings/SettingRow';
import { changeLanguage } from '@/i18n';
import { useLogger } from '@/hooks/useLogger';
import { useSettingsStore, type ColorScheme } from '@/stores/useSettingsStore';
import modeLight from '@/assets/images/mode_light.png';
import modeDark from '@/assets/images/mode_dark.png';

export default function Mode() {
  const { t } = useTranslation();
  return (
    <SettingsScreen title={t('settings.mode.title')} screen="mode">
      <SelectMode />
      <AutomaticSwitch />
      <LanguageSelector />
      <DebugModeSwitch />
      <PreferBluetoothSwitch />
    </SettingsScreen>
  );
}

function SelectMode() {
  const { t } = useTranslation();
  const colorScheme = useSettingsStore((store) => store.colorScheme);
  const setColorScheme = useSettingsStore((store) => store.setColorScheme);
  return (
    <FxRadioButton.Group
      value={colorScheme}
      onValueChange={(next: string | number) => setColorScheme(next as ColorScheme)}
      orientation="horizontal"
      aria-label={t('settings.mode.colorScheme')}
      testID="mode-color-scheme"
    >
      <FxBox
        marginTop="16"
        flexDirection="row"
        justifyContent="space-between"
        gap="16"
        flexWrap="wrap"
        width="100%"
      >
        <ColorSchemeSelector imageSrc={modeLight} value="light" />
        <ColorSchemeSelector imageSrc={modeDark} value="dark" />
      </FxBox>
    </FxRadioButton.Group>
  );
}

function ColorSchemeSelector({ imageSrc, value }: { imageSrc: string; value: ColorScheme }) {
  const { t } = useTranslation();
  const isAuto = useSettingsStore((store) => store.isAuto);
  const label = t(`settings.mode.${value}`);
  return (
    <label className="fx-box cursor-pointer" data-testid={`mode-option-${value}`}>
      <img
        src={imageSrc}
        alt={t('settings.mode.previewAlt', { mode: label })}
        width={154}
        height={96}
        className="h-24 w-[154px] max-w-full object-contain"
        draggable={false}
      />
      <FxBox marginTop="16" flexDirection="row" alignItems="center">
        <FxRadioButton marginRight="8" value={value} disabled={isAuto} aria-label={label} />
        <FxText variant="bodySmallRegular">{label}</FxText>
      </FxBox>
    </label>
  );
}

function AutomaticSwitch() {
  const { t } = useTranslation();
  const isAuto = useSettingsStore((store) => store.isAuto);
  const toggleIsAuto = useSettingsStore((store) => store.toggleIsAuto);
  return (
    <SettingRow
      title={t('settings.mode.autoTitle')}
      description={t('settings.mode.autoDescription')}
      value={isAuto}
      onValueChange={toggleIsAuto}
      testID="mode-auto"
    />
  );
}

function LanguageSelector() {
  const { t, i18n } = useTranslation();
  const current = (i18n.resolvedLanguage ?? i18n.language ?? 'en').split(/[-_]/)[0] ?? 'en';
  return (
    <FxBox marginTop="32">
      <FxText as="h2" variant="bodySmallRegular" marginBottom="16" id="mode-language-label">
        {t('settings.mode.language')}
      </FxText>
      <FxRadioButton.Group
        value={current}
        onValueChange={(language: string | number) => void changeLanguage(String(language))}
        aria-labelledby="mode-language-label"
        testID="mode-language"
      >
        <FxBox marginBottom="8">
          <FxRadioButtonWithLabel value="en" label={t('settings.mode.languageEn')} />
        </FxBox>
        <FxBox>
          <FxRadioButtonWithLabel value="zh" label={t('settings.mode.languageZh')} />
        </FxBox>
      </FxRadioButton.Group>
    </FxBox>
  );
}

function DebugModeSwitch() {
  const { t } = useTranslation();
  const { toggleDebugMode, isDebugModeEnable } = useLogger();
  return (
    <SettingRow
      title={t('settings.mode.debugTitle')}
      description={t('settings.mode.debugDescription')}
      value={isDebugModeEnable}
      onValueChange={toggleDebugMode}
      testID="mode-debug"
    />
  );
}

function PreferBluetoothSwitch() {
  const { t } = useTranslation();
  const preferBluetooth = useSettingsStore((store) => store.preferBluetooth);
  const setPreferBluetooth = useSettingsStore((store) => store.setPreferBluetooth);
  return (
    <SettingRow
      title={t('settings.mode.preferBluetoothTitle')}
      description={t('settings.mode.preferBluetoothDescription')}
      value={preferBluetooth}
      onValueChange={setPreferBluetooth}
      testID="mode-prefer-bluetooth"
    />
  );
}

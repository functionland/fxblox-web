// Sidebar colour-mode toggle: flips the resolved theme (leaving "auto" when the user picks explicitly — the Mode
// settings page still offers the full auto/light/dark choice).
import { FxIconButton, FxSvg, useFxTheme, type FxSvgProps } from '@functionland/fx-ui';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/stores/useSettingsStore';

const SunIcon = (props: FxSvgProps) => (
  <FxSvg width={24} height={24} viewBox="0 0 24 24" {...props}>
    <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7ZM12 2a.75.75 0 0 1 .75.75v2a.75.75 0 0 1-1.5 0v-2A.75.75 0 0 1 12 2Zm0 16.5a.75.75 0 0 1 .75.75v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 1 .75-.75ZM2 12a.75.75 0 0 1 .75-.75h2a.75.75 0 0 1 0 1.5h-2A.75.75 0 0 1 2 12Zm16.5 0a.75.75 0 0 1 .75-.75h2a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1-.75-.75ZM4.93 4.93a.75.75 0 0 1 1.06 0l1.42 1.42a.75.75 0 1 1-1.06 1.06L4.93 5.99a.75.75 0 0 1 0-1.06Zm11.66 11.66a.75.75 0 0 1 1.06 0l1.42 1.42a.75.75 0 1 1-1.06 1.06l-1.42-1.42a.75.75 0 0 1 0-1.06Zm1.48-11.66a.75.75 0 0 1 0 1.06l-1.42 1.42a.75.75 0 1 1-1.06-1.06l1.42-1.42a.75.75 0 0 1 1.06 0ZM7.41 16.59a.75.75 0 0 1 0 1.06l-1.42 1.42a.75.75 0 1 1-1.06-1.06l1.42-1.42a.75.75 0 0 1 1.06 0Z" />
  </FxSvg>
);

const MoonIcon = (props: FxSvgProps) => (
  <FxSvg width={24} height={24} viewBox="0 0 24 24" {...props}>
    <path d="M12.3 2.5a.75.75 0 0 1 .7 1.03A8 8 0 0 0 20.47 14a.75.75 0 0 1 1.03.7A9.75 9.75 0 1 1 12.3 2.5Zm-1.4 1.63a8.25 8.25 0 1 0 9 9 9.5 9.5 0 0 1-9-9Z" />
  </FxSvg>
);

export function ColorModeToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { resolved } = useFxTheme();
  const isAuto = useSettingsStore((s) => s.isAuto);
  const toggleIsAuto = useSettingsStore((s) => s.toggleIsAuto);
  const setColorScheme = useSettingsStore((s) => s.setColorScheme);
  const toDark = resolved === 'light';

  const onToggle = () => {
    if (isAuto) toggleIsAuto();
    setColorScheme(toDark ? 'dark' : 'light');
  };

  return (
    <FxIconButton
      aria-label={toDark ? t('shell.sidebar.switchToDark') : t('shell.sidebar.switchToLight')}
      icon={toDark ? <MoonIcon /> : <SunIcon />}
      onPress={onToggle}
      className={className}
      testID="color-mode-toggle"
    />
  );
}

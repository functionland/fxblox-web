// Settings index (mobile Settings.screen.tsx): the menu page on phones; on desktop the SettingsLayout already
// shows the menu in its master column, so the index renders a "choose a setting" placeholder.
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxEmptyState,
  FxPageHeader,
  FxSettingsIcon,
  useIsDesktop,
} from '@functionland/fx-ui';
import { SettingsMenu } from './SettingsMenu';

export default function Settings() {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <div data-screen="settings-index" className="flex flex-1 items-center justify-center">
        <FxEmptyState
          icon={<FxSettingsIcon />}
          title={t('shell.settings.select')}
          description={t('shell.settings.selectHint')}
        />
      </div>
    );
  }

  return (
    <FxBox as="section" data-screen="settings" className="mx-auto w-full max-w-[720px] px-5">
      <FxPageHeader title={t('settings.title')} />
      <SettingsMenu />
    </FxBox>
  );
}

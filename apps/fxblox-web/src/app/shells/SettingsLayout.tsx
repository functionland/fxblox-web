/**
 * SettingsLayout: master-detail at ≥ 900px (menu column + detail outlet), separate pages below (the index route —
 * `screens/Settings/Settings.tsx` — renders the menu on phones and a "choose a setting" placeholder on desktop).
 */
import { Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useIsDesktop } from '@functionland/fx-ui';
import { SettingsMenu } from '@/screens/Settings/SettingsMenu';

export function SettingsLayout() {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();

  if (!isDesktop) return <Outlet />;

  return (
    <div
      data-testid="settings-layout"
      className="mx-auto grid w-full max-w-[1200px] grid-cols-[300px_minmax(0,1fr)] gap-8 px-6 py-4"
    >
      <aside aria-label={t('settings.title')} className="sticky top-20 self-start">
        <SettingsMenu />
      </aside>
      <section className="min-w-0">
        <Outlet />
      </section>
    </div>
  );
}

export default SettingsLayout;

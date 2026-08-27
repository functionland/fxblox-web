// ≥ 900px navigation: 72px icon rail (900–1279px) / 240px sidebar (≥ 1280px) with logo, the six primary items,
// CurrentBloxIndicator + Manage, colour-mode toggle, language and Version.
import { Link, NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Logo, cn } from '@functionland/fx-ui';
import { paths } from '@/app/paths';
import { CurrentBloxIndicator } from '@/components/CurrentBloxIndicator';
import { LanguageSelector } from '@/components/LanguageSelector';
import { Version } from '@/components/Version';
import { ColorModeToggle } from './ColorModeToggle';
import { PRIMARY_TABS } from './tabs';

export interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const { t } = useTranslation();
  return (
    <aside
      data-testid="sidebar"
      className={cn(
        'sticky top-0 hidden h-dvh flex-col border-r border-border bg-background-primary desktop:flex',
        className,
      )}
    >
      <Link
        to={paths.blox}
        aria-label={t('shell.appName')}
        className="flex h-16 shrink-0 items-center justify-center gap-3 px-4 text-content1 no-underline wide:justify-start"
      >
        <Logo width={28} height={27} color="primary" />
        <span className="hidden font-heading fx-text-h200 wide:inline">FxBlox</span>
      </Link>

      <nav aria-label={t('shell.nav.primary')} className="flex-1 overflow-y-auto px-2 py-2">
        <ul className="flex flex-col gap-1">
          {PRIMARY_TABS.map(({ id, to, labelKey, Icon }) => {
            const label = t(labelKey);
            return (
              <li key={id}>
                <NavLink
                  to={to}
                  data-tab={id}
                  title={label}
                  aria-label={label}
                  className={({ isActive }) =>
                    cn(
                      'fx-pressable flex h-11 items-center justify-center gap-3 rounded-fx-m px-3 no-underline wide:justify-start',
                      'fx-text-bodySmallSemibold transition-colors',
                      isActive
                        ? 'bg-green-background text-primary'
                        : 'text-content2 hover:bg-background-secondary hover:text-content1',
                    )
                  }
                >
                  <Icon width={24} height={24} />
                  <span className="hidden wide:inline">{label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-col gap-3 border-t border-border p-3">
        <div className="hidden flex-col gap-2 wide:flex">
          <CurrentBloxIndicator compact />
          <Link
            to={paths.bloxManage}
            className="self-end fx-text-bodyXSSemibold text-primary no-underline hover:underline"
          >
            {t('shell.sidebar.manage')}
          </Link>
        </div>
        <div
          className="flex flex-col items-center gap-1 wide:flex-row wide:justify-between"
          aria-label={t('shell.sidebar.preferences')}
        >
          <ColorModeToggle />
          <LanguageSelector align="start" />
        </div>
        <Version className="hidden wide:block" />
      </div>
    </aside>
  );
}

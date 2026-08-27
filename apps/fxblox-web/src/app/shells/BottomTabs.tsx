// < 900px primary navigation (mobile MainTabs bar): active `primary`, inactive `content3`, raised centre item.
import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { cn } from '@functionland/fx-ui';
import { PRIMARY_TABS } from './tabs';

export interface BottomTabsProps {
  className?: string;
}

export function BottomTabs({ className }: BottomTabsProps) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('shell.nav.primary')}
      data-testid="bottom-tabs"
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t border-background-secondary bg-background-app pb-[env(safe-area-inset-bottom)] desktop:hidden',
        className,
      )}
    >
      <ul className="grid grid-cols-6 items-end">
        {PRIMARY_TABS.map(({ id, to, labelKey, Icon, center }) => {
          const label = t(labelKey);
          return (
            <li key={id} className="flex justify-center">
              <NavLink
                to={to}
                data-tab={id}
                aria-label={center ? label : undefined}
                className={({ isActive }) =>
                  cn(
                    'fx-pressable flex min-h-[56px] min-w-[44px] flex-col items-center justify-end gap-1 px-1 pb-1.5 pt-2 no-underline',
                    'fx-text-bodyXSRegular transition-colors',
                    isActive ? 'text-primary' : 'text-content3',
                  )
                }
              >
                {({ isActive }) =>
                  center ? (
                    <span
                      className={cn(
                        '-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-green-base text-white shadow-md',
                        isActive && 'ring-2 ring-primary ring-offset-2 ring-offset-background-app',
                      )}
                    >
                      <Icon width={26} height={26} />
                    </span>
                  ) : (
                    <>
                      <Icon width={24} height={24} />
                      <span>{label}</span>
                    </>
                  )
                }
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

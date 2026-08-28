// Port of apps/box/src/components/SettingsList/SettingsMenu.tsx (+ SettingMenuItem) as NavLinks; Log out is
// `confirm({ destructive })` → useUserProfileStore.logout() → /setup/welcome; Version at the bottom.
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  FxButton,
  FxChevronRightIcon,
  FxText,
  cn,
  useConfirm,
  useToast,
} from '@functionland/fx-ui';
import { paths } from '@/app/paths';
import { env } from '@/config/env';
import { CHAIN_DISPLAY_NAMES } from '@/contracts/config';
import { useColorMode, useSettingsStore, useUserProfileStore } from '@/stores';
import { Version } from '@/components/Version';

const capitalizeFirstLetter = (s: string): string =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

export interface SettingsMenuItem {
  id: string;
  label: string;
  detail?: string | null;
  to: string;
  /** Leaves the AppShell (setup routes) — never shows as active. */
  external?: boolean;
}

export function useSettingsMenuItems(): SettingsMenuItem[] {
  const { t } = useTranslation();
  const mode = useColorMode();
  const selectedChain = useSettingsStore((s) => s.selectedChain);
  const bloxStatusCheckInterval = useSettingsStore((s) => s.bloxStatusCheckInterval);

  const items: SettingsMenuItem[] = [
    {
      id: 'bloxStatusMonitor',
      label: t('settings.menu.bloxStatusMonitor'),
      detail: t(`settings.menu.interval.${bloxStatusCheckInterval}`, {
        defaultValue: t('settings.menu.interval.0'),
      }),
      to: paths.settings.bloxStatusMonitor,
    },
    {
      id: 'mode',
      label: t('settings.menu.mode'),
      detail: t('settings.menu.modeDetail', {
        mode: t(`settings.menu.modeNames.${mode}`, { defaultValue: capitalizeFirstLetter(mode) }),
      }),
      to: paths.settings.mode,
    },
    {
      id: 'chain',
      label: t('settings.menu.chainSelection'),
      detail: t('settings.menu.chainDetail', { chain: CHAIN_DISPLAY_NAMES[selectedChain] }),
      to: paths.settings.chain,
    },
    { id: 'pools', label: t('settings.menu.pools'), to: paths.settings.pools },
    {
      id: 'bloxDiscovery',
      label: t('settings.menu.bloxDiscovery'),
      to: paths.setup.connectExisting,
      external: true,
    },
    {
      id: 'bluetoothCommands',
      label: t('settings.menu.bluetoothCommands'),
      to: paths.settings.bluetooth,
    },
    ...(env.ENABLE_BLOX_LOGS
      ? [{ id: 'bloxLogs', label: t('settings.menu.bloxLogs'), to: paths.settings.logs }]
      : []),
    { id: 'autoPinPairing', label: t('settings.menu.autoPinPairing'), to: paths.settings.autopin },
    // Web-only entry: mobile reaches ConnectedDApps through the `fxblox://connectdapp/…` deep link only;
    // the web route `/settings/dapps` exists (plan route table), so it needs a menu entry.
    { id: 'connectedDApps', label: t('settings.menu.connectedDApps'), to: paths.settings.dapps },
    { id: 'about', label: t('settings.menu.about'), to: paths.settings.about },
    // The component gallery is deliberately NOT listed. It is a developer tool, not a product feature, so it
    // stays reachable by typing /gallery (still gated on env.ENABLE_GALLERY in the route table) without taking
    // up a row in a menu real users read.
  ];
  return items;
}

export interface SettingsMenuProps {
  className?: string;
}

export function SettingsMenu({ className }: SettingsMenuProps) {
  const { t } = useTranslation();
  const items = useSettingsMenuItems();
  const { confirm } = useConfirm();
  const { queueToast } = useToast();
  const navigate = useNavigate();
  const logout = useUserProfileStore((s) => s.logout);
  const [loggingOut, setLoggingOut] = useState(false);

  const onLogout = async () => {
    const ok = await confirm({
      title: t('settings.logout.title'),
      message: t('settings.logout.message'),
      confirmText: t('settings.logout.confirm'),
      cancelText: t('settings.logout.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      console.error('logout failed', error);
      queueToast({ type: 'error', title: t('settings.logout.failed') });
    } finally {
      setLoggingOut(false);
    }
    void navigate(paths.setup.welcome, { replace: true });
  };

  return (
    <nav
      aria-label={t('settings.title')}
      data-testid="settings-menu"
      className={cn('flex flex-col', className)}
    >
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <NavLink
              to={item.to}
              data-menu-item={item.id}
              className={({ isActive }) =>
                cn(
                  // flex-row: .fx-pressable defaults to column (RN parity) and `flex` only sets display, so
                  // without it the label and chevron stack instead of sitting on one row.
                  'fx-pressable flex flex-row items-center justify-between gap-3 rounded-fx-s bg-background-primary px-4 py-4 no-underline transition-colors',
                  'hover:bg-background-secondary',
                  isActive && !item.external && 'ring-2 ring-primary',
                )
              }
            >
              <span className="flex min-w-0 flex-col">
                <FxText variant="bodyMediumRegular" color="content1">
                  {item.label}
                </FxText>
                {item.detail && (
                  <FxText variant="bodyXSRegular" color="content3" marginEnd="8">
                    {item.detail}
                  </FxText>
                )}
              </span>
              <FxChevronRightIcon color="content1" />
            </NavLink>
          </li>
        ))}
      </ul>
      <FxButton
        variant="inverted"
        marginTop="24"
        onPress={() => void onLogout()}
        loading={loggingOut}
        testID="logout"
      >
        {t('settings.logout.button')}
      </FxButton>
      <Version marginTop="16" />
    </nav>
  );
}

export default SettingsMenu;

/**
 * The six primary destinations in mobile order (MainTabs.navigator.tsx): Blox, Users, Plugins (center), Blox AI,
 * Devices, Settings. Shared by BottomTabs (< 900px) and Sidebar (≥ 900px).
 */
import type { ComponentType } from 'react';
import {
  BloxIcon,
  DevicesIcon,
  FxArrowUpIcon,
  FxSearchIcon,
  SettingsIcon,
  UserIcon,
  type FxSvgProps,
} from '@functionland/fx-ui';
import { paths } from '@/app/paths';

export type PrimaryTabId = 'blox' | 'users' | 'plugins' | 'bloxAi' | 'devices' | 'settings';

export interface PrimaryTab {
  id: PrimaryTabId;
  to: string;
  labelKey: string;
  Icon: ComponentType<FxSvgProps>;
  /** The raised centre item (mobile: label-less FxArrowUpIcon opening the plugin sheet). */
  center?: boolean;
}

export const PRIMARY_TABS: readonly PrimaryTab[] = [
  { id: 'blox', to: paths.blox, labelKey: 'shell.nav.blox', Icon: BloxIcon },
  { id: 'users', to: paths.users, labelKey: 'shell.nav.users', Icon: UserIcon },
  {
    id: 'plugins',
    to: paths.plugins,
    labelKey: 'shell.nav.plugins',
    Icon: FxArrowUpIcon,
    center: true,
  },
  { id: 'bloxAi', to: paths.bloxAi(), labelKey: 'shell.nav.bloxAi', Icon: FxSearchIcon },
  { id: 'devices', to: paths.devices, labelKey: 'shell.nav.devices', Icon: DevicesIcon },
  { id: 'settings', to: paths.settings.root, labelKey: 'shell.nav.settings', Icon: SettingsIcon },
];

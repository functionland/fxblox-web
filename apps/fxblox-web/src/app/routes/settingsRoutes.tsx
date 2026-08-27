/**
 * Settings route group — `/settings/*` under AppShell › SettingsLayout (master-detail ≥ 900px) › PoolsLayout.
 * Settings screen builders replace the stub modules in `src/screens/Settings/**` in place.
 */
import { Navigate, type RouteObject } from 'react-router';
import type { RouteHandle } from '@/app/routeHandle';
import { paths } from '@/app/paths';
import { env } from '@/config/env';
import { SettingsLayout } from '@/app/shells/SettingsLayout';
import { PoolsLayout } from '@/app/shells/PoolsLayout';
import { lazyScreen } from './lazyScreen';

const h = (title: string): RouteHandle => ({ title, group: 'settings' });

export interface SettingsRoutesOptions {
  /** Mount `/settings/logs` (default: `env.ENABLE_BLOX_LOGS`). */
  bloxLogs?: boolean;
}

export function buildSettingsRoutes(options: SettingsRoutesOptions = {}): RouteObject[] {
  const bloxLogs = options.bloxLogs ?? env.ENABLE_BLOX_LOGS;
  return [
    {
      path: 'settings',
      element: <SettingsLayout />,
      handle: h('settings.title'),
      children: [
        { index: true, lazy: lazyScreen(() => import('@/screens/Settings/Settings')) },
        {
          path: 'blox-status-monitor',
          lazy: lazyScreen(() => import('@/screens/Settings/BloxStatusMonitor')),
          handle: h('settings.menu.bloxStatusMonitor'),
        },
        {
          path: 'mode',
          lazy: lazyScreen(() => import('@/screens/Settings/Mode')),
          handle: h('settings.menu.mode'),
        },
        {
          path: 'chain',
          lazy: lazyScreen(() => import('@/screens/Settings/ChainSelection')),
          handle: h('settings.menu.chainSelection'),
        },
        {
          path: 'pools',
          element: <PoolsLayout />,
          handle: h('settings.menu.pools'),
          children: [
            { index: true, lazy: lazyScreen(() => import('@/screens/Settings/Pools/Pools')) },
            {
              path: ':poolId',
              lazy: lazyScreen(() => import('@/screens/Settings/Pools/PoolDetails')),
            },
            {
              path: ':poolId/join-requests',
              lazy: lazyScreen(() => import('@/screens/Settings/Pools/JoinRequests')),
            },
          ],
        },
        {
          path: 'dapps',
          lazy: lazyScreen(() => import('@/screens/Settings/ConnectedDApps/ConnectedDApps')),
          handle: h('settings.menu.connectedDApps'),
        },
        {
          path: 'autopin',
          lazy: lazyScreen(() => import('@/screens/Settings/AutoPinPairing/AutoPinPairing')),
          handle: h('settings.menu.autoPinPairing'),
        },
        {
          path: 'bluetooth',
          lazy: lazyScreen(() => import('@/screens/Settings/Bluetooth/BluetoothCommands')),
          handle: h('settings.menu.bluetoothCommands'),
        },
        ...(bloxLogs
          ? [
              {
                path: 'logs',
                lazy: lazyScreen(() => import('@/screens/Settings/BloxLogs')),
                handle: h('settings.menu.bloxLogs'),
              },
            ]
          : []),
        {
          path: 'about',
          lazy: lazyScreen(() => import('@/screens/Settings/About')),
          handle: h('settings.menu.about'),
        },
        // Mobile "Blox discovery" menu item → InitialSetup › ConnectToExistingBlox.
        { path: 'blox-discovery', element: <Navigate to={paths.setup.connectExisting} replace /> },
      ],
    },
  ];
}

export const settingsRoutes: RouteObject[] = buildSettingsRoutes();

export default settingsRoutes;

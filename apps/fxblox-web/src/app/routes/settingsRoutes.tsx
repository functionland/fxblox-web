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
import { lazyWalletScreen } from './lazyWalletScreen';

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
          lazy: lazyWalletScreen(() => import('@/screens/Settings/ChainSelection'), {
            screen: 'chain-selection',
            titleKey: 'settings.chain.title',
          }),
          handle: h('settings.menu.chainSelection'),
        },
        {
          path: 'pools',
          element: <PoolsLayout />,
          handle: h('settings.menu.pools'),
          children: [
            {
              index: true,
              lazy: lazyWalletScreen(() => import('@/screens/Settings/Pools/Pools'), {
                screen: 'pools',
                titleKey: 'settings.pools.title',
                wide: true,
              }),
            },
            {
              path: ':poolId',
              lazy: lazyWalletScreen(() => import('@/screens/Settings/Pools/PoolDetails'), {
                screen: 'pool-details',
                titleKey: 'settings.poolDetails.title',
                backTo: paths.settings.pools,
                backOnDesktopWhenNarrow: true,
              }),
            },
            {
              path: ':poolId/join-requests',
              lazy: lazyWalletScreen(() => import('@/screens/Settings/Pools/JoinRequests'), {
                screen: 'join-requests',
                titleKey: 'settings.poolDetails.joinRequests',
                backTo: paths.settings.pools,
                backOnDesktopWhenNarrow: true,
              }),
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

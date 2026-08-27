/**
 * Main-tab route group — children of AppShell (under `RequireSetup`). Main-tab screen builders replace the stub
 * modules in `src/screens/{Blox,BloxManager,Users,Plugins,Diagnostics,Devices}` in place. The two deep-link
 * routes (`/connectdapp/...`, `/autopin-pair`) render the Settings screens they target on mobile.
 */
import type { RouteObject } from 'react-router';
import type { RouteHandle } from '@/app/routeHandle';
import { lazyScreen } from './lazyScreen';

const h = (title: string): RouteHandle => ({ title, group: 'main' });

export const mainRoutes: RouteObject[] = [
  {
    path: 'blox',
    lazy: lazyScreen(() => import('@/screens/Blox/Blox')),
    handle: h('main.screens.blox'),
  },
  {
    path: 'blox/manage',
    lazy: lazyScreen(() => import('@/screens/BloxManager/BloxManager')),
    handle: h('main.screens.bloxManager'),
  },
  {
    path: 'users',
    lazy: lazyScreen(() => import('@/screens/Users/Users')),
    handle: h('main.screens.users'),
  },
  {
    path: 'plugins',
    lazy: lazyScreen(() => import('@/screens/Plugins/PluginCatalogue')),
    handle: h('main.screens.plugins'),
  },
  {
    path: 'plugins/:name',
    lazy: lazyScreen(() => import('@/screens/Plugins/PluginDetail')),
    handle: h('main.screens.plugin'),
  },
  {
    path: 'blox-ai',
    lazy: lazyScreen(() => import('@/screens/Diagnostics/Diagnostics')),
    handle: h('main.screens.bloxAi'),
  },
  {
    path: 'devices',
    lazy: lazyScreen(() => import('@/screens/Devices/Devices')),
    handle: h('main.screens.devices'),
  },
  // Deep links (mobile `fxblox://` linking config) — actions on a paired Blox; stashed by RequireSetup otherwise.
  {
    path: 'connectdapp/:appName/:bundleId/:peerId/:returnDeepLink/:accountId',
    lazy: lazyScreen(() => import('@/screens/Settings/ConnectedDApps/ConnectedDApps')),
    handle: h('settings.menu.connectedDApps'),
  },
  {
    path: 'autopin-pair',
    lazy: lazyScreen(() => import('@/screens/Settings/AutoPinPairing/AutoPinPairing')),
    handle: h('settings.menu.autoPinPairing'),
  },
];

export default mainRoutes;

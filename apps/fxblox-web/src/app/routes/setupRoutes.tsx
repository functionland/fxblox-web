/**
 * Setup route group — children of `/setup` (SetupShell). Setup screen builders replace the stub modules in
 * `src/screens/InitialSetup/*` in place; keep the `handle.progress` values (mobile 20/40/60/80/90/100, from
 * `features/setup/setupMachine.STEP_PROGRESS`).
 */
import { Navigate, type RouteObject } from 'react-router';
import { STEP_PROGRESS } from '@/features/setup/setupMachine';
import type { RouteHandle } from '@/app/routeHandle';
import { lazyScreen } from './lazyScreen';

const h = (progress: number, title: string): RouteHandle => ({ progress, title, group: 'setup' });

export const setupRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="welcome" replace /> },
  {
    path: 'welcome',
    lazy: lazyScreen(() => import('@/screens/InitialSetup/Welcome')),
    handle: h(STEP_PROGRESS.welcome, 'setup.steps.welcome'),
  },
  {
    path: 'requirements',
    lazy: lazyScreen(() => import('@/screens/InitialSetup/Requirements')),
    handle: h(STEP_PROGRESS.requirements, 'setup.steps.requirements'),
  },
  {
    path: 'link-password',
    lazy: lazyScreen(() => import('@/screens/InitialSetup/LinkPassword')),
    handle: h(STEP_PROGRESS.linkPassword, 'setup.steps.linkPassword'),
  },
  {
    path: 'connect-blox',
    lazy: lazyScreen(() => import('@/screens/InitialSetup/ConnectToBlox')),
    handle: h(STEP_PROGRESS.connectToBlox, 'setup.steps.connectToBlox'),
  },
  {
    path: 'connect-existing',
    lazy: lazyScreen(() => import('@/screens/InitialSetup/ConnectToExistingBlox')),
    handle: h(STEP_PROGRESS.connectToExistingBlox, 'setup.steps.connectToExistingBlox'),
  },
  {
    path: 'set-authorizer',
    lazy: lazyScreen(() => import('@/screens/InitialSetup/SetBloxAuthorizer')),
    handle: h(STEP_PROGRESS.setBloxAuthorizer, 'setup.steps.setBloxAuthorizer'),
  },
  {
    path: 'connect-wifi',
    lazy: lazyScreen(() => import('@/screens/InitialSetup/ConnectToWifi/ConnectToWifi')),
    handle: h(STEP_PROGRESS.connectToWifi, 'setup.steps.connectToWifi'),
  },
  {
    path: 'check-connection',
    lazy: lazyScreen(() => import('@/screens/InitialSetup/CheckConnection')),
    handle: h(STEP_PROGRESS.checkConnection, 'setup.steps.checkConnection'),
  },
  {
    path: 'complete',
    lazy: lazyScreen(() => import('@/screens/InitialSetup/SetupComplete')),
    handle: h(STEP_PROGRESS.setupComplete, 'setup.steps.setupComplete'),
  },
  {
    path: 'bluetooth',
    lazy: lazyScreen(() => import('@/screens/Settings/Bluetooth/BluetoothCommands')),
    handle: h(STEP_PROGRESS.bluetoothCommands, 'setup.steps.bluetoothCommands'),
  },
];

export default setupRoutes;

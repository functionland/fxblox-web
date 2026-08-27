/**
 * The route tree (plan §WS4 route table):
 *
 *   /                      RootGate (boot + hydration) › index redirect (/blox | /setup/welcome)
 *   /setup/*               SetupShell › setupRoutes (never guarded)
 *   /blox, /users, …       RequireSetup › AppShell › mainRoutes + settingsRoutes (+ the two deep-link routes)
 *   /gallery, /gallery/:id fx-ui gallery (DEV / VITE_ENABLE_GALLERY)
 *   *                      NotFound (link home)
 */
import type { RouteObject } from 'react-router';
import { env } from '@/config/env';
import { FullScreenSpinner } from '@/components/FullScreenSpinner';
import { IndexRedirect, RequireSetup, RootGate } from '@/app/guards';
import { RouteErrorPage } from '@/app/RouteError';
import { AppShell } from '@/app/shells/AppShell';
import { SetupShell } from '@/app/shells/SetupShell';
import NotFound from '@/screens/NotFound';
import { lazyScreen } from './lazyScreen';
import { mainRoutes } from './mainRoutes';
import { buildSettingsRoutes, settingsRoutes as defaultSettingsRoutes } from './settingsRoutes';
import { setupRoutes } from './setupRoutes';

export interface BuildRoutesOptions {
  /** Mount `/gallery` (default: `env.ENABLE_GALLERY` = DEV or VITE_ENABLE_GALLERY). */
  gallery?: boolean;
  /** Mount `/settings/logs` (default: `env.ENABLE_BLOX_LOGS`). */
  bloxLogs?: boolean;
}

export const galleryRoutes: RouteObject[] = [
  {
    path: 'gallery',
    lazy: lazyScreen(() => import('@/screens/Gallery/Gallery')),
    handle: { title: 'shell.gallery.title', group: 'gallery' },
  },
  {
    path: 'gallery/:id',
    lazy: lazyScreen(() => import('@/screens/Gallery/Gallery')),
    handle: { title: 'shell.gallery.title', group: 'gallery' },
  },
];

export function buildAppRoutes(options: BuildRoutesOptions = {}): RouteObject[] {
  const gallery = options.gallery ?? env.ENABLE_GALLERY;
  const settingsRoutes =
    options.bloxLogs === undefined
      ? defaultSettingsRoutes
      : buildSettingsRoutes({ bloxLogs: options.bloxLogs });
  return [
    {
      path: '/',
      element: <RootGate />,
      errorElement: <RouteErrorPage />,
      hydrateFallbackElement: <FullScreenSpinner />,
      children: [
        { index: true, element: <IndexRedirect /> },
        {
          path: 'setup',
          element: <SetupShell />,
          handle: { group: 'setup', title: 'shell.setup.title' },
          // Errors inside a setup screen render inside the shell.
          children: [{ errorElement: <RouteErrorPage />, children: setupRoutes }],
        },
        {
          element: <RequireSetup />,
          children: [
            {
              element: <AppShell />,
              // Errors inside a screen render inside the shell (tabs/sidebar stay usable).
              children: [
                { errorElement: <RouteErrorPage />, children: [...mainRoutes, ...settingsRoutes] },
              ],
            },
          ],
        },
        ...(gallery ? galleryRoutes : []),
        // Static: RouteErrorPage (eager) already imports NotFound for 404 responses, so lazy-loading it here would
        // only add a Rollup "will not move module" note.
        {
          path: '*',
          element: <NotFound />,
          handle: { title: 'shell.notFound.title', group: 'system' },
        },
      ],
    },
  ];
}

export const appRoutes: RouteObject[] = buildAppRoutes();

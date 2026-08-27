/**
 * Test harness for the setup screens: the real `setupRoutes` manifest inside the real `SetupShell`
 * (`createMemoryRouter`), plus probe routes for the app destinations (`/blox`, `/settings`) so navigation can be
 * asserted through the router state. The screens are lazy route modules, so `renderSetupAt` awaits the router's
 * initial load and RTL's async timeout is raised (first-import transforms are slow under Vitest).
 */
import { configure, render, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation, type RouteObject } from 'react-router';
import { vi } from 'vitest';
import { setupRoutes } from '@/app/routes/setupRoutes';
import { SetupShell } from '@/app/shells/SetupShell';
import { TestProviders } from '@/test/helpers/renderWithProviders';
import { useBloxsStore, useSettingsStore, useUserProfileStore } from '@/stores';

// Lazy route chunks + real stores: generous waits, but the RTL timeout stays below the test timeout so a
// failing `findBy` / `waitFor` reports its assertion instead of a bare test timeout.
vi.setConfig({ testTimeout: 60_000 });
configure({ asyncUtilTimeout: 12_000 });

// jsdom has no pointer capture; vaul (the FxSheet drawer) calls it on pointerdown inside the sheet.
if (typeof Element !== 'undefined' && typeof Element.prototype.setPointerCapture !== 'function') {
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
}

function Probe() {
  const { pathname, search } = useLocation();
  return (
    <p data-testid="probe">
      {pathname}
      {search}
    </p>
  );
}

export async function renderSetupAt(path: string, extraRoutes: RouteObject[] = []) {
  const routes: RouteObject[] = [
    { path: '/setup', element: <SetupShell />, children: setupRoutes },
    { path: '/blox', element: <Probe /> },
    { path: '/settings', element: <Probe /> },
    ...extraRoutes,
    { path: '*', element: <Probe /> },
  ];
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <TestProviders>
      <RouterProvider router={router} />
    </TestProviders>,
  );
  await waitFor(
    () => {
      if (!router.state.initialized) throw new Error('router not initialized yet');
    },
    { timeout: 60_000 },
  );
  return { router, ...utils };
}

/** libp2p peer ids are 52 chars (`12D3KooW` + 44 base58 chars) — SetBloxAuthorizer checks the length. */
export const TEST_APP_PEER_ID = '12D3KooWAppPeer'.padEnd(52, 'A');
export const TEST_BLOX_PEER_ID = '12D3KooWBloxPeer'.padEnd(52, 'B');
export const TEST_CLUSTER_PEER_ID = '12D3KooWCluster'.padEnd(52, 'C');

/** Fresh store state (the stores are module singletons shared by every test in a file). */
export function resetStores(opts: { identity?: boolean; appPeerId?: string | null } = {}) {
  useUserProfileStore.getState().reset();
  useBloxsStore.getState().reset();
  useUserProfileStore.setState({
    _hasHydrated: true,
    password: opts.identity ? 'test-password' : undefined,
    signiture: opts.identity ? '0xsignature' : undefined,
    appPeerId: opts.appPeerId === null ? undefined : (opts.appPeerId ?? undefined),
  });
  useBloxsStore.setState({ _hasHydrated: true });
  useSettingsStore.setState({ _hasHydrated: true, isAuto: false, colorScheme: 'dark' });
  sessionStorage.clear();
}

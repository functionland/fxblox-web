import { act, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** react-router v7 does not re-export its router type, so derive it from the factory. */
type AppRouter = ReturnType<typeof createMemoryRouter>;

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}
const boot = vi.hoisted(() => {
  const state: { current: Deferred | null; calls: number } = { current: null, calls: 0 };
  return state;
});

vi.mock('@/app/bootstrap', () => ({
  bootstrapDataLayer: () => {
    boot.calls += 1;
    return boot.current!.promise;
  },
}));

import { TestProviders } from '@/test/helpers/renderWithProviders';
import { buildAppRoutes } from '@/app/routes/appRoutes';
import { _resetRootGateForTests } from '@/app/guards';
import { consumeDeepLinkStash, peekDeepLinkStash } from '@/app/deepLinkStash';
import { useBloxsStore, useUserProfileStore } from '@/stores';

/**
 * Screens are lazy route modules, and the real ones pull in the stores/contracts/wallet graph, so the first
 * resolution of a route takes a couple of seconds under jsdom (measured ~2.4 s for /blox). These are routing
 * tests: they assert which route matched and which shell rendered — never a screen's copy, which belongs to the
 * screen's own test.
 *
 * The per-test budget must exceed ROUTE_TIMEOUT. With both at the suite default of 15 s, a route that loaded
 * slowly under a loaded full-suite run hit the TEST timeout before its 15 s `waitFor` could resolve — so the
 * wait could never actually be waited out, and the file failed roughly one run in two (on baseline too, not
 * only with changes). Giving the file room makes the route waits the thing that decides the outcome.
 */
const ROUTE_TIMEOUT = 15_000;
vi.setConfig({ testTimeout: ROUTE_TIMEOUT * 3 });

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

function setPaired(paired: boolean) {
  useUserProfileStore.setState({
    appPeerId: paired ? '12D3KooWAppPeer' : undefined,
    _hasHydrated: true,
  });
  useBloxsStore.setState({
    bloxs: paired ? { p1: { peerId: 'p1', clusterPeerId: 'p1', name: 'Test Blox' } } : {},
    currentBloxPeerId: paired ? 'p1' : undefined,
    _hasHydrated: true,
  });
}

function renderAt(path: string) {
  const router = createMemoryRouter(buildAppRoutes({ gallery: false }), { initialEntries: [path] });
  const utils = render(
    <TestProviders>
      <RouterProvider router={router} />
    </TestProviders>,
  );
  return { router, ...utils };
}

/** Waits for the lazy route module to resolve and the router to settle on `pathname`. */
async function waitForRoute(router: AppRouter, pathname: string) {
  await waitFor(
    () => {
      expect(router.state.location.pathname).toBe(pathname);
      expect(router.state.navigation.state).toBe('idle');
    },
    { timeout: ROUTE_TIMEOUT },
  );
}

/** The matched screen actually mounted something inside the shell's main landmark. */
async function expectScreenRendered() {
  await waitFor(() => expect(screen.getByRole('main')).not.toBeEmptyDOMElement(), {
    timeout: ROUTE_TIMEOUT,
  });
}

/** The shell wrapping the matched route (React commits after the router settles, so this must retry). */
async function expectShell(testId: string) {
  expect(await screen.findByTestId(testId, undefined, { timeout: ROUTE_TIMEOUT })).toBeInTheDocument();
}

describe('guards', () => {
  beforeEach(() => {
    _resetRootGateForTests();
    boot.current = deferred();
    sessionStorage.clear();
    setPaired(false);
  });

  it('RootGate shows a spinner until the data layer has booted (not hydrated → spinner)', async () => {
    const { router } = renderAt('/');
    expect(await screen.findByTestId('fullscreen-spinner')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByTestId('setup-shell')).toBeNull();
  });

  it('booted + no bloxs → / redirects to /setup/welcome', async () => {
    const { router } = renderAt('/');
    await act(async () => boot.current!.resolve());
    await waitForRoute(router, '/setup/welcome');
    await expectShell('setup-shell');
    await expectScreenRendered();
    expect(screen.queryByTestId('deep-link-banner')).toBeNull();
    expect(screen.queryByTestId('back-to-app')).toBeNull();
  });

  it('set up → / lands on /blox inside the AppShell', async () => {
    setPaired(true);
    const { router } = renderAt('/');
    await act(async () => boot.current!.resolve());
    await waitForRoute(router, '/blox');
    await expectShell('app-shell');
    // `find`, not `get`: the shell commits before its navigation does, so a synchronous query here races that
    // second commit. It failed roughly one full-suite run in two, on baseline as well as with changes.
    expect(
      await screen.findByTestId('bottom-tabs', undefined, { timeout: ROUTE_TIMEOUT }),
    ).toBeInTheDocument();
    await expectScreenRendered();
  });

  it('set up → a guarded route renders directly', async () => {
    setPaired(true);
    const { router } = renderAt('/settings/pools/7');
    await act(async () => boot.current!.resolve());
    await waitForRoute(router, '/settings/pools/7');
    await expectShell('app-shell');
    await expectScreenRendered();
    // jsdom reports the phone viewport (`useIsDesktop()` false), so the detail screen renders on its own page —
    // SettingsLayout/PoolsLayout only add their master-detail wrappers at >= 900px.
    expect(screen.queryByTestId('settings-layout')).toBeNull();
  });

  it('deep link while not set up → stashed + redirected, stash survives until consumed explicitly', async () => {
    const { router } = renderAt('/autopin-pair?token=abc&endpoint=x');
    await act(async () => boot.current!.resolve());
    await waitForRoute(router, '/setup/welcome');
    expect(peekDeepLinkStash()).toBe('/autopin-pair?token=abc&endpoint=x');
    expect(await screen.findByTestId('deep-link-banner')).toBeInTheDocument();
    // Moving around inside setup does not consume it.
    await act(async () => {
      await router.navigate('/setup/link-password');
    });
    await waitForRoute(router, '/setup/link-password');
    expect(peekDeepLinkStash()).toBe('/autopin-pair?token=abc&endpoint=x');
    expect(screen.getByTestId('deep-link-banner')).toBeInTheDocument();
    // Only the explicit consumer clears it.
    expect(consumeDeepLinkStash()).toBe('/autopin-pair?token=abc&endpoint=x');
    expect(peekDeepLinkStash()).toBeNull();
    await waitFor(() => expect(screen.queryByTestId('deep-link-banner')).toBeNull());
  });

  it('a deep link keeps its fragment (the v1.1 autopin hand-off carries #token=…)', async () => {
    const { router } = renderAt('/autopin-pair#token=abc&endpoint=x&returnUrl=y');
    await act(async () => boot.current!.resolve());
    await waitForRoute(router, '/setup/welcome');
    expect(peekDeepLinkStash()).toBe('/autopin-pair#token=abc&endpoint=x&returnUrl=y');
  });

  it('connectdapp deep link while not set up is stashed too', async () => {
    const { router } = renderAt('/connectdapp/FxFiles/land.fx/peer/ret/0x1');
    await act(async () => boot.current!.resolve());
    await waitForRoute(router, '/setup/welcome');
    expect(peekDeepLinkStash()).toBe('/connectdapp/FxFiles/land.fx/peer/ret/0x1');
  });

  it('a non-deep-link guarded route while not set up → redirected, nothing stashed', async () => {
    const { router } = renderAt('/settings/about?x=1');
    await act(async () => boot.current!.resolve());
    await waitForRoute(router, '/setup/welcome');
    expect(peekDeepLinkStash()).toBeNull();
    expect(screen.queryByTestId('deep-link-banner')).toBeNull();
  });

  it('setup routes are never guarded, and "Back to app" shows when set up', async () => {
    setPaired(true);
    const { router } = renderAt('/setup/connect-existing');
    await act(async () => boot.current!.resolve());
    await waitForRoute(router, '/setup/connect-existing');
    await expectShell('setup-shell');
    await expectShell('back-to-app');
    await expectScreenRendered();
  });

  it('/settings/blox-discovery redirects into setup', async () => {
    setPaired(true);
    const { router } = renderAt('/settings/blox-discovery');
    await act(async () => boot.current!.resolve());
    await waitForRoute(router, '/setup/connect-existing');
  });

  it('unknown routes render NotFound', async () => {
    setPaired(true);
    renderAt('/nope/nothing');
    await act(async () => boot.current!.resolve());
    expect(await screen.findByText('Page not found', undefined, { timeout: ROUTE_TIMEOUT })).toBeInTheDocument();
  });
});

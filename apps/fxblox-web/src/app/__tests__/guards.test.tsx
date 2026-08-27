import { act, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/welcome'));
    expect(await screen.findByText('Welcome — coming soon')).toBeInTheDocument();
    expect(screen.getByTestId('setup-shell')).toBeInTheDocument();
    expect(screen.queryByTestId('deep-link-banner')).toBeNull();
    expect(screen.queryByTestId('back-to-app')).toBeNull();
  });

  it('set up → / lands on /blox inside the AppShell', async () => {
    setPaired(true);
    const { router } = renderAt('/');
    await act(async () => boot.current!.resolve());
    await waitFor(() => expect(router.state.location.pathname).toBe('/blox'));
    expect(await screen.findByText('Blox — coming soon')).toBeInTheDocument();
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-tabs')).toBeInTheDocument();
  });

  it('set up → a guarded route renders directly', async () => {
    setPaired(true);
    const { router } = renderAt('/settings/pools/7');
    await act(async () => boot.current!.resolve());
    expect(await screen.findByText('Pool details — coming soon')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/settings/pools/7');
  });

  it('deep link while not set up → stashed + redirected, stash survives until consumed explicitly', async () => {
    const { router } = renderAt('/autopin-pair?token=abc&endpoint=x');
    await act(async () => boot.current!.resolve());
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/welcome'));
    expect(peekDeepLinkStash()).toBe('/autopin-pair?token=abc&endpoint=x');
    expect(await screen.findByTestId('deep-link-banner')).toBeInTheDocument();
    // Moving around inside setup does not consume it.
    await act(async () => {
      await router.navigate('/setup/link-password');
    });
    expect(await screen.findByText('Link password — coming soon')).toBeInTheDocument();
    expect(peekDeepLinkStash()).toBe('/autopin-pair?token=abc&endpoint=x');
    expect(screen.getByTestId('deep-link-banner')).toBeInTheDocument();
    // Only the explicit consumer clears it.
    expect(consumeDeepLinkStash()).toBe('/autopin-pair?token=abc&endpoint=x');
    expect(peekDeepLinkStash()).toBeNull();
    await waitFor(() => expect(screen.queryByTestId('deep-link-banner')).toBeNull());
  });

  it('connectdapp deep link while not set up is stashed too', async () => {
    const { router } = renderAt('/connectdapp/FxFiles/land.fx/peer/ret/0x1');
    await act(async () => boot.current!.resolve());
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/welcome'));
    expect(peekDeepLinkStash()).toBe('/connectdapp/FxFiles/land.fx/peer/ret/0x1');
  });

  it('a non-deep-link guarded route while not set up → redirected, nothing stashed', async () => {
    const { router } = renderAt('/settings/about?x=1');
    await act(async () => boot.current!.resolve());
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/welcome'));
    expect(peekDeepLinkStash()).toBeNull();
    expect(screen.queryByTestId('deep-link-banner')).toBeNull();
  });

  it('setup routes are never guarded, and "Back to app" shows when set up', async () => {
    setPaired(true);
    const { router } = renderAt('/setup/connect-existing');
    await act(async () => boot.current!.resolve());
    expect(
      await screen.findByText('Connect to an existing Blox — coming soon'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/setup/connect-existing');
    expect(screen.getByTestId('back-to-app')).toBeInTheDocument();
  });

  it('/settings/blox-discovery redirects into setup', async () => {
    setPaired(true);
    const { router } = renderAt('/settings/blox-discovery');
    await act(async () => boot.current!.resolve());
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/connect-existing'));
  });

  it('unknown routes render NotFound', async () => {
    setPaired(true);
    renderAt('/nope/nothing');
    await act(async () => boot.current!.resolve());
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });
});

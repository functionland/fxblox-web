/**
 * `lazyWalletScreen` renders the route's page chrome (title, back button, `data-screen`) while the ~3.8 MB
 * AppKit chunk loads, then hands over to the screen, which supplies its own chrome. Two things can silently
 * drift and neither shows up as a type error:
 *
 *  1. The `screen` slug configured on the route stops matching the one the screen itself renders, so
 *     `data-screen` changes mid-load and anything keyed on it (the E2E smoke run, the shell) sees two values.
 *  2. Someone "simplifies" the wrapper by swapping the gate out once ready. `WalletGate` owns the effect that
 *     mirrors the colour mode into AppKit (`setAppKitTheme`) and none of these four screens mount a gate of
 *     their own, so unmounting it would stop theme sync on exactly these routes — invisible in every other test.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/bootstrap', () => ({
  bootstrapDataLayer: () => Promise.resolve(),
  loadWallet: () =>
    Promise.resolve({
      initAppKit: initAppKitMock,
      setAppKitTheme: setAppKitThemeMock,
    }),
}));

const initAppKitMock = vi.hoisted(() => vi.fn());
const setAppKitThemeMock = vi.hoisted(() => vi.fn());

import { TestProviders } from '@/test/helpers/renderWithProviders';
import { lazyWalletScreen } from '@/app/routes/lazyWalletScreen';
import { _resetWalletGateForTests } from '@/components/main/WalletGate';

const CHROME = {
  screen: 'chain-selection',
  titleKey: 'settings.chain.title',
} as const;

/** Stands in for a gated screen: renders the same `data-screen` its route configures. */
function FakeScreen() {
  return <section data-screen={CHROME.screen} data-testid="real-screen" />;
}

function renderGated() {
  const routes = [
    {
      path: '/gated',
      lazy: lazyWalletScreen(() => Promise.resolve({ default: FakeScreen }), CHROME),
    },
  ];
  const router = createMemoryRouter(routes, { initialEntries: ['/gated'] });
  return render(
    <TestProviders>
      <RouterProvider router={router} />
    </TestProviders>,
  );
}

describe('lazyWalletScreen', () => {
  beforeEach(() => {
    initAppKitMock.mockClear();
    setAppKitThemeMock.mockClear();
    _resetWalletGateForTests('idle');
  });

  afterEach(() => {
    _resetWalletGateForTests('idle');
  });

  it('shows the page chrome while the wallet chunk loads and keeps the same data-screen once ready', async () => {
    renderGated();

    // While pending the route still identifies itself — no blank page.
    const pending = await screen.findByTestId('wallet-screen-gate-loading', undefined, {
      timeout: 10_000,
    });
    const chromeScreen = pending.closest('[data-screen]')?.getAttribute('data-screen');
    expect(chromeScreen).toBe(CHROME.screen);

    // Once the chunk resolves the real screen takes over — with the SAME data-screen value.
    const real = await screen.findByTestId('real-screen', undefined, { timeout: 10_000 });
    expect(real.getAttribute('data-screen')).toBe(chromeScreen);
    expect(initAppKitMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the gate mounted once ready so AppKit theme sync survives', async () => {
    renderGated();
    await screen.findByTestId('real-screen', undefined, { timeout: 10_000 });
    // The gate's theme effect runs on becoming ready. If a refactor swaps the gate out for the bare screen,
    // this never fires and colour-mode changes stop reaching AppKit on these routes.
    await waitFor(() => expect(setAppKitThemeMock).toHaveBeenCalled());
  });
});

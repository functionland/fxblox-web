/**
 * `lazyScreen` for screens whose component calls the Reown AppKit hooks at its top level
 * (`useWallet`, `useWalletNetwork`, `usePoolsWithFallback`, …).
 *
 * AppKit is deliberately kept out of the eager bundle, so `createAppKit()` has not run when such a route is
 * loaded directly (a reload on /settings/pools, a shared link, the E2E smoke run). The hooks then throw
 * "Please call createAppKit before using useAppKit hook" during render and the route falls into its error
 * element. Mounting the screen behind `WalletGate` loads the chunk, calls `initAppKit()` once, and only then
 * renders the screen — the same gate the Blox dashboard uses for its wallet-dependent cards.
 */
import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import { WalletGate } from '@/components/main/WalletGate';
import type { ScreenModule } from './lazyScreen';

export const lazyWalletScreen =
  (load: () => Promise<ScreenModule>): NonNullable<RouteObject['lazy']> =>
  async () => {
    const mod = await load();
    const Screen = mod.default;
    const Gated: ComponentType = () => (
      <WalletGate testID="wallet-screen-gate">
        <Screen />
      </WalletGate>
    );
    Gated.displayName = `WalletGated(${Screen.displayName ?? Screen.name ?? 'Screen'})`;
    return { Component: Gated };
  };

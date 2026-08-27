/**
 * `lazyScreen` for settings screens whose component calls the Reown AppKit hooks at its top level
 * (`useWallet`, `useWalletNetwork`, `usePoolsWithFallback`, …).
 *
 * AppKit is deliberately kept out of the eager bundle, so `createAppKit()` has not run when such a route is
 * loaded directly (a reload on /settings/pools, a shared link, the E2E smoke run). The hooks then throw
 * "Please call createAppKit before using useAppKit hook" during render and the route falls into its error
 * element. Mounting the screen behind `WalletGate` loads the chunk, calls `initAppKit()` once, and only then
 * renders the screen — the same gate the Blox dashboard uses for its wallet-dependent cards.
 *
 * The wallet chunk is large (~3.8 MB raw), so on a direct load it can take a noticeable moment. Gating the
 * bare screen would leave the whole page blank until it arrives — no title, no back button, and on a chunk
 * failure no way out but the browser's back button. So the gate's PENDING states (loading and error) are
 * wrapped in the standard `SettingsScreen` chrome through `wrapPending`; once ready the screen renders and
 * supplies its own (identical) chrome. `data-screen` is therefore present for the whole load, so the route
 * stays identifiable to the shell and to tests.
 *
 * The gate stays mounted in every state rather than being swapped out when ready: it owns the
 * `setAppKitTheme` effect that mirrors the app's colour mode into AppKit, and none of these four screens
 * mount a gate of their own, so unmounting it would silently stop theme sync on exactly these routes.
 */
import type { ComponentType, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { RouteObject } from 'react-router';
import { useIsWide } from '@functionland/fx-ui';
import { WalletGate } from '@/components/main/WalletGate';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import type { ScreenModule } from './lazyScreen';

export interface WalletScreenChrome {
  /** `data-screen` value — must match what the screen itself renders. */
  screen: string;
  /** i18n key for the page title the screen uses. */
  titleKey: string;
  /** Back-button fallback for a direct load. Defaults to the settings index (see `SettingsScreen`). */
  backTo?: string;
  /** Full-width column (pools). */
  wide?: boolean;
  /** Show the back chevron on desktop below the master-detail breakpoint, as the pool screens do. */
  backOnDesktopWhenNarrow?: boolean;
}

function WalletScreenChromeShell({
  screen,
  titleKey,
  backTo,
  wide,
  backOnDesktopWhenNarrow,
  children,
}: WalletScreenChrome & { children: ReactNode }) {
  const { t } = useTranslation();
  const isWide = useIsWide();
  return (
    <SettingsScreen
      screen={screen}
      title={t(titleKey)}
      backTo={backTo}
      wide={wide}
      backOnDesktop={backOnDesktopWhenNarrow ? !isWide : false}
    >
      {children}
    </SettingsScreen>
  );
}

export const lazyWalletScreen =
  (
    load: () => Promise<ScreenModule>,
    chrome: WalletScreenChrome,
  ): NonNullable<RouteObject['lazy']> =>
  async () => {
    const mod = await load();
    const Screen = mod.default;
    const Gated: ComponentType = () => (
      <WalletGate
        testID="wallet-screen-gate"
        wrapPending={(pending) => (
          <WalletScreenChromeShell {...chrome}>{pending}</WalletScreenChromeShell>
        )}
      >
        <Screen />
      </WalletGate>
    );
    Gated.displayName = `WalletGated(${Screen.displayName ?? Screen.name ?? 'Screen'})`;
    return { Component: Gated };
  };

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
 * failure no way out but the browser's back button. Instead the route renders the standard `SettingsScreen`
 * chrome immediately and puts only the gate in the content area; once the wallet is ready the screen takes
 * over and supplies its own (identical) chrome. That also keeps `data-screen` present for the whole load, so
 * the route stays identifiable to the shell and to tests.
 */
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import type { RouteObject } from 'react-router';
import { useIsWide } from '@functionland/fx-ui';
import { WalletGate, useWalletReady } from '@/components/main/WalletGate';
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

function WalletScreenFallback({
  screen,
  titleKey,
  backTo,
  wide,
  backOnDesktopWhenNarrow,
}: WalletScreenChrome) {
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
      {/* Children are unreachable: the wrapper swaps in the real screen as soon as the gate reports ready. */}
      <WalletGate testID="wallet-screen-gate">{null}</WalletGate>
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
    const Gated: ComponentType = () => {
      const status = useWalletReady();
      if (status === 'ready') return <Screen />;
      return <WalletScreenFallback {...chrome} />;
    };
    Gated.displayName = `WalletGated(${Screen.displayName ?? Screen.name ?? 'Screen'})`;
    return { Component: Gated };
  };

/**
 * Reown AppKit (web) — the `config/appKitConfig.ts` port. Ethers v5 adapter; injected / EIP-6963 on desktop,
 * WalletConnect on Android; analytics/email/socials/swaps/onramp off. `initAppKit()` is idempotent and should
 * run before the routes that use the wallet hooks mount (the chunk is lazy-loaded by WS4).
 */
import { createAppKit, type AppKit } from '@reown/appkit/react';
import { Ethers5Adapter } from '@reown/appkit-adapter-ethers5';
import { env } from '@/config/env';
import { isDebugModeActive, useSettingsStore } from '@/stores/useSettingsStore';
import { APPKIT_NETWORKS, providerMetadata, skaleEuropaHub } from './chains';
import { diag } from './diag';

let instance: AppKit | null = null;

export interface InitAppKitOptions {
  themeMode?: 'light' | 'dark';
}

/**
 * The metadata handed to the wallet in the session proposal — with one debug-mode difference.
 *
 * `providerMetadata.redirect` tells the wallet where to send the user back to after they approve (see
 * chains.ts). A diagnostic log from the reporter's phone showed MetaMask already wedged on its splash screen
 * twelve seconds after it approved a pairing and sent the user back — before any deep link was sent to it, on
 * a plain resume from recent apps. Whatever puts it in that state happens on the way it returns the user, and
 * the one thing here that makes it return the user is that redirect. So with debug mode on it is omitted: the
 * wallet leaves the user where they are after approving, they switch back by hand, and the log says whether
 * the wallet is then still healthy when they switch to it for the signature. Debug mode is an explicit opt-in
 * used for exactly this kind of report; the default is unchanged.
 *
 * Decided here, not at the call sites, because there are two (LinkPassword's loader and WalletGate) and the
 * first to run wins. AppKit reads the metadata once, so a change of debug mode needs a page reload to apply.
 */
function metadataForInit(): typeof providerMetadata | Omit<typeof providerMetadata, 'redirect'> {
  if (!isDebugModeActive(useSettingsStore.getState().debugMode)) return providerMetadata;
  const { redirect: _omitted, ...withoutRedirect } = providerMetadata;
  return withoutRedirect;
}

export function initAppKit(opts: InitAppKitOptions = {}): AppKit {
  if (instance) return instance;
  const metadata = metadataForInit();
  diag(`[wallet] AppKit init — return redirect ${'redirect' in metadata ? 'on' : 'OFF (debug mode)'}`);
  instance = createAppKit({
    adapters: [new Ethers5Adapter()],
    networks: APPKIT_NETWORKS,
    defaultNetwork: skaleEuropaHub,
    projectId: env.REOWN_PROJECT_ID,
    metadata,
    features: {
      analytics: false,
      email: false,
      socials: false,
      swaps: false,
      onramp: false,
    },
    enableInjected: true,
    enableEIP6963: true,
    enableWalletConnect: true,
    themeMode: opts.themeMode ?? 'dark',
  });
  return instance;
}

export function getAppKit(): AppKit | null {
  return instance;
}

export function setAppKitTheme(mode: 'light' | 'dark'): void {
  instance?.setThemeMode(mode);
}

/** Disconnect the wallet (logout). Safe when AppKit was never initialised. */
export async function disconnectWallet(): Promise<void> {
  if (!instance) return;
  try {
    await instance.disconnect();
  } catch (e) {
    console.warn('[appkit] disconnect failed', e);
  }
}

/**
 * Reown AppKit (web) — the `config/appKitConfig.ts` port. Ethers v5 adapter; injected / EIP-6963 on desktop,
 * WalletConnect on Android; analytics/email/socials/swaps/onramp off. `initAppKit()` is idempotent and should
 * run before the routes that use the wallet hooks mount (the chunk is lazy-loaded by WS4).
 */
import { createAppKit, type AppKit } from '@reown/appkit/react';
import { Ethers5Adapter } from '@reown/appkit-adapter-ethers5';
import { env } from '@/config/env';
import { APPKIT_NETWORKS, providerMetadata, skaleEuropaHub } from './chains';

let instance: AppKit | null = null;

export interface InitAppKitOptions {
  themeMode?: 'light' | 'dark';
}

export function initAppKit(opts: InitAppKitOptions = {}): AppKit {
  if (instance) return instance;
  instance = createAppKit({
    adapters: [new Ethers5Adapter()],
    networks: APPKIT_NETWORKS,
    defaultNetwork: skaleEuropaHub,
    projectId: env.REOWN_PROJECT_ID,
    metadata: providerMetadata,
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

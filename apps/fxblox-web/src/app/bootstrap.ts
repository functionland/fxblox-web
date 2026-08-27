/**
 * Data-layer boot (UI-free). WS4's `main.tsx` / RootGate call `bootstrapDataLayer()` once; the heavy chunks
 * (ethers + contracts, Reown AppKit) stay lazy behind the loaders below so the initial shell stays small
 * (plan: vendor chunks are loaded on the routes that need them).
 */
import '@/i18n';
import { startThemeSync } from '@/stores/useSettingsStore';
import { useUserProfileStore, useBloxsStore, useSettingsStore, waitForHydration } from '@/stores';
import { ensurePersistentStorage } from '@/platform/secureStore';
import { installNetworkLogger } from '@/utils/clientLogger';
import { refreshRelayCache } from '@/services/discoveryClient';
import { bloxStatusMonitor } from '@/services/bloxStatusMonitor';
import { detectBrowserSupport } from '@/platform/browserSupport';
import { env } from '@/config/env';

export interface BootstrapResult {
  supported: ReturnType<typeof detectBrowserSupport>;
  persisted: boolean;
  stop: () => void;
}

let booted: Promise<BootstrapResult> | null = null;

export function bootstrapDataLayer(): Promise<BootstrapResult> {
  if (booted) return booted;
  booted = (async () => {
    const supported = detectBrowserSupport();
    const stopTheme = startThemeSync();
    // Wait for the three gating stores (RootGate predicate) before anything reads them.
    await waitForHydration([useUserProfileStore, useBloxsStore, useSettingsStore]);
    await useUserProfileStore.getState().loadAllCredentials().catch((e) => console.warn('[boot] loadAllCredentials failed', e));
    const persisted = await ensurePersistentStorage();
    const stopNet = installNetworkLogger();
    void refreshRelayCache();
    const stopMonitor = bloxStatusMonitor.start();
    if (env.DEV) console.info('[boot] data layer ready', { supported, persisted, version: env.APP_VERSION, sha: env.GIT_SHA });
    return {
      supported,
      persisted,
      stop: () => {
        stopTheme();
        stopNet();
        stopMonitor();
      },
    };
  })();
  return booted;
}

/** Lazy chunk loaders (vendor-appkit / vendor-ethers / vendor-libp2p) for the routes that need them. */
export const loadWallet = () => import('@/wallet/appkit');
export const loadContracts = () => import('@/contracts/contractService');
export const loadFulaClient = () => import('@/lib/fula').then((m) => m.loadFulaClient());
export const loadDiagnostics = () => import('@/features/diagnostics/useAiSession');

// Ported VERBATIM (import paths) from apps/box/src/hooks/usePluginsForBlox.ts
import React from 'react';
import { usePluginsStore, type PluginsFetchStatus } from '@/stores/usePluginsStore';
import { useBloxsStore } from '@/stores/useBloxsStore';

const EMPTY_PLUGINS: string[] = [];

/** The installed-plugin list + fetch status for the CURRENTLY selected blox. */
export const useActivePluginsForCurrentBlox = (): { plugins: string[]; status: PluginsFetchStatus } => {
  const currentBloxPeerId = useBloxsStore((s) => s.currentBloxPeerId);
  const plugins = usePluginsStore((s) => (currentBloxPeerId ? (s.activePluginsByBlox[currentBloxPeerId] ?? EMPTY_PLUGINS) : EMPTY_PLUGINS));
  const status = usePluginsStore((s) => (currentBloxPeerId ? (s.activePluginsStatusByBlox[currentBloxPeerId] ?? 'idle') : 'idle'));
  return { plugins, status };
};

/**
 * Refetch the active-plugins list whenever the current blox is CONNECTED (per-blox status, not the global
 * `fulaIsReady`), so it fires for the NEW blox after a switch settles and auto-recovers on reconnect.
 */
export const useRefetchActivePluginsOnConnect = (): void => {
  const listActivePlugins = usePluginsStore((s) => s.listActivePlugins);
  const currentBloxPeerId = useBloxsStore((s) => s.currentBloxPeerId);
  const isConnected = useBloxsStore((s) => !!s.currentBloxPeerId && s.bloxsConnectionStatus[s.currentBloxPeerId] === 'CONNECTED');
  React.useEffect(() => {
    if (currentBloxPeerId && isConnected) {
      listActivePlugins().catch(() => {
        // Per-blox error state is recorded inside the store.
      });
    }
  }, [currentBloxPeerId, isConnected, listActivePlugins]);
};

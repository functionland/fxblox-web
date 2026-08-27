import { env } from '@/config/env';

// Last-resort hardcoded relay multiaddr. The runtime path is:
//   1. Workers /find-box returns the box's current circuit addresses
//   2. Cached /relays list (KV store) used to construct addresses
//   3. THIS constant — only when neither Workers nor cache is available
// See services/discoveryClient.ts findBox() for the resolution order.
export const FXRelay =
  '/dns/relay.dev.fx.land/tcp/4001/p2p/12D3KooWDRrBaAfPwsGJivBoUw5fE7ZpDiyfUjqgiURq2DEcL835/p2p-circuit';

// Cloudflare Workers discovery API. Owns the current relay set + per-box reachability state.
export const FXDiscoveryURL = env.DISCOVERY_URL;

// KV key for the cached relay list (same name as the mobile AsyncStorage key).
export const FXRelayCacheKey = 'fx.relayCache.v1';

// Cache TTL — fall back to hardcoded FXRelay if cache is older than this.
export const FXRelayCacheMaxAgeMs = 7 * 24 * 60 * 60 * 1000;

export const FXPoolsURL = env.POOLS_URL;
export const FXAiTrainingURL = env.AI_TRAINING_URL;

export const PLUGIN_CATALOG_BASE =
  'https://raw.githubusercontent.com/functionland/fula-ota/refs/heads/main/docker/fxsupport/linux/plugins';

export type BluetoothCommandType = 'reset' | 'cancel' | 'removedockercpblock' | 'connect';
export const BluetoothServices: Record<'command', { serviceUUID: string; characteristicUUID: string }> = {
  command: {
    serviceUUID: '00000001-710e-4a5b-8d75-3e5b444bc3cf',
    characteristicUUID: '00000003-710e-4a5b-8d75-3e5b444bc3cf',
  },
};

/** Hotspot SSID the Blox broadcasts while unpaired (the web app cannot read the joined SSID). */
export const DEFAULT_NETWORK_NAME = 'FxBlox';

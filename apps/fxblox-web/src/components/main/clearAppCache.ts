/**
 * "Clear cache" (Blox › BloxInfo sheet) — the mobile action was `AsyncStorage.clear()`. On web the equivalent is
 * the KV store (persisted slices, relay cache, manual IPs, AI-session snapshot, phone-logger rings, BLE device
 * map) plus the in-memory caches. The SecureStore (credentials) is untouched, as the Keychain was on mobile.
 *
 * Deviation: after clearing, the gating stores re-persist their CURRENT in-memory state so a reload keeps the
 * pairing (mobile silently lost it until the next store write).
 */
import { kvStore } from '@/platform/kvStore';
import { clear as clearLanIpCache } from '@/utils/lanIpCache';
import { clearLogLines } from '@/utils/clientLogger';
import { useBloxsStore, usePoolsStore, useSettingsStore, useUserProfileStore } from '@/stores';

export async function clearAppCache(): Promise<void> {
  await kvStore.clear();
  clearLanIpCache();
  clearLogLines();
  // Re-persist the pairing / settings (zustand persist writes on every set).
  useUserProfileStore.setState({});
  useBloxsStore.setState({});
  useSettingsStore.setState({});
  usePoolsStore.setState({});
}

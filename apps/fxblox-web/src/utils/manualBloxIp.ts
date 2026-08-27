/**
 * manualBloxIp — persistence for a user-typed Blox LAN IP, used as a fallback when auto-discovery fails.
 *
 * Deliberately DUMB: only reads/writes a string, never validates (the RFC1918/link-local gate is
 * `ipIsPrivateLan`, applied by both the UI and the selector). Keyed per-blox (`<prefix>/<bloxPeerId>`).
 * All failures are non-fatal. Storage: the KV store (mobile key names preserved).
 */
import { kvStore, type KeyValueStore } from '@/platform/kvStore';

const KEY_PREFIX = '@blox-ai/manual-ip/v1';

function keyFor(bloxPeerId: string): string {
  return `${KEY_PREFIX}/${bloxPeerId}`;
}

let store: KeyValueStore = kvStore;
/** Test hook. */
export function _setStoreForTests(s: KeyValueStore): void {
  store = s;
}

export async function loadManualBloxIp(bloxPeerId: string): Promise<string | null> {
  if (!bloxPeerId) return null;
  try {
    const raw = await store.getItem(keyFor(bloxPeerId));
    if (raw === null) return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (e) {
    console.warn('manualBloxIp: getItem failed', e);
    return null;
  }
}

export async function saveManualBloxIp(bloxPeerId: string, ip: string): Promise<void> {
  if (!bloxPeerId) return;
  const trimmed = (ip ?? '').trim();
  if (trimmed.length === 0) {
    await removeManualBloxIp(bloxPeerId);
    return;
  }
  try {
    await store.setItem(keyFor(bloxPeerId), trimmed);
  } catch (e) {
    console.warn('manualBloxIp: setItem failed', e);
  }
}

export async function removeManualBloxIp(bloxPeerId: string): Promise<void> {
  if (!bloxPeerId) return;
  try {
    await store.removeItem(keyFor(bloxPeerId));
  } catch (e) {
    console.warn('manualBloxIp: removeItem failed', e);
  }
}

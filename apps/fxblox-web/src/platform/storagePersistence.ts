/**
 * Persistent storage (`navigator.storage.persist()`).
 *
 * The identity, the linked wallet and the Blox list live in IndexedDB. Without the persistent-storage grant the
 * browser may evict all of it under storage pressure, and the user has to link the password and wallet again
 * (plan PM6). Settings > About reported that state but offered no way out of it — a warning the user could read
 * and not act on.
 *
 * Chrome decides `persist()` on engagement heuristics (installed as a PWA, bookmarked, high site engagement)
 * rather than by prompting, so the call can resolve `false` with no dialog shown. Callers must treat a refusal
 * as "not granted yet, try again later", never as an error — and must still call it from a user gesture, which
 * is what makes it a button rather than something done silently at boot.
 */

export type StoragePersistence = 'pending' | 'persisted' | 'notPersisted' | 'unknown';

function storageApi(): StorageManager | undefined {
  return typeof navigator !== 'undefined' ? navigator.storage : undefined;
}

/** Whether storage is already durable. `unknown` when the browser has no Storage API. */
export async function readStoragePersistence(): Promise<StoragePersistence> {
  try {
    const storage = storageApi();
    if (!storage || typeof storage.persisted !== 'function') return 'unknown';
    return (await storage.persisted()) ? 'persisted' : 'notPersisted';
  } catch {
    return 'unknown';
  }
}

/**
 * Ask for the grant. Call from a click handler.
 *
 * Returns the state afterwards, so a caller can re-render from one value: `persisted` on success,
 * `notPersisted` when the browser declined (silently — see above), `unknown` when unsupported.
 */
export async function requestPersistentStorage(): Promise<StoragePersistence> {
  try {
    const storage = storageApi();
    if (!storage || typeof storage.persist !== 'function') return 'unknown';
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return 'persisted';
    return (await storage.persist()) ? 'persisted' : 'notPersisted';
  } catch {
    return 'unknown';
  }
}

/** Rough disk headroom, when the browser exposes it — used only to explain the risk, never to gate anything. */
export async function storageEstimate(): Promise<{ usageBytes: number; quotaBytes: number } | null> {
  try {
    const storage = storageApi();
    if (!storage || typeof storage.estimate !== 'function') return null;
    const { usage, quota } = await storage.estimate();
    if (typeof usage !== 'number' || typeof quota !== 'number') return null;
    return { usageBytes: usage, quotaBytes: quota };
  } catch {
    return null;
  }
}

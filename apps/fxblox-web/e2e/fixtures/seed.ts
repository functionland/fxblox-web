/**
 * Store seeding for E2E: writes zustand-persist envelopes straight into the app's idb-keyval store
 * (`fxblox-kv` / `kv`, see src/platform/kvStore.ts) so a reload hydrates a "paired" session. Versions match the
 * stores (`userProfileSlice` v1, `bloxsModelSlice` v3, `modeSlice` v0).
 */
import type { Page } from '@playwright/test';

export const E2E_APP_PEER_ID = '12D3KooWE2EAppPeerIdE2EAppPeerIdE2EAppPeerId000';
export const E2E_BLOX_PEER_ID = '12D3KooWE2EBloxPeerIdE2EBloxPeerIdE2EBloxPeer000';

export const PAIRED_SEED: Record<string, unknown> = {
  userProfileSlice: {
    state: { appPeerId: E2E_APP_PEER_ID, bloxPeerIds: [E2E_BLOX_PEER_ID] },
    version: 1,
  },
  bloxsModelSlice: {
    state: {
      bloxs: {
        [E2E_BLOX_PEER_ID]: {
          peerId: E2E_BLOX_PEER_ID,
          clusterPeerId: E2E_BLOX_PEER_ID,
          name: 'E2E Blox',
        },
      },
      currentBloxPeerId: E2E_BLOX_PEER_ID,
      bloxsSpaceInfo: {},
      bloxsPropertyInfo: {},
    },
    version: 3,
  },
  modeSlice: {
    state: {
      isAuto: false,
      colorScheme: 'dark',
      bloxStatusCheckInterval: 0,
      preferBluetooth: false,
      selectedChain: 'skale',
      baseAuthorized: false,
      debugMode: { uniqueId: 'e2e', endDate: '2000-01-01T00:00:00.000Z' },
    },
    version: 0,
  },
};

export async function seedKv(
  page: Page,
  entries: Record<string, unknown> = PAIRED_SEED,
): Promise<void> {
  const serialized: Record<string, string> = {};
  for (const [k, v] of Object.entries(entries)) serialized[k] = JSON.stringify(v);
  await page.evaluate(
    ({ dbName, storeName, items }) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(dbName, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(storeName))
            req.result.createObjectStore(storeName);
        };
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          for (const [key, value] of Object.entries(items)) store.put(value, key);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { dbName: 'fxblox-kv', storeName: 'kv', items: serialized },
  );
}

/**
 * Seeds a paired session and loads `path`. The seed is written from a static same-origin page (`/robots.txt`,
 * served by both `vite dev` and `vite preview`) so the app is NOT running: its own persist writes (hydration,
 * `loadAllCredentials`) would otherwise race the seed and overwrite it with the empty defaults.
 */
export async function gotoPaired(page: Page, path: string): Promise<void> {
  await page.goto('/robots.txt');
  await seedKv(page);
  await page.goto(path);
  // Wait for first paint ONCE, here. The app gates rendering on IndexedDB hydration and then fetches the shell
  // chunk, so a cold start costs real time; under load that has exceeded a per-assertion timeout and failed a
  // test whose subject was not startup at all. Any of these markers means the app is up: either shell (paired,
  // or redirected into setup) or a screen root (`/gallery` and anything rendering outside a shell).
  await page
    .locator('[data-testid="app-shell"], [data-testid="setup-shell"], [data-screen]')
    .first()
    .waitFor({ state: 'attached', timeout: 30_000 });
}

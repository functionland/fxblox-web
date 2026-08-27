/**
 * KeyValueStore — the AsyncStorage replacement. One idb-keyval store (`fxblox-kv` / `kv`) shared by the zustand
 * persist adapter, the relay cache, the manual-IP and AI-session snapshots, the phone-context rings and the
 * BLE device map. Mobile key NAMES are preserved so a future export/import stays 1:1.
 */
import { clear, createStore, del, get, keys, set, type UseStore } from 'idb-keyval';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<string[]>;
  clear(): Promise<void>;
}

export const KV_DB_NAME = 'fxblox-kv';
export const KV_STORE_NAME = 'kv';

let idbHandle: UseStore | undefined;
function idb(): UseStore {
  idbHandle ??= createStore(KV_DB_NAME, KV_STORE_NAME);
  return idbHandle;
}

export function createIdbKvStore(): KeyValueStore {
  return {
    async getItem(key) {
      const v = await get<unknown>(key, idb());
      if (v === undefined || v === null) return null;
      return typeof v === 'string' ? v : JSON.stringify(v);
    },
    async setItem(key, value) {
      await set(key, value, idb());
    },
    async removeItem(key) {
      await del(key, idb());
    },
    async getAllKeys() {
      const ks = await keys(idb());
      return ks.map((k) => String(k));
    },
    async clear() {
      await clear(idb());
    },
  };
}

/** In-memory implementation for tests / non-persistent contexts. */
export function createMemoryKvStore(seed?: Record<string, string>): KeyValueStore & { dump(): Record<string, string> } {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    async getItem(key) {
      return map.get(key) ?? null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
    async removeItem(key) {
      map.delete(key);
    },
    async getAllKeys() {
      return [...map.keys()];
    },
    async clear() {
      map.clear();
    },
    dump() {
      return Object.fromEntries(map);
    },
  };
}

export const kvStore: KeyValueStore = createIdbKvStore();

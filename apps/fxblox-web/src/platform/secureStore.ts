/**
 * SecureStore — the react-native-keychain replacement (decision D10).
 *
 * IndexedDB `fxblox-secure` v1 with two stores:
 *   - `meta`    key `master` → a NON-EXTRACTABLE AES-GCM-256 CryptoKey (created lazily on first use).
 *   - `secrets` key = Service → `{ v: 1, service, username, iv(12), ct, createdAt, updatedAt }`.
 *
 * AAD = utf8('fxblox|secure|v1|' + service) binds every ciphertext to its slot: a record copied from one service
 * key to another fails to decrypt (tested). `load` returns `false` when nothing is stored or the record does not
 * decrypt — the keychain's "no credentials" shape — so `useUserProfileStore.loadAllCredentials` is untouched.
 * `save` returns `{ username, password, service }` so `setKeyChainValue` keeps reading `?.password`.
 *
 * Threat model (docs/SECURITY.md): protects at rest and prevents key exfiltration; script on this origin can still
 * USE the key, so the CSP is the primary control. Never mirror these values into zustand persist.
 */

export enum Service {
  /** DID password */
  DIDPassword = 'DIDCredentials',
  /** Wallet signature */
  Signiture = 'Signiture',
  /** Wallet address */
  Address = 'Address',
  /** WNFS root cid */
  FULARootCID = 'FULARootCID',
  /** FULA client's PeerId */
  FULAPeerId = 'FULAPeerId',
}

export interface UserCredentials {
  username: string;
  password: string;
  service: string;
  storage?: string;
}

export interface SecureRecord {
  v: 1;
  service: string;
  username: string;
  iv: Uint8Array<ArrayBuffer>;
  ct: ArrayBuffer;
  createdAt: number;
  updatedAt: number;
}

export const SECURE_DB_NAME = 'fxblox-secure';
export const SECURE_DB_VERSION = 1;
const META_STORE = 'meta';
const SECRETS_STORE = 'secrets';
const MASTER_KEY_ID = 'master';
const IV_BYTES = 12;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function aadFor(service: string): Uint8Array<ArrayBuffer> {
  return enc.encode(`fxblox|secure|v1|${service}`);
}

function idbFactory(): IDBFactory {
  const f = globalThis.indexedDB;
  if (!f) throw new Error('SecureStore: IndexedDB is not available');
  return f;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = idbFactory().open(SECURE_DB_NAME, SECURE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      if (!db.objectStoreNames.contains(SECRETS_STORE)) db.createObjectStore(SECRETS_STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
        masterKeyPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('SecureStore: open failed'));
    req.onblocked = () => reject(new Error('SecureStore: open blocked'));
  }).catch((e) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

function request<T>(store: IDBObjectStore, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const r = op(store);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('SecureStore: request failed'));
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  op: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(storeName, mode);
  const result = request(tx.objectStore(storeName), op);
  // The request can reject (e.g. ConstraintError from `add`) before the transaction settles; mark it handled so
  // the browser does not report an unhandled rejection, then surface it through the await below.
  result.catch(() => undefined);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('SecureStore: transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('SecureStore: transaction aborted'));
  });
  const [value] = await Promise.all([result, done]);
  return value;
}

let masterKeyPromise: Promise<CryptoKey> | null = null;

async function getMasterKey(): Promise<CryptoKey> {
  if (masterKeyPromise) return masterKeyPromise;
  masterKeyPromise = (async () => {
    const existing = await withStore<unknown>(META_STORE, 'readonly', (s) => s.get(MASTER_KEY_ID));
    if (existing) return existing as CryptoKey;
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    try {
      // `add` (not `put`) so a concurrent first-use in another tab cannot overwrite a key that already
      // encrypted something; on ConstraintError we simply adopt the winner.
      await withStore(META_STORE, 'readwrite', (s) => s.add(key, MASTER_KEY_ID));
      return key;
    } catch (e) {
      const again = await withStore<unknown>(META_STORE, 'readonly', (s) => s.get(MASTER_KEY_ID));
      if (again) return again as CryptoKey;
      throw e;
    }
  })().catch((e) => {
    masterKeyPromise = null;
    throw e;
  });
  return masterKeyPromise;
}

function randomIv(): Uint8Array<ArrayBuffer> {
  const iv = new Uint8Array(new ArrayBuffer(IV_BYTES));
  crypto.getRandomValues(iv);
  return iv;
}

/**
 * Saves credentials securely (keychain `setGenericPassword` shape).
 */
export async function save(username: string, password: string, service: Service | string): Promise<UserCredentials | null> {
  const key = await getMasterKey();
  const iv = randomIv();
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aadFor(service) },
    key,
    enc.encode(password),
  );
  const now = Date.now();
  const prev = await withStore<SecureRecord | undefined>(SECRETS_STORE, 'readonly', (s) => s.get(service));
  const record: SecureRecord = {
    v: 1,
    service,
    username,
    iv,
    ct,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
  await withStore(SECRETS_STORE, 'readwrite', (s) => s.put(record, service));
  return { username, password, service, storage: 'idb-aes-gcm' };
}

/**
 * Loads credentials (keychain `getGenericPassword` shape): `false` when missing or undecryptable.
 */
export async function load(service: Service | string): Promise<false | UserCredentials> {
  let record: SecureRecord | undefined;
  try {
    record = await withStore<SecureRecord | undefined>(SECRETS_STORE, 'readonly', (s) => s.get(service));
  } catch (e) {
    console.warn('[secureStore] load failed', e);
    return false;
  }
  if (!record || record.v !== 1) return false;
  try {
    const key = await getMasterKey();
    const iv = new Uint8Array(new ArrayBuffer(record.iv.byteLength));
    iv.set(record.iv);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aadFor(service) }, key, record.ct);
    return { username: record.username, password: dec.decode(pt), service, storage: 'idb-aes-gcm' };
  } catch {
    // OperationError: wrong key / AAD mismatch / corrupt ciphertext → "no credentials".
    return false;
  }
}

/** Removes the credentials for one service (keychain `resetGenericPassword`). */
export async function reset(service: Service | string): Promise<boolean> {
  try {
    await withStore(SECRETS_STORE, 'readwrite', (s) => s.delete(service));
    return true;
  } catch (e) {
    console.warn('[secureStore] reset failed', e);
    return false;
  }
}

/** Lists which services currently have a record (no decryption). */
export async function listServices(): Promise<string[]> {
  const ks = await withStore<IDBValidKey[]>(SECRETS_STORE, 'readonly', (s) => s.getAllKeys());
  return ks.map(String);
}

async function closeDb(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;
  masterKeyPromise = null;
  if (pending) {
    try {
      (await pending).close();
    } catch {
      /* already closed / failed to open */
    }
  }
}

const WIPE_DELETE_TIMEOUT_MS = 5_000;

/**
 * Logout / "Clear cached data": clears both stores, drops the master key and deletes the database. Our own
 * connection is closed first; other tabs close theirs via `onversionchange`, so a `blocked` delete completes
 * shortly after — we wait for success/error with a safety timeout instead of returning while still blocked.
 */
export async function wipe(): Promise<void> {
  try {
    await withStore(SECRETS_STORE, 'readwrite', (s) => s.clear());
    await withStore(META_STORE, 'readwrite', (s) => s.clear());
  } catch (e) {
    console.warn('[secureStore] clear during wipe failed', e);
  }
  await closeDb();
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      console.warn('[secureStore] deleteDatabase still blocked after timeout; records were cleared');
      resolve();
    }, WIPE_DELETE_TIMEOUT_MS);
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };
    const req = idbFactory().deleteDatabase(SECURE_DB_NAME);
    req.onsuccess = finish;
    req.onerror = finish;
    req.onblocked = () => {
      /* another tab still has it open; its onversionchange closes it and onsuccess follows */
    };
  });
}

/**
 * Ask the browser to protect this origin's storage from eviction (call once at boot). Returns the persisted state
 * (or `false` when the API is unavailable) so Settings can warn.
 */
export async function ensurePersistentStorage(): Promise<boolean> {
  try {
    const storage = navigator.storage;
    if (!storage?.persist) return false;
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}

export async function isPersisted(): Promise<boolean | null> {
  try {
    const storage = navigator.storage;
    if (!storage?.persisted) return null;
    return await storage.persisted();
  } catch {
    return null;
  }
}

/** Test hooks — direct record access for the AAD-binding test and cache resets between cases. */
export const _internal = {
  openDb,
  getMasterKey,
  closeDb,
  SECRETS_STORE,
  META_STORE,
  MASTER_KEY_ID,
  withStore,
};

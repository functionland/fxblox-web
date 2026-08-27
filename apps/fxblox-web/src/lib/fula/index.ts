/**
 * Single import point for the libp2p client (`@functionland/fula-web-client`), typed by the contract in ./types.
 *
 * The package (js-libp2p, noise, yamux, WebTransport …) is LAZY: the `fula` / `blockchain` / `fxblox` /
 * `identity` namespaces are proxies whose methods `import()` the package on first use, so the initial shell does
 * not carry the ~400 KB libp2p chunk (plan: lazy-load on the routes that need it). A namespace or method the
 * package does not export yet rejects with a clear "not available yet" error — never a TypeError deep inside a
 * store. Tests: `vi.mock('@/lib/fula', () => ({ fula: {...}, blockchain: {...}, fxblox: {...} }))`.
 */
import type {
  BlockchainNamespace,
  FulaClientConfig,
  FulaClientContract,
  FulaNamespace,
  FulaWebErrorCode,
  FxbloxNamespace,
  IdentityNamespace,
} from './types';

export type * from './types';
export type { FulaWebError } from '@functionland/fula-web-client';

type LoadedClient = Partial<FulaClientContract>;

let loading: Promise<LoadedClient> | null = null;

/** Load the client package (idempotent). Exposed so a route can warm the chunk early. */
export function loadFulaClient(): Promise<LoadedClient> {
  loading ??= import('@functionland/fula-web-client').then((m) => m as unknown as LoadedClient);
  return loading;
}

/** Read an optional export defensively (a module mock in tests may throw on unknown keys). */
function pick<K extends keyof FulaClientContract>(mod: LoadedClient, name: K): FulaClientContract[K] | undefined {
  try {
    return mod[name];
  } catch {
    return undefined;
  }
}

function lazyNamespace<K extends keyof FulaClientContract>(name: K): FulaClientContract[K] {
  return new Proxy({} as object, {
    get(_target, prop) {
      if (prop === 'then') return undefined; // never look like a thenable
      if (typeof prop === 'symbol') return undefined;
      return async (...args: unknown[]) => {
        const mod = await loadFulaClient();
        const ns = pick(mod, name) as unknown as Record<string, unknown> | undefined;
        const fn = ns?.[prop];
        if (typeof fn !== 'function') {
          throw new Error(`@functionland/fula-web-client does not export "${name}.${prop}" yet (WS1 in progress)`);
        }
        return (fn as (...a: unknown[]) => unknown).apply(ns, args);
      };
    },
  }) as FulaClientContract[K];
}

export const fula: FulaNamespace = lazyNamespace('fula');
export const blockchain: BlockchainNamespace = lazyNamespace('blockchain');
export const fxblox: FxbloxNamespace = lazyNamespace('fxblox');
export const identity: IdentityNamespace = lazyNamespace('identity');

/** True once the package is loaded AND exports the `fula` namespace. */
export async function isFulaClientAvailable(): Promise<boolean> {
  const f = pick(await loadFulaClient(), 'fula');
  return typeof f === 'object' && f !== null;
}

export async function configure(config: FulaClientConfig): Promise<void> {
  const impl = pick(await loadFulaClient(), 'configure');
  if (typeof impl === 'function') {
    impl(config);
  } else {
    console.warn('[fula] configure() ignored — fula-web-client does not export it yet');
  }
}

/** Duck-typed check (the class itself lives in the lazy chunk). */
export function isFulaWebError(e: unknown): e is Error & { code: FulaWebErrorCode; status?: number; action?: string } {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'FulaWebError' && typeof (e as { code?: unknown }).code === 'string';
}

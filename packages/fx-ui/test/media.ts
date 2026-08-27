/**
 * Controllable `window.matchMedia` mock for jsdom.
 *
 * `setMediaState({ desktop: true })` flips the `(min-width: 900px)` query and notifies every
 * registered `change` listener, so `useMediaQuery` / `useIsDesktop` re-render in tests.
 */
export interface MediaState {
  /** `(min-width: 900px)` → FxSheet dialog mode, sidebar layouts. */
  desktop: boolean;
  /** `(min-width: 1280px)` */
  wide: boolean;
  /** `(prefers-color-scheme: dark)` */
  dark: boolean;
  /** `(prefers-reduced-motion: reduce)` */
  reducedMotion: boolean;
}

const initial: MediaState = { desktop: false, wide: false, dark: false, reducedMotion: false };
const state: MediaState = { ...initial };

type Listener = (ev: MediaQueryListEvent) => void;
const registry = new Map<string, Set<Listener>>();

function evaluate(query: string): boolean {
  const q = query.replace(/\s+/g, '');
  if (q.includes('min-width:900px')) return state.desktop;
  if (q.includes('min-width:1280px')) return state.wide;
  if (q.includes('max-width:899')) return !state.desktop;
  if (q.includes('prefers-color-scheme:dark')) return state.dark;
  if (q.includes('prefers-color-scheme:light')) return !state.dark;
  if (q.includes('prefers-reduced-motion:reduce')) return state.reducedMotion;
  if (q.includes('hover:hover')) return true;
  if (q.includes('pointer:fine')) return true;
  return false;
}

export function installMatchMediaMock(): void {
  const impl = (query: string): MediaQueryList => {
    const listeners = registry.get(query) ?? new Set<Listener>();
    registry.set(query, listeners);
    const mql = {
      media: query,
      get matches() {
        return evaluate(query);
      },
      onchange: null,
      addEventListener: (_type: string, cb: Listener) => listeners.add(cb),
      removeEventListener: (_type: string, cb: Listener) => listeners.delete(cb),
      addListener: (cb: Listener) => listeners.add(cb),
      removeListener: (cb: Listener) => listeners.delete(cb),
      dispatchEvent: () => true,
    };
    return mql as unknown as MediaQueryList;
  };
  Object.defineProperty(window, 'matchMedia', { value: impl, writable: true, configurable: true });
}

export function setMediaState(partial: Partial<MediaState>): void {
  Object.assign(state, partial);
  for (const [query, listeners] of registry) {
    const ev = { matches: evaluate(query), media: query } as MediaQueryListEvent;
    for (const cb of listeners) cb(ev);
  }
}

export function resetMediaState(): void {
  Object.assign(state, initial);
}

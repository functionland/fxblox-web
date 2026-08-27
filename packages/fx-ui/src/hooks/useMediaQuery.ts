import { useCallback, useSyncExternalStore } from 'react';
import { breakpoints } from '../theme/tokens.js';

const noop = () => {};

function canMatch(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

/** Reactive `window.matchMedia(query).matches`; `fallback` is used during SSR / when matchMedia is missing. */
export function useMediaQuery(query: string, fallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!canMatch()) return noop;
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(
    () => (canMatch() ? window.matchMedia(query).matches : fallback),
    [query, fallback],
  );
  const getServerSnapshot = useCallback(() => fallback, [fallback]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export const DESKTOP_QUERY = `(min-width: ${breakpoints.desktop}px)`;
export const WIDE_QUERY = `(min-width: ${breakpoints.wide}px)`;

/** ≥ 900px: sidebar layouts, FxSheet renders as a dialog / side panel. */
export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}

/** ≥ 1280px. */
export function useIsWide(): boolean {
  return useMediaQuery(WIDE_QUERY);
}

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/** Non-hook variant for effects / imperative code. */
export function prefersReducedMotion(): boolean {
  return canMatch() && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * `useAppNavigate().back(fallback)` replaces react-navigation's `goBack()/pop()`: a direct load (deep link,
 * refresh, bookmark) has no in-app history entry to pop, so `back` falls through to `fallback` instead of leaving
 * the site. react-router's data router keeps its own index in `history.state.idx` (0 = first in-app entry).
 */
import { useCallback, useMemo } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router';
import { paths } from '@/app/paths';

export interface AppNavigate {
  navigate: NavigateFunction;
  /** Pops the in-app history if there is any, else replaces with `fallback` (default `/blox`). */
  back: (fallback?: string) => void;
  /** Whether `back()` would pop (there is an in-app entry behind the current one). */
  canGoBack: () => boolean;
}

export function historyIndex(): number | undefined {
  if (typeof window === 'undefined') return undefined;
  const state = window.history.state as { idx?: unknown } | null;
  return typeof state?.idx === 'number' ? state.idx : undefined;
}

export function useAppNavigate(): AppNavigate {
  const navigate = useNavigate();
  const canGoBack = useCallback(() => (historyIndex() ?? 0) > 0, []);
  const back = useCallback(
    (fallback: string = paths.blox) => {
      if (canGoBack()) void navigate(-1);
      else void navigate(fallback, { replace: true });
    },
    [navigate, canGoBack],
  );
  return useMemo(() => ({ navigate, back, canGoBack }), [navigate, back, canGoBack]);
}

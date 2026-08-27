/**
 * Route `handle` contract shared by the three route-group manifests. Read with `useRouteHandle()` (deepest
 * match wins) — SetupShell takes `progress`, every shell sets `document.title` from `title`.
 */
import { useEffect } from 'react';
import { useMatches } from 'react-router';
import { useTranslation } from 'react-i18next';

export type RouteGroup = 'setup' | 'main' | 'settings' | 'gallery' | 'system';

export interface RouteHandle {
  /** SetupShell progress bar value (0 hides the bar). */
  progress?: number;
  /** Document title — an i18n key or a literal (i18n `defaultValue` fallback). */
  title?: string;
  group?: RouteGroup;
}

export function isRouteHandle(handle: unknown): handle is RouteHandle {
  return typeof handle === 'object' && handle !== null;
}

/** Merged handle of the current matches (deepest match overrides). Requires a data router. */
export function useRouteHandle(): RouteHandle {
  const matches = useMatches();
  let merged: RouteHandle = {};
  for (const m of matches) {
    if (isRouteHandle(m.handle)) merged = { ...merged, ...m.handle };
  }
  return merged;
}

export const APP_TITLE = 'FxBlox';

/** `document.title = "<screen> · FxBlox"` from the route handle. */
export function useDocumentTitle(): void {
  const { title } = useRouteHandle();
  const { t } = useTranslation();
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const screen = title ? t(title, { defaultValue: title }) : '';
    document.title = screen ? `${screen} · ${APP_TITLE}` : APP_TITLE;
  }, [title, t]);
}

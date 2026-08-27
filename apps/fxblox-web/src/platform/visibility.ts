/**
 * Visibility — the AppState replacement. "foreground" = `document.visibilityState === 'visible'`.
 */

export function isForeground(): boolean {
  if (typeof document === 'undefined') return true;
  return document.visibilityState !== 'hidden';
}

export function onVisibilityChange(cb: (visible: boolean) => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const handler = () => cb(document.visibilityState !== 'hidden');
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}

/** Fires when the tab becomes visible again (AppState 'active'). Also fires on bfcache restore (`pageshow`). */
export function onForeground(cb: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const onVis = () => {
    if (document.visibilityState !== 'hidden') cb();
  };
  const onShow = (e: PageTransitionEvent) => {
    if (e.persisted) cb();
  };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pageshow', onShow);
  return () => {
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pageshow', onShow);
  };
}

export const visibility = { isForeground, onVisibilityChange, onForeground };

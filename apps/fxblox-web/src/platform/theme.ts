/** Theme — `useColorScheme` (react-native) replacement over `prefers-color-scheme`. */
import { useEffect, useState } from 'react';

export type ColorScheme = 'light' | 'dark';

const QUERY = '(prefers-color-scheme: dark)';

export function getSystemColorScheme(): ColorScheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia(QUERY).matches ? 'dark' : 'light';
}

export function onSystemColorSchemeChange(cb: (scheme: ColorScheme) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const mql = window.matchMedia(QUERY);
  const handler = (e: MediaQueryListEvent) => cb(e.matches ? 'dark' : 'light');
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}

export function useSystemColorScheme(): ColorScheme {
  const [scheme, setScheme] = useState<ColorScheme>(getSystemColorScheme);
  useEffect(() => onSystemColorSchemeChange(setScheme), []);
  return scheme;
}

/** Mirror the resolved mode for the synchronous first-paint bootstrap in index.html. */
export function applyThemeToDocument(mode: ColorScheme, isAuto: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
  try {
    localStorage.setItem('fx.theme', isAuto ? 'auto' : mode);
  } catch {
    /* ignore */
  }
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = mode === 'dark' ? '#212529' : '#FFFFFF';
}

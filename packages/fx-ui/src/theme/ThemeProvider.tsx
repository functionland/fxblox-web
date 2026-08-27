import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import {
  colorsFor,
  darkColors,
  lightColors,
  type ColorMode,
  type ColorToken,
  type ThemeMode,
} from './tokens.js';

export interface FxThemeContextValue {
  /** The requested mode ('auto' follows prefers-color-scheme). */
  mode: ThemeMode;
  /** The mode actually applied to the DOM. */
  resolved: ColorMode;
  /** OS preference (from prefers-color-scheme). */
  systemScheme: ColorMode;
  /** Hex colors for `resolved` — for SVG / canvas / charts that cannot read CSS variables. */
  colors: Record<ColorToken, string>;
  isDark: boolean;
}

const FxThemeContext = createContext<FxThemeContextValue | null>(null);

export interface ThemeProviderProps {
  mode?: ThemeMode;
  /** Element receiving `data-theme` / `color-scheme` (default `document.documentElement`). */
  target?: HTMLElement | null;
  /** `<meta name="theme-color">` values (default: backgroundApp per mode). Only written when target is <html>. */
  themeColor?: Partial<Record<ColorMode, string>>;
  children?: ReactNode;
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** OS colour scheme from `prefers-color-scheme: dark` (browsers report light when there is no preference). */
export function useColorScheme(): ColorMode {
  const dark = useMediaQuery(DARK_QUERY);
  return dark ? 'dark' : 'light';
}

function applyToDom(target: HTMLElement, resolved: ColorMode, themeColor: string): void {
  target.dataset.theme = resolved;
  target.style.colorScheme = resolved;
  if (typeof document !== 'undefined' && target === document.documentElement) {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = themeColor;
  }
}

/**
 * Sets `data-theme="light|dark"` (+ `color-scheme`, `<meta theme-color>`) on `<html>` and exposes the
 * resolved palette through `useFxTheme()`. `mode="auto"` follows `prefers-color-scheme` live.
 * Radix / vaul portals attach to <body>, so they inherit `[data-theme]` automatically.
 */
export function ThemeProvider({ mode = 'auto', target, themeColor, children }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const resolved: ColorMode = mode === 'auto' ? systemScheme : mode;
  const metaColor = themeColor?.[resolved] ?? colorsFor(resolved).backgroundApp;

  useLayoutEffect(() => {
    const el = target ?? (typeof document !== 'undefined' ? document.documentElement : null);
    if (!el) return;
    applyToDom(el, resolved, metaColor);
  }, [resolved, target, metaColor]);

  const value = useMemo<FxThemeContextValue>(
    () => ({
      mode,
      resolved,
      systemScheme,
      colors: colorsFor(resolved),
      isDark: resolved === 'dark',
    }),
    [mode, resolved, systemScheme],
  );

  return <FxThemeContext.Provider value={value}>{children}</FxThemeContext.Provider>;
}

/**
 * Current theme. Works without a provider too (reads `<html data-theme>`, defaulting to dark) so
 * leaf components / tests never throw.
 */
export function useFxTheme(): FxThemeContextValue {
  const ctx = useContext(FxThemeContext);
  const systemScheme = useColorScheme();
  if (ctx) return ctx;
  const attr = typeof document !== 'undefined' ? document.documentElement.dataset.theme : undefined;
  const resolved: ColorMode = attr === 'light' ? 'light' : 'dark';
  return {
    mode: resolved,
    resolved,
    systemScheme,
    colors: resolved === 'dark' ? darkColors : lightColors,
    isDark: resolved === 'dark',
  };
}

export { FxThemeContext };

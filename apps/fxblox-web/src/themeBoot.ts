// Theme bootstrap before React mounts (mobile default is dark). Runs as a bundled module entry (referenced from
// index.html) because the CSP is `script-src 'self'` — an inline script would be blocked. The settings store
// persists `{isAuto, colorScheme}` in IndexedDB (async), so `startThemeSync` mirrors the resolved mode into
// localStorage['fx.theme'] for this synchronous first paint.
try {
  const raw = localStorage.getItem('fx.theme');
  let mode: 'light' | 'dark' = raw === 'light' || raw === 'dark' ? raw : 'dark';
  if (raw === 'auto') {
    mode = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
} catch {
  /* storage unavailable: keep the html[data-theme="dark"] default */
}

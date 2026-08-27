// Vitest setup: jsdom + fake IndexedDB + jest-dom matchers. Node's WebCrypto, ReadableStream, Response and
// TextDecoder are already present in this environment (probed 2026-08-27), so the SecureStore / SSE / LAN HTTP
// layers run against real primitives.
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// jsdom has no matchMedia; the settings store's system-color-scheme hook and the theme bootstrap read it.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  });
}

// jsdom has no navigator.storage; SecureStore's boot hook guards for it but keep the shape predictable.
if (typeof navigator !== 'undefined' && !('storage' in navigator)) {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { persist: async () => false, persisted: async () => false },
  });
}

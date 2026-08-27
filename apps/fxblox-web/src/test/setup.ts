// Vitest setup: jsdom + fake IndexedDB + jest-dom matchers. Node's WebCrypto, ReadableStream, Response and
// TextDecoder are already present in this environment (probed 2026-08-27), so the SecureStore / SSE / LAN HTTP
// layers run against real primitives.
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// RTL only registers its own afterEach(cleanup) when `afterEach` is a global (vitest `globals: true`); it is not
// here, so unmount rendered trees explicitly between tests.
afterEach(() => cleanup());

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

// react-router data routers call `new Request(url, { signal })` with jsdom's AbortSignal, which Node's undici
// Request rejects ("Expected signal to be an instance of AbortSignal"). The custom environment
// (src/test/env/jsdomNativeFetch.mjs) stashes Node's abort classes; bridge foreign signals to native ones here.
{
  const nodeAbort = (
    globalThis as {
      __nodeAbort?: { AbortController: typeof AbortController; AbortSignal: typeof AbortSignal };
    }
  ).__nodeAbort;
  if (nodeAbort && typeof Request !== 'undefined') {
    const NativeRequest = Request;
    const { AbortController: NodeAbortController, AbortSignal: NativeSignal } = nodeAbort;
    // (a plain function, not an `instanceof` in the condition: TS would narrow the jsdom signal to `never`)
    const isNativeSignal = (s: AbortSignal): boolean => s instanceof NativeSignal;
    class BridgedRequest extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        const foreign: AbortSignal | null | undefined = init?.signal;
        if (foreign && !isNativeSignal(foreign)) {
          const controller = new NodeAbortController();
          if (foreign.aborted) controller.abort(foreign.reason);
          else
            foreign.addEventListener('abort', () => controller.abort(foreign.reason), {
              once: true,
            });
          init = { ...init, signal: controller.signal };
        }
        super(input, init);
      }
    }
    globalThis.Request = BridgedRequest;
  }
}

// jsdom has no navigator.storage; SecureStore's boot hook guards for it but keep the shape predictable.
if (typeof navigator !== 'undefined' && !('storage' in navigator)) {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { persist: async () => false, persisted: async () => false },
  });
}

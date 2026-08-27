import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Unit tests run in jsdom with fake-indexeddb (see src/test/setup.ts). Node's WebCrypto (`crypto.subtle`),
// `ReadableStream`, `Response` and `TextDecoder` are available in this environment (verified), so the
// SecureStore, SSE and LAN HTTP layers are exercised against real primitives, not mocks.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // fula-sec-web's `exports` only lists `browser` and `node.require` targets; Vite's Node-side resolver used by
      // Vitest finds no matching condition for an ESM import. Point straight at the ESM build (the browser build
      // is what production uses too).
      '@functionland/fula-sec-web': fileURLToPath(
        new URL('../../node_modules/@functionland/fula-sec-web/lib/esm/index.js', import.meta.url),
      ),
      // The PWA register hook is a Vite virtual module; unit tests get a no-op.
      'virtual:pwa-register/react': fileURLToPath(
        new URL('./src/test/stubs/pwaRegister.ts', import.meta.url),
      ),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify('0.0.1-test'),
    __GIT_SHA__: JSON.stringify('test'),
    __BUILD_TIME__: JSON.stringify('1970-01-01T00:00:00.000Z'),
  },
  test: {
    // jsdom + Node's abort classes kept reachable (react-router data routers build `Request`s — see the file).
    environment: './src/test/env/jsdomNativeFetch.mjs',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: 15_000,
  },
});

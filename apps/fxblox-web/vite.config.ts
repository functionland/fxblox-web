import { defineConfig, type Rollup } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import svgr from 'vite-plugin-svgr';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Production is https://docs.fx.land/fxblox-web/ — the functionland GitHub Pages project site, served under
// the org's custom domain (functionland.github.io redirects there). That path prefix is why base is
// '/fxblox-web/'. blox.fx.land was the original intent but has no Pages DNS record, so it is not used.
// deploy.yml sets VITE_BASE from the PAGES_CNAME repo variable: setting that variable (and the matching DNS)
// is what would move the app to its own domain at base '/'.
const base = process.env.VITE_BASE ?? '/';

// Cloud / RPC / WalletConnect hosts the service worker must never cache (NetworkOnly). LAN / hotspot targets
// (`http://<private-ip>:3500|8083`) deliberately have NO runtime route at all: an unmatched request falls through
// to the browser natively, which keeps Chrome's Local Network Access permission semantics intact.
const NETWORK_ONLY_HOSTS =
  /(^|\.)(fula\.network|fx\.land|walletconnect\.(com|org)|web3modal\.org|reown\.com|skalenodes\.com|publicnode\.com|1rpc\.io|base\.org|githubusercontent\.com|delegated-ipfs\.dev|google\.com)$/;

/**
 * Chunking policy (plan: vendor-react / ethers / appkit / libp2p / crypto, with the heavy ones lazy).
 *
 * Rollup folds a module into a manual chunk when it is a dependency of that chunk, which — observed — dragged
 * `idb-keyval` (shared by our KV store and AppKit's storage driver) and `@coinbase/wallet-sdk` into eager chunks
 * and made the shell import the 3 MB AppKit chunk on first paint. So the policy is computed from the module
 * graph: modules statically reachable from the entry points are "eager" and are NEVER assigned to a lazy vendor
 * chunk (React-family eager modules → `vendor-react`, the rest stay with the entry); only lazy modules are split
 * into the named vendor chunks.
 */
let eagerModules: Set<string> | null = null;

function computeEager(api: Rollup.ManualChunkMeta): Set<string> {
  const seen = new Set<string>();
  const stack: string[] = [];
  for (const id of api.getModuleIds()) {
    if (api.getModuleInfo(id)?.isEntry) stack.push(id);
  }
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const dep of api.getModuleInfo(id)?.importedIds ?? []) stack.push(dep);
  }
  return seen;
}

function manualChunks(id: string, api: Rollup.ManualChunkMeta): string | undefined {
  if (!id.includes('node_modules')) return undefined;
  const nm = id.replace(/\\/g, '/');
  eagerModules ??= computeEager(api);
  if (eagerModules.has(id)) {
    return /\/node_modules\/(react|react-dom|react-router|scheduler|zustand|i18next|react-i18next|use-sync-external-store)\//.test(nm)
      ? 'vendor-react'
      : undefined;
  }
  // Lazy modules only from here on.
  // Node polyfill shims + `events`/`buffer` used by the lazy vendors: a leaf chunk (imports nothing back), otherwise
  // Rollup parks them in whichever dynamic-entry chunk needs them first and the vendor chunk imports it back.
  if (/\/node_modules\/(events|buffer|process|util|inherits|ieee754|base64-js|vite-plugin-node-polyfills)\//.test(nm)) return 'vendor-polyfills';
  if (/\/node_modules\/(ethers|@ethersproject)\//.test(nm)) return 'vendor-ethers';
  // AppKit + its whole dependency closure (the small helpers must be listed too: with `onlyExplicitManualChunks`
  // an unlisted package that sits between AppKit modules becomes a separate chunk that AppKit imports and that
  // imports AppKit back — a circular chunk).
  if (
    /\/node_modules\/(@reown|@walletconnect|viem|ox|lit|@lit|lit-html|lit-element|@coinbase|@base-org|@safe-global|@msgpack|@phosphor-icons|preact|valtio|proxy-compare|unstorage|destr|qrcode|dijkstrajs|encode-utf8|bs58|base-x|big\.js|blakejs|cross-fetch|dayjs|detect-browser|isows)\//.test(
      nm,
    )
  )
    return 'vendor-appkit';
  // libp2p + its closure (same reasoning as above).
  if (
    /\/node_modules\/(libp2p|@libp2p|@chainsafe|@multiformats|multiformats|it-[a-z-]+|uint8arrays|uint8arraylist|uint8-varint|p-defer|p-event|p-queue|p-retry|p-timeout|protons-runtime|@sindresorhus|abort-error|any-signal|datastore-core|interface-datastore|interface-store|eventemitter3|hashlru|is-loopback-addr|is-network-error|main-event|mortice|netmask|progress-events|race-event|race-signal|weald)\//.test(
      nm,
    )
  )
    return 'vendor-libp2p';
  if (/\/node_modules\/(@functionland\/fula-sec-web|@stablelib|did-jwt)\//.test(nm)) return 'vendor-crypto';
  // Elliptic-curve / hashing libs shared by ethers v5, fula-sec-web/did-jwt and AppKit get their own chunk so the
  // vendor chunks above do not import each other in a cycle.
  if (/\/node_modules\/(elliptic|bn\.js|hash\.js|js-sha3|hmac-drbg|minimalistic-[a-z-]+|brorand|@noble|@scure)\//.test(nm)) return 'vendor-ec';
  return undefined;
}

export default defineConfig({
  base,
  plugins: [
    {
      // The eager-module set used by `manualChunks` is memoised at module scope; in `vite build --watch`
      // the config module is not re-evaluated between rebuilds, so reset it per build.
      name: 'fxblox:reset-eager-chunk-cache',
      buildStart() {
        eagerModules = null;
      },
    },
    {
      // The CSP meta in index.html is `script-src 'self'` (no inline scripts). @vitejs/plugin-react injects an inline
      // React Refresh preamble in DEV ONLY, which that policy blocks and takes the whole dev server down with
      // "can't detect preamble". Relax script-src for the dev server; production HTML is untouched.
      name: 'fxblox:dev-csp-inline-scripts',
      transformIndexHtml: {
        order: 'post',
        handler(html, ctx) {
          if (!ctx.server) return html;
          return html.replace("script-src 'self' 'wasm-unsafe-eval'", "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'");
        },
      },
    },
    react(),
    tailwindcss(),
    svgr(),
    // @functionland/fula-sec-web (did-jwt, @stablelib) and ethers v5 expect Node globals in the browser.
    nodePolyfills({
      include: ['buffer', 'process', 'events', 'util', 'stream', 'crypto'],
      globals: { Buffer: true, process: true, global: true },
    }),
    VitePWA({
      registerType: 'prompt',
      // WS4 registers the worker via `useRegisterSW` (update toast); nothing auto-injected here.
      injectRegister: false,
      includeAssets: ['robots.txt', 'icons/icon.svg'],
      manifest: {
        name: 'FxBlox',
        short_name: 'FxBlox',
        description: 'Set up and manage your Blox from the browser.',
        theme_color: '#212529',
        background_color: '#212529',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,ttf,wasm,json,webmanifest}'],
        // The wallet needs the internet anyway; keep the 3 MB AppKit chunk out of the offline precache.
        globIgnores: ['**/vendor-appkit-*.js'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/\/version\.json$/],
        cleanupOutdatedCaches: true,
        // Never activate a new worker mid-session on its own (setup runs on an internet-less hotspot).
        skipWaiting: false,
        clientsClaim: false,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.protocol === 'https:' && NETWORK_ONLY_HOSTS.test(url.hostname),
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_SHA__: JSON.stringify((process.env.GITHUB_SHA ?? 'dev').slice(0, 7)),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks,
        // Rollup (< this flag) also pulls every unassigned static dependency of a manual chunk INTO that chunk
        // (`addStaticDependenciesToManualChunk`), which is what dragged the shared `idb-keyval` into vendor-appkit
        // and made the shell preload it. With the flag, manual chunks hold exactly the modules returned above and
        // shared modules are placed by the normal dependent-entry algorithm.
        onlyExplicitManualChunks: true,
      },
    },
  },
});

# FxBlox Web — build status

_Last updated 2026-08-27. Repo: `functionland/fxblox-web` (local `E:\GitHub\fxblox-web-app`)._

Per-workstream detail lives in the sibling `STATUS-*.md` files; this is the top-level picture.

## Where the port stands

| Workstream | State | Notes |
|---|---|---|
| WS1 `packages/fula-web-client` | **done** | js-libp2p browser client for the go-fula actions: identity parity with the mobile app, signed requests, HTTP/1.1 over a libp2p stream, discovery + dial with relay-limit handling. 58 tests incl. an end-to-end run against a js-libp2p fake Blox. |
| WS2 `packages/fx-ui` | **done** | Tokens from the mobile restyle theme on Tailwind v4 + Radix/vaul, all P0 + P1 components, generated icons, gallery entries. 57 tests. |
| WS3 app data / platform layer | **done** | Stores (IndexedDB persist + migrations), platform ports (secure store, LAN HTTP + Chrome LNA, Web Bluetooth, SSE, QR…), wallet (AppKit + ethers v5), contracts, i18n, PWA/build. |
| WS4 shells, routing, screens | **done** | Router + guards + deep-link stash, four shells, every screen in the plan's route table, i18n en/zh. |
| WS5 firmware / infra PRs | **open PRs** | go-fula #245 (vectors) + #246 (WAP CORS + Origin guard), blox-ai #6 (CORS + Origin guard), libp2p-relay #1 (relay addrs/certhash + preflight). |
| WS6 FxFiles-web hand-off | **open PR** | functionland/FxFiles #114 (`feat/blox-web-handoff`) — v1.1 fragment carrier. |
| WS7 harness + CI | **done locally** | `tools/fake-blox` (:3500 WAP, :8083 Blox AI, JSON-RPC), Playwright projects for desktop + Pixel. CI workflows exist but cannot run (see below). |

## Verification (all run locally, 2026-08-27)

| Check | Result |
|---|---|
| Unit tests | **876 passing** — app 757 (88 files), fula-web-client 62 (9), fx-ui 57 (11); app suite run twice, identical |
| Typecheck | clean (app `tsconfig` + `tsconfig.node` + `e2e/tsconfig`, both packages) |
| Lint | clean across the workspace |
| Production build | OK — 23.8 s, 125 precache entries, no circular chunks; eager JS ≈ 321 KB (AppKit/ethers/libp2p stay lazy) |
| E2E (Playwright, Chromium) | **86/86, twice in a row, 0 flaky** on `desktop-chromium` (1440×900) and `android-chrome` (Pixel 7), against `tools/fake-blox` |

**Not verified anywhere:** real hardware and real wallets. Web Bluetooth against the actual Blox GATT server, Chrome's Local Network Access prompt on the hotspot, MetaMask/WalletConnect signing, the libp2p path against the live relay, and the FxFiles round-trip are all still fake-backed. Those are the P0 spike gates (b)–(e) and the release checklist in the plan.

## What the integration run caught

1. **Navigation off the Blox dashboard was impossible** (`ddec5f0`, revised in `HEAD`). Clicking any tab changed the URL but the screen never swapped, permanently. `useTasksLogic` mirrored its task list into state from an effect whose dependency followed the caller's `navigateToPools`; `TasksCard` passed a new inline arrow every render, so the effect re-ran every render and `setState` allocated a fresh object each time. The loop rendered identical DOM — invisible in the UI, silent in a production build — but starved React's low-priority work, so route transitions never committed while discrete updates (e.g. the theme toggle) still worked.
   The first fix added a bail-out comparison to the effect. An advisor review caught that this **kept a stale `route` closure** whenever the comparison judged the list unchanged, so the hook now derives the list during render with `useMemo` and holds no task state at all — the loop is impossible by construction and the callbacks are always current. Both properties have regression tests.
2. **`/settings/chain` and `/settings/pools*` threw on direct load** — they call the AppKit hooks at their top level, but AppKit is intentionally excluded from the eager bundle. They now mount behind `WalletGate` via `lazyWalletScreen`, and `PoolsLayout` gates the master list it mounts itself. Because the wallet chunk is ~3.8 MB, the route renders the normal `SettingsScreen` chrome (title, back button, `data-screen`) immediately and gates only the content, instead of showing a blank page until the chunk lands — which is also what made these three routes fail intermittently under load.
3. **Three pre-existing test defects** (present at `a1b8570`, verified by stashing the fixes and re-running). `ConnectToBlox` drove `lanFetch` by call order, so the readiness poll and the explicit hotspot check raced for the same queued rejection; worse, the test asserted an error card that the screen deliberately clears the moment the background poll reports reachable. It now routes the mock by URL and gates readiness explicitly. A second test asserted the session-wide BLE write log equalled exactly one command while the next screen was already fetching properties over the same session. Both now pass 5/5 in isolation and the app suite runs identically twice.
4. **`NOT_INITIALIZED` was logged as a console error.** The protocol modules are verbatim ports of react-native-fula and log every rejection at `error`, but a screen routinely queries before `newClient()` finishes. The client's logger now treats `NOT_INITIALIZED` / `CLIENT_CLOSED` as caller preconditions and keeps them out of `console.error` while still recording them in the diagnostics ring buffer at their original level.

## Blocked / needs a person

- **GitHub Actions are disabled for the org** — jobs fail to start with "your account is locked due to a billing issue", so CI and the Pages deploy have never run. Everything above was verified locally instead. Fix billing (org Settings → Billing) and the existing workflows should work unchanged.
- **`blox.fx.land` DNS does not exist yet.** Add a Cloudflare `CNAME blox → functionland.github.io` (DNS-only), then set the repo variable `PAGES_CNAME=blox.fx.land`; `deploy.yml` flips the Vite base to `/` and emits the CNAME file. Until then deploys target `https://docs.fx.land/fxblox-web/` (the org Pages custom domain), which is already in every CORS allow-list.
- **Cloudflare WAF on `discovery.fula.network` must exempt `OPTIONS`** — a browser cannot attach `x-fula-client` to a preflight, so `/relays` and `/find-box` are unreadable from the app until that dashboard rule changes (libp2p-relay #1 documents it). The client already tolerates the failure and falls back.
- **Identity parity against real credentials**: derive in the browser with your real password + wallet signature and compare with the phone's *App PeerId*.

## Known gaps / follow-ups

- `PoolsLayout` renders a `WalletGate` around the master list it mounts itself while the child route is gated too. The gate is a module-level singleton so only one `initAppKit()` runs, but the nesting is redundant and worth collapsing.
- `WalletGate` keeps its state in module-level variables rather than a context, which is why tests need `_resetWalletGateForTests`. A context at the root would be less fragile.
- `ConnectToBlox` probes availability with a `properties` command and the next screen immediately fetches `properties` again over the same BLE session — one redundant round-trip per pairing.
- fx-ui's gallery avatar demo loads a remote image the production CSP blocks — use a local asset (the gallery is DEV-only, the CSP was not loosened).
- `vendor-appkit` is ~3.8 MB raw even though lazy; `enableCoinbase: false` is untested but likely trims it.
- The PWA manifest references `icon-192.png` / `icon-512.png`, which do not exist yet (only `icon.svg`).
- `font-src https://fonts.reown.com` in the CSP is unverified against a real wallet-connect flow.
- Blox AI's upload schema must accept `os: 'web'` (it currently enumerates `android|ios`).

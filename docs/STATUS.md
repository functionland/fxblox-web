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
| Unit tests | **871 passing** — app 756 (88 files), fula-web-client 58 (8), fx-ui 57 (11) |
| Typecheck | clean (app `tsconfig` + `tsconfig.node` + `e2e/tsconfig`, both packages) |
| Lint | clean across the workspace |
| Production build | OK — 40.9 s, 128 precache entries, no circular chunks; eager JS ≈ 321 KB (AppKit/ethers/libp2p stay lazy) |
| E2E (Playwright, Chromium) | **86/86** on `desktop-chromium` (1440×900) and `android-chrome` (Pixel 7), against `tools/fake-blox` |

**Not verified anywhere:** real hardware and real wallets. Web Bluetooth against the actual Blox GATT server, Chrome's Local Network Access prompt on the hotspot, MetaMask/WalletConnect signing, the libp2p path against the live relay, and the FxFiles round-trip are all still fake-backed. Those are the P0 spike gates (b)–(e) and the release checklist in the plan.

## Two real bugs the E2E run caught

1. **Navigation off the Blox dashboard was impossible** (commit `ddec5f0`). Clicking any tab changed the URL but the screen never swapped, permanently. `useTasksLogic`'s effect depended on the caller's `navigateToPools`; `TasksCard` passed a new inline arrow every render, so the effect re-ran every render and `setState` allocated a fresh object each time. The loop rendered identical DOM — invisible in the UI, silent in a production build (no dev warnings) — but starved React's low-priority work, so route transitions never committed while discrete updates (e.g. the theme toggle) still worked. Fixed at both ends (effect bails out when the tasks are unchanged; the call site memoises) with a regression test that fails on a re-render loop.
2. **`/settings/chain` and `/settings/pools*` threw on direct load** — they call the AppKit hooks at their top level, but AppKit is intentionally excluded from the eager bundle. They now mount behind `WalletGate` via `lazyWalletScreen`, and `PoolsLayout` gates the master list it mounts itself.

## Blocked / needs a person

- **GitHub Actions are disabled for the org** — jobs fail to start with "your account is locked due to a billing issue", so CI and the Pages deploy have never run. Everything above was verified locally instead. Fix billing (org Settings → Billing) and the existing workflows should work unchanged.
- **`blox.fx.land` DNS does not exist yet.** Add a Cloudflare `CNAME blox → functionland.github.io` (DNS-only), then set the repo variable `PAGES_CNAME=blox.fx.land`; `deploy.yml` flips the Vite base to `/` and emits the CNAME file. Until then deploys target `https://docs.fx.land/fxblox-web/` (the org Pages custom domain), which is already in every CORS allow-list.
- **Cloudflare WAF on `discovery.fula.network` must exempt `OPTIONS`** — a browser cannot attach `x-fula-client` to a preflight, so `/relays` and `/find-box` are unreadable from the app until that dashboard rule changes (libp2p-relay #1 documents it). The client already tolerates the failure and falls back.
- **Identity parity against real credentials**: derive in the browser with your real password + wallet signature and compare with the phone's *App PeerId*.

## Known gaps / follow-ups

- The E2E suite showed two cold-start flakes in one run (86/86 clean on the re-run); worth a startup-wait before it gates anything.
- fx-ui's gallery avatar demo loads a remote image the production CSP blocks — use a local asset (the gallery is DEV-only, the CSP was not loosened).
- `vendor-appkit` is ~3.8 MB raw even though lazy; `enableCoinbase: false` is untested but likely trims it.
- The PWA manifest references `icon-192.png` / `icon-512.png`, which do not exist yet (only `icon.svg`).
- `font-src https://fonts.reown.com` in the CSP is unverified against a real wallet-connect flow.
- Blox AI's upload schema must accept `os: 'web'` (it currently enumerates `android|ios`).

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
| Unit tests | **878 passing in one `npm test --workspaces` run** — app 759 (89 files), fula-web-client 62 (9), fx-ui 57 (11) |
| Typecheck | clean (app `tsconfig` + `tsconfig.node` + `e2e/tsconfig`, both packages) |
| Lint | clean across the workspace |
| Production build | OK — 24 s, 125 precache entries, no circular chunks; eager JS ≈ 321 KB (AppKit/ethers/libp2p stay lazy) |
| E2E (Playwright, Chromium) | **86/86 on three consecutive runs, 0 flaky** on `desktop-chromium` (1440×900) and `android-chrome` (Pixel 7), against `tools/fake-blox` |

**Not verified anywhere:** real hardware and real wallets. Web Bluetooth against the actual Blox GATT server, Chrome's Local Network Access prompt on the hotspot, MetaMask/WalletConnect signing, the libp2p path against the live relay, and the FxFiles round-trip are all still fake-backed. Those are the P0 spike gates (b)–(e) and the release checklist in the plan.

## What the integration run caught

1. **Navigation off the Blox dashboard was impossible** (`ddec5f0`, revised in `HEAD`). Clicking any tab changed the URL but the screen never swapped, permanently. `useTasksLogic` mirrored its task list into state from an effect whose dependency followed the caller's `navigateToPools`; `TasksCard` passed a new inline arrow every render, so the effect re-ran every render and `setState` allocated a fresh object each time. The loop rendered identical DOM — invisible in the UI, silent in a production build — but starved React's low-priority work, so route transitions never committed while discrete updates (e.g. the theme toggle) still worked.
   The first fix added a bail-out comparison to the effect. An advisor review caught that this **kept a stale `route` closure** whenever the comparison judged the list unchanged, so the hook now derives the list during render with `useMemo` and holds no task state at all — the loop is impossible by construction and the callbacks are always current. Both properties have regression tests.
2. **`/settings/chain` and `/settings/pools*` threw on direct load** — they call the AppKit hooks at their top level, but AppKit is intentionally excluded from the eager bundle. They now mount behind `WalletGate` via `lazyWalletScreen`, and `PoolsLayout` gates the master list it mounts itself. Because the wallet chunk is ~3.8 MB, the route renders the normal `SettingsScreen` chrome (title, back button, `data-screen`) immediately and gates only the content, instead of showing a blank page until the chunk lands — which is also what made these three routes fail intermittently under load.
3. **Three pre-existing test defects** (present at `a1b8570`, verified by stashing the fixes and re-running). `ConnectToBlox` drove `lanFetch` by call order, so the readiness poll and the explicit hotspot check raced for the same queued rejection; worse, the test asserted an error card that the screen deliberately clears the moment the background poll reports reachable. It now routes the mock by URL and gates readiness explicitly. A second test asserted the session-wide BLE write log equalled exactly one command while the next screen was already fetching properties over the same session. Both now pass 5/5 in isolation and the app suite runs identically twice.
4. **The E2E suite had no startup margin.** Under load (a build plus another full run back to back) `/blox` failed waiting for the app shell — the app gates rendering on IndexedDB hydration and then fetches the shell chunk, and a per-assertion timeout was racing that. `gotoPaired` now waits once for first paint, so no individual assertion carries the cold-start cost. Three consecutive full runs are clean under the same load.
5. **`SetupComplete` wrote state after unmounting** (found by CI, `4df89e3`). Its reachability probes — `isOnline`, `HEAD /properties`, `checkBloxConnection` — outlive a fast navigation away (the user can press Home or Reconnect while one is in flight) and every one wrote state unconditionally when it settled. In a browser that is a wasted render against an unmounted tree; under CI timings one landed after teardown and threw `ReferenceError: window is not defined` from React, failing a run in which all 759 tests passed. Every post-`await` write is now guarded by an `alive` ref.
6. **`NOT_INITIALIZED` was logged as a console error.** The protocol modules are verbatim ports of react-native-fula and log every rejection at `error`, but a screen routinely queries before `newClient()` finishes. The client's logger now treats `NOT_INITIALIZED` / `CLIENT_CLOSED` as caller preconditions and keeps them out of `console.error` while still recording them in the diagnostics ring buffer at their original level.

## CI/CD — live as of 2026-08-27

Org billing was fixed, so Actions run. On `4df89e3` all three workflows are green: **CI** (typecheck, lint, 878 tests, build), **E2E** (`e2e.yml`, Playwright 86/86 on a Linux runner), and **Deploy to GitHub Pages**.

**The app is live at <https://docs.fx.land/fxblox-web/>** — `version.json` reports the deployed commit, so you can always tell what is up.

CI paid for itself immediately, catching two things local runs did not:
- run `33110016966` failed on the `ConnectToBlox` poll race (fixed in `2233aca`) — a slower Linux runner reproduced the flake reliably;
- run `33117722750` failed with **all 759 tests passing**, because Vitest reports unhandled errors separately: an unmounted `SetupComplete` wrote state when a probe settled (fixed in `4df89e3`).

## Blocked / needs a person

- **`blox.fx.land` is not serving the app yet.** The DNS record exists but resolves to a Cloudflare proxy IP (172.64.80.1, orange cloud) and GitHub returns its own 404 because the repo has not claimed the domain. Three steps: (1) in Cloudflare set the record to **DNS only** (grey cloud) as `CNAME blox → functionland.github.io` — GitHub's certificate provisioning needs the proxy off; (2) set the repo's Pages custom domain to `blox.fx.land` and enable Enforce HTTPS; (3) set the repo variable `PAGES_CNAME=blox.fx.land`, which flips `deploy.yml` from the `/fxblox-web/` base to `/` and emits the CNAME file. Until then `https://docs.fx.land/fxblox-web/` is the live origin, and it is already in every CORS allow-list.
- **`discovery.fula.network` is blocked by Cloudflare for everything, not just `OPTIONS`** — correcting an earlier note in this file. Probed 2026-08-27: `GET`, `POST` and `OPTIONS`, on `/`, `/relays` and `/find-box`, with and without `Origin`, and with a browser user-agent, all return **403 with Cloudflare's "Sorry, you have been blocked" interstitial** (`Server-Timing: cfOrigin;dur=0` — the worker is never reached). So this is not a preflight-only problem and a CORS fix alone will not clear it. The rule that fired must be identified in **Security → Events** by Ray ID before writing an exemption; see the WAF section below. The `x-fula-client` preflight concern is still real (a browser cannot attach a custom header to a preflight; it only advertises it in `Access-Control-Request-Headers`), it just is not the whole story. The client tolerates the failure and falls back.
- **Identity parity against real credentials**: derive in the browser with your real password + wallet signature and compare with the phone's *App PeerId*.

## Cloudflare WAF — clearing `discovery.fula.network`

1. **Find what actually blocked it.** Cloudflare dashboard → the `fula.network` zone → **Security → Events**, filter on a blocked request (each 403 page prints a Ray ID). The "Service" column names the product — Custom rule, Managed ruleset, Rate limiting, or Bot Fight Mode. This matters because *the fix differs per product*, and a Skip rule cannot override free-tier Bot Fight Mode.
2. **If it is a custom or managed rule**, add a Skip rule and drag it to the **top** of the list — Security → WAF → Custom rules → Create rule, "Edit expression":

   ```
   (http.host eq "discovery.fula.network" and http.request.method eq "OPTIONS")
   or (http.host eq "discovery.fula.network" and http.request.uri.path in {"/relays" "/find-box"})
   ```

   Action **Skip**, and tick: All remaining custom rules · Rate limiting rules · Managed rules · Super Bot Fight Mode.
3. **If Security Events names Bot Fight Mode** (the free one), a Skip rule will not help — turn it off for this hostname, or upgrade to Super Bot Fight Mode, which Skip rules can bypass.
4. Re-probe afterwards:

   ```
   curl -i -X OPTIONS https://discovery.fula.network/relays \
     -H "Origin: https://blox.fx.land" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: content-type,x-fula-client"
   ```

   Expect `204` (or `200`) with `access-control-allow-origin` echoed back. Note the IP that probed from here (184.147.65.244) was blocked for *all* traffic to the zone, so also check Security Events for an IP-level block before assuming the rule expression is the only issue.

## Known gaps / follow-ups

- **Focus is dropped when the wallet chunk resolves.** The gate's chrome and the screen's own chrome are different elements in the same slot, so React unmounts one and mounts the other; a keyboard user who tabbed to Back while the chunk loaded lands back on `<body>`, and a screen reader may re-announce the heading. Removing it means hoisting the chrome out of the four screens into the route, which would cost their dynamic titles (`PoolDetails` titles on the loaded pool's name) — not worth it for a sub-second window, but it is a real a11y wart.
- `refreshTasks` on the Blox dashboard now only shows a spinner for a second: the task list re-derives itself from its inputs, so there is nothing to recompute. That matches mobile (its refresh also only re-read already-derived values), but the button is effectively decorative.
- Several async tests still assert on `mock.calls[0]`, which is the pattern that made the two `ConnectToBlox` tests racy. Worth a sweep before CI runs on shared runners.
- `PoolsLayout` renders a `WalletGate` around the master list it mounts itself while the child route is gated too. The gate is a module-level singleton so only one `initAppKit()` runs, but the nesting is redundant and worth collapsing.
- `WalletGate` keeps its state in module-level variables rather than a context, which is why tests need `_resetWalletGateForTests`. A context at the root would be less fragile.
- `ConnectToBlox` probes availability with a `properties` command and the next screen immediately fetches `properties` again over the same BLE session — one redundant round-trip per pairing.
- fx-ui's gallery avatar demo loads a remote image the production CSP blocks — use a local asset (the gallery is DEV-only, the CSP was not loosened).
- `vendor-appkit` is ~3.8 MB raw even though lazy; `enableCoinbase: false` is untested but likely trims it.
- The PWA manifest references `icon-192.png` / `icon-512.png`, which do not exist yet (only `icon.svg`).
- `font-src https://fonts.reown.com` in the CSP is unverified against a real wallet-connect flow.
- Blox AI's upload schema must accept `os: 'web'` (it currently enumerates `android|ios`).

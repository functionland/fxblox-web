# WS4 status — app shells, routing, guards, providers, stubs (`apps/fxblox-web`)

_Last updated 2026-08-27 (foundation session). No commits were made; everything is in the working tree. Scope was the WS4 **foundation** only — providers, router, guards, shells, layouts, stub screens, i18n composition, Vitest + Playwright scaffolding. **No real screens were implemented**: every screen in the route table is a stub that the three screen builders replace in place (see "Where to work")._

## Verification (exact results)

All commands run from `E:\GitHub\fxblox-web-app` (Windows, PowerShell) after the last edit.

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck -w apps/fxblox-web` | clean, exit 0 (`tsc` on `tsconfig.json`, `tsconfig.node.json` **and the new `e2e/tsconfig.json`**) |
| Unit tests | `npm test -w apps/fxblox-web` | **47 files, 587 tests, all passed** (`vitest run`, 26.7 s). WS3's 534 tests are untouched; 53 new tests (see "Tests"). The console noise in the run (`initFula cancelled…`, `Network check failed…`, `Failed to convert PeerID…`) is WS3's failure-path tests asserting on it. |
| Lint | `npm run lint` (workspace) | clean, exit 0 |
| Build | `npm run build -w apps/fxblox-web` | success (`✓ built in 45 s`, `precache 62 entries (3086 KiB)`, `postbuild: wrote 404.html and version.json`). Only the expected "chunks larger than 500 kB" notice for the lazy `vendor-appkit` (3.8 MB). |
| E2E smoke | `npx playwright test` from `apps/fxblox-web` (= `npm run e2e -w apps/fxblox-web`) | **86 passed, 0 failed** (1.2 min; 43 tests × 2 projects `desktop-chromium` 1440×900 + `android-chrome` Pixel 7). The webServer step builds the app and serves `dist` with `vite preview` (production HTML + CSP + service worker), and `e2e/global-setup.ts` starts `tools/fake-blox` (WAP :3500, AI :8083, RPC :8545). |
| Prettier | `npx prettier --check` on the new WS4 files | clean (the new files were formatted; pre-existing WS3 files such as `src/app/bootstrap.ts` were not touched) |

**Eager JS at first paint** (`dist/index.html`): `index-*.js` 336 KB + `vendor-react-*.js` 338 KB + two tiny helper chunks ≈ **675 KB raw** (WS3: 321 KB). The growth is the shell itself: react-router, the fx-ui components/icons and their Radix + vaul dependencies, the merged i18n JSON. The gallery is its own lazy chunk (210 KB); AppKit/ethers/libp2p/crypto stay lazy exactly as WS3 left them. See "Open items" for the follow-up.

## External review (standing advisor rule)

The routine panel was fired on the finished design (report-only, self-contained briefing of the guards, stash, `useConsumeOnce`, `back()`, AppShell/SetupShell a11y, the Vitest abort-signal bridge, the dev-CSP plugin and the PWA toast).

| Advisor | Outcome |
|---|---|
| **agy (Antigravity)** | **responded** — see below |
| Cursor (Composer 2.5) | no reply — `Authentication required. Please run 'agent login' first` |
| Kimi K2.7 (Cloudflare Workers AI) | no reply — HTTP 403 code 5035, model not on the Workers Free plan |
| GLM-5.2 (z.ai coding plan) | no reply — HTTP 429 on every attempt incl. a 50-token probe (usage window exhausted; `X-LOG-ID=20260827221423c6524d28214a4cee`) |
| MiMo v2.5 Pro (bynara) | no reply — HTTP 403 `telegram_required` (account must bind Telegram at bynara.id `/settings`) |

So only one model family reviewed the result; an uncorrelated second review (Codex / Cursor once their seats are fixed) is still worth running on `guards.tsx`, `deepLinkStash.ts` and the shells.

| agy item | Verdict | Change |
|---|---|---|
| `RequireSetup` wrote `sessionStorage` during render; use a loader `redirect()` or a layout effect | **adopted (layout effect)** — a loader would run before the RootGate boot on a direct load (predicate false → wrong redirect) and would not re-evaluate on store changes; `useLayoutEffect` runs before `<Navigate>`'s passive effect, so the SetupShell banner still sees the stash on its first render | `guards.tsx` |
| Stash can resurface much later in the same tab ("abandoned yesterday, redirected today") | **adopted** | entries carry `{ url, at }` and expire after `DEEP_LINK_STASH_TTL_MS` (60 min); test added |
| PWA update toast that auto-hides after 60 s can strand a user on a stale build | **adopted** | `autoHideDuration: 0` (persistent; swipe / Escape / close dismiss it) |
| `useConsumeOnce`: two consumers of different params race; derive the value from `searchParams` instead of a `useState` snapshot | **rejected with evidence** — the effect re-checks `has(name)` on every `searchParams` change, so competing strips converge; and deriving from `searchParams` would return `null` right after the strip, which is the value the screen needs to keep. Added a two-consumer convergence test (`useConsumeOnce.test.tsx`) | none |
| `RootGate`'s module flag double-boots under StrictMode | **not an issue** — `bootstrapDataLayer()` returns one cached promise (idempotent) | none |
| `history.state.idx` is a react-router internal | acknowledged; it is the documented-in-code behaviour of the data router since v6.4 and is covered by the smoke suite; revisit if a react-router upgrade changes it | none |
| Prefer `happy-dom` over the jsdom `Request` bridge | not adopted — not installed, and switching the environment for WS3's 534 tests is out of scope; the bridge is 20 lines and documented | none |
| A11y: duplicate `Primary` navs (one is `display:none`), the aria-label-only centre tab, skip link + `main` focus, footer portal tab order, `role="status"` banner | confirmed correct | none |
| Dev-only CSP `'unsafe-inline'` for the React Refresh preamble | confirmed reasonable | none |

## What exists (file map)

```
src/App.tsx                       browser gate (UnsupportedBrowser, ?unsupported=ignore) → <AppProviders><RouterProvider/>
src/main.tsx                      unchanged shape: styles + bootstrapDataLayer() + <App/>
src/app/
  providers.tsx                   ThemeProvider (useSettingsStore) › I18nextProvider › ToastProvider (+ToastBridge) › FxConfirmProvider › ErrorBoundary › [DebugBanner, children] › PwaUpdateToast
  ToastBridge.tsx                 platform/notify.setToastSink → fx-ui queueToast (replays buffered toasts)
  DebugBanner.tsx                 "Debug mode is enabled <id>" — click shares/copies debugMode.uniqueId
  PwaUpdateToast.tsx              useRegisterSW (virtual:pwa-register/react) → persistent "New version available — Reload" toast
  router.tsx                      createBrowserRouter(appRoutes, { basename: BASE_URL without trailing slash })
  routes/appRoutes.tsx            the tree: RootGate › [index redirect, /setup › SetupShell, RequireSetup › AppShell › main+settings, /gallery, *]
  routes/setupRoutes.tsx          manifest — SETUP screen builder edits this
  routes/mainRoutes.tsx           manifest — MAIN-TABS screen builder edits this (incl. the two deep-link routes)
  routes/settingsRoutes.tsx       manifest — SETTINGS screen builder edits this (SettingsLayout › PoolsLayout)
  routes/lazyScreen.ts            `lazy: lazyScreen(() => import('…'))` adapter for default-export screen modules
  guards.tsx                      RootGate (boot + spinner), IndexRedirect, RequireSetup (stash + redirect)
  setupState.ts                   isSetupComplete / useIsSetUp / readIsSetUp — the mobile predicate
  deepLinkStash.ts                stash/peek/consume/clear + useDeepLinkStash (sessionStorage, TTL 60 min)
  paths.ts                        typed builders + ROUTE_NAME_TO_PATH (every mobile Routes value) + ROUTE_PATTERNS + slugify
  routeHandle.ts                  RouteHandle {progress,title,group}, useRouteHandle, useDocumentTitle
  useRouteFocus.ts                focus <main tabindex=-1> + scroll top on pathname change (not on first load)
  unsupportedOverride.ts          ?unsupported=ignore → sessionStorage flag (E2E escape hatch)
  RouteError.tsx                  errorElement: 404 → NotFound, else ErrorFallback + Reload / Go home
  shells/AppShell.tsx             <900px header slot + main + BottomTabs; ≥900 grid rail/sidebar + TopBar; ProfileSheet; #fx-overlays
  shells/Sidebar.tsx, TopBar.tsx, BottomTabs.tsx, MobileHeader.tsx, ShellActions.tsx, ColorModeToggle.tsx, tabs.ts
  shells/SetupShell.tsx           max-w-[560px], FxProgressBar from handle.progress, LanguageSelector, Back to app, deep-link banner, SetupFooter portal, Version
  shells/SettingsLayout.tsx       ≥900px master (SettingsMenu) + detail (Outlet); phone: Outlet only
  shells/PoolsLayout.tsx          ≥1280px master (Pools list) + detail; below: Outlet only
src/navigation/routes.ts          the mobile `Routes` enum, verbatim
src/hooks/useAppNavigate.ts       { navigate, back(fallback), canGoBack }
src/hooks/useConsumeOnce.ts       read a search param once, strip it (replace)
src/components/
  Version.tsx                     "App version <v> #<sha>" (env.APP_VERSION / env.GIT_SHA)
  UnsupportedBrowser.tsx          the Chromium-only gate copy (moved out of App.tsx, i18n'd)
  LanguageSelector.tsx            Radix DropdownMenu (menuitemradio), EN / 中
  CurrentBloxIndicator.tsx        port over stores + FxStatusDot (+ truncatePeerId)
  ErrorBoundary.tsx               class boundary + ErrorFallback + withErrorBoundary
  FullScreenSpinner.tsx           RootGate / hydrate fallback / Suspense fallback
  ProfileSheet.tsx                FxSheet (desktop side panel) mount point — content is a stub
src/screens/StubScreen.tsx        StubScreen (FxPageHeader + FxEmptyState + echoed params) and SetupStubScreen (title + footer Back/Continue)
src/screens/Settings/SettingsMenu.tsx  mobile items/details as NavLinks + Log out (confirm destructive → logout() → /setup/welcome) + Version
src/i18n/resources.ts             translation.json + {shell,setup,main,settings}.json deep-merged per language
src/i18n/locales/{en,zh}/{shell,setup,main,settings}.json
src/test/env/jsdomNativeFetch.mjs Vitest environment (jsdom + Node abort classes), src/test/stubs/pwaRegister.ts, src/test/helpers/renderWithProviders.tsx
e2e/                               playwright.config.ts (app root), global-setup.ts, fixtures/{index,seed,fakeBlox}.ts, smoke.spec.ts, tsconfig.json
```

## Where to work — route → stub file → manifest

Every stub is a **default-export component module** at the path below; replace the file in place and keep the default export. The manifest entry (`handle`, path) is already there — edit it only if the route contract changes.

### Setup group — `src/app/routes/setupRoutes.tsx` (children of `/setup`, rendered inside `SetupShell`)

| URL | Stub file | `handle.progress` |
|---|---|---|
| `/setup/welcome` | `src/screens/InitialSetup/Welcome.tsx` | 0 (bar hidden) |
| `/setup/requirements` | `src/screens/InitialSetup/Requirements.tsx` | 20 |
| `/setup/link-password` | `src/screens/InitialSetup/LinkPassword.tsx` | 20 |
| `/setup/connect-blox` | `src/screens/InitialSetup/ConnectToBlox.tsx` | 40 |
| `/setup/connect-existing` | `src/screens/InitialSetup/ConnectToExistingBlox.tsx` | 40 |
| `/setup/set-authorizer?manual&ip&port&peerId` | `src/screens/InitialSetup/SetBloxAuthorizer.tsx` | 60 |
| `/setup/connect-wifi` | `src/screens/InitialSetup/ConnectToWifi/ConnectToWifi.tsx` | 80 |
| `/setup/check-connection?ssid` | `src/screens/InitialSetup/CheckConnection.tsx` | 90 |
| `/setup/complete?manual` | `src/screens/InitialSetup/SetupComplete.tsx` | 100 |
| `/setup/bluetooth` | `src/screens/Settings/Bluetooth/BluetoothCommands.tsx` (shared with settings) | 40 |

Progress values come from `features/setup/setupMachine.STEP_PROGRESS` (WS3). The setup stubs walk the happy path end-to-end through the footer (`Welcome → … → SetupComplete → Home`); **SetupComplete "Home" is the deep-link consumption point** (`consumeDeepLinkStash() ?? '/blox'`, `navigate(…, { replace: true })`) — keep that when replacing the stub (and ConnectToExistingBlox "Add selected" per the plan).

### Main-tabs group — `src/app/routes/mainRoutes.tsx` (under `RequireSetup` › `AppShell`)

| URL | Stub file |
|---|---|
| `/blox` | `src/screens/Blox/Blox.tsx` |
| `/blox/manage` | `src/screens/BloxManager/BloxManager.tsx` |
| `/users` | `src/screens/Users/Users.tsx` |
| `/plugins` | `src/screens/Plugins/PluginCatalogue.tsx` |
| `/plugins/:name` | `src/screens/Plugins/PluginDetail.tsx` |
| `/blox-ai?scenario=` | `src/screens/Diagnostics/Diagnostics.tsx` (already calls `useConsumeOnce('scenario')`) |
| `/devices` | `src/screens/Devices/Devices.tsx` |
| `/connectdapp/:appName/:bundleId/:peerId/:returnDeepLink/:accountId` (deep link) | `src/screens/Settings/ConnectedDApps/ConnectedDApps.tsx` |
| `/autopin-pair?token&endpoint&returnUrl` (deep link) | `src/screens/Settings/AutoPinPairing/AutoPinPairing.tsx` |

### Settings group — `src/app/routes/settingsRoutes.tsx` (`/settings` › `SettingsLayout` › `PoolsLayout`)

| URL | Stub file |
|---|---|
| `/settings` (index) | `src/screens/Settings/Settings.tsx` — phone: `FxPageHeader` + `SettingsMenu`; desktop: "choose a setting" placeholder (the layout shows the menu) |
| `/settings/blox-status-monitor` | `src/screens/Settings/BloxStatusMonitor.tsx` |
| `/settings/mode` | `src/screens/Settings/Mode.tsx` |
| `/settings/chain` | `src/screens/Settings/ChainSelection.tsx` |
| `/settings/pools` (index) | `src/screens/Settings/Pools/Pools.tsx` — also the master column of `PoolsLayout` at ≥1280px |
| `/settings/pools/:poolId` | `src/screens/Settings/Pools/PoolDetails.tsx` |
| `/settings/pools/:poolId/join-requests` | `src/screens/Settings/Pools/JoinRequests.tsx` |
| `/settings/dapps` | `src/screens/Settings/ConnectedDApps/ConnectedDApps.tsx` |
| `/settings/autopin` | `src/screens/Settings/AutoPinPairing/AutoPinPairing.tsx` |
| `/settings/bluetooth` | `src/screens/Settings/Bluetooth/BluetoothCommands.tsx` |
| `/settings/logs` (only with `VITE_ENABLE_BLOX_LOGS`) | `src/screens/Settings/BloxLogs.tsx` |
| `/settings/about` | `src/screens/Settings/About.tsx` |
| `/settings/blox-discovery` | redirect → `/setup/connect-existing` (no screen) |

Other: `/gallery`, `/gallery/:id` → `src/screens/Gallery/Gallery.tsx` (DEV / `VITE_ENABLE_GALLERY`); `*` → `src/screens/NotFound.tsx`. The settings **menu** (items, detail strings, Log out, Version) is `src/screens/Settings/SettingsMenu.tsx` (`useSettingsMenuItems()` exported for reuse).

## Contracts available to screen builders

- **Paths** — `import { paths, ROUTE_NAME_TO_PATH, ROUTE_PATTERNS } from '@/app/paths'`: `paths.settings.pool(id)`, `paths.setup.setAuthorizer({ manual, ip, port, peerId })`, `paths.bloxAi({ scenario })`, `paths.connectDApp({...})`, `paths.autopinPair({...})`, … `pathForRoute(Routes.Pools)` for logic still speaking mobile route names.
- **Navigation** — `const { navigate, back, canGoBack } = useAppNavigate()`; `back(fallback)` pops in-app history or replaces with `fallback` (direct loads). `useConsumeOnce('scenario')` for one-shot params.
- **Route handle** — `handle: { progress?, title?, group? }` (`src/app/routeHandle.ts`); `title` is an i18n key (falls back to the literal) → `document.title = "<title> · FxBlox"`.
- **SetupShell** — `<SetupFooter>…</SetupFooter>` portals a step's primary actions into the sticky footer; `SETUP_COLUMN` class for the 560 px column; the deep-link banner and "Back to app" are automatic. Deep link: `peekDeepLinkStash()` to read, `consumeDeepLinkStash()` **only** at "Home" / "Add selected".
- **AppShell** — `const { openProfile, closeProfile } = useAppShell()`; `<AppShellHeader>…</AppShellHeader>` replaces the phone header (portal) while mounted — desktop keeps the TopBar; `#fx-overlays` is a mount point for global overlays; the shell already focuses `<main>` on route change and manages the document title.
- **Providers** — `useToast()` / `useConfirm()` from `@functionland/fx-ui` (mounted above the router); data-layer code keeps calling `platform/notify.toast()` (bridged). `ErrorBoundary`/`ErrorFallback` from `@/components/ErrorBoundary`.
- **Shared components** — `Version`, `LanguageSelector`, `CurrentBloxIndicator`, `FullScreenSpinner`, `ProfileSheet`, `StubScreen`/`SetupStubScreen` (use the latter two for anything you have not ported yet).
- **State predicate** — `useIsSetUp()` / `readIsSetUp()` (`@/app/setupState`).
- **i18n** — add your strings to `src/i18n/locales/{en,zh}/{setup,main,settings}.json` (they merge into the `translation` namespace; `zh` falls back to `en`). `shell.json` holds nav/shell/confirm strings; `settings.json` the menu/logout strings.
- **Testing** — `renderWithProviders` / `TestProviders` (`src/test/helpers/renderWithProviders.tsx`); render routes with `createMemoryRouter(buildAppRoutes({ gallery, bloxLogs }), { initialEntries })` and mock `@/app/bootstrap` as in `src/app/__tests__/guards.test.tsx`. E2E: `import { test, expect, gotoPaired } from './fixtures'` — `gotoPaired(page, path)` seeds a paired session through IndexedDB (`fixtures/seed.ts`, editable seed), `consoleCapture` collects app console errors (network/CORS failures are annotations, not failures).

## Tests added (53)

`src/app/__tests__/paths.test.ts` (every `Routes` value mapped; dead routes exactly Hub/HubTab/Plugin; live paths absolute and served by the manifests — `matchRoutes` against `buildAppRoutes`, not the catch-all; builders/queries), `deepLinkStash.test.ts` (accept/reject, peek vs consume, corrupt values, TTL), `guards.test.tsx` (not booted → spinner; booted + no bloxs → `/setup/welcome`; set up → `/blox` in the AppShell; guarded route renders; deep link while not set up → stashed + redirected, survives setup navigation, cleared only by `consumeDeepLinkStash()`; connectdapp stashed; non-deep-link not stashed; setup never guarded + "Back to app"; blox-discovery redirect; NotFound), `src/hooks/__tests__/useConsumeOnce.test.tsx` (read once + strip, two consumers converge, absent), `src/app/shells/__tests__/navigation.test.tsx` (BottomTabs and Sidebar: six items in mobile order with accessible names, `aria-current="page"` at 9 routes incl. nested ones, none on setup routes), `SetupShell.test.tsx` (progress from the handle incl. hidden at 0, footer portal, language + version, Back to app, deep-link banner), `src/i18n/__tests__/resources.test.ts` (group files merged for en + zh, keys resolve).

E2E `e2e/smoke.spec.ts` (43 × 2 projects): every setup route loads in the SetupShell; progress bar follows the handle; the stub flow walks Welcome → Requirements through the footer; `/` and app routes redirect when unpaired (no stash); a deep link is stashed and the banner shows and survives navigation inside setup; NotFound; every app route (incl. `/settings/logs`, the two deep links, direct deep-load of `/settings/pools/1` echoing the id) loads in the AppShell with the Tailwind tripwire (`bg-background-app` computed = `rgb(33,37,41)`) and the responsive assertions (desktop: sidebar + top bar visible, tabs + mobile header hidden; Pixel 7: the inverse); primary navigation sets `aria-current` and moves focus to `main`; `?scenario` consumed once; blox-discovery redirect; `/gallery`.

## Deviations from the plan (and why)

1. **`Routes.BluetoothCommands` → `/settings/bluetooth`** (mobile opened it inside the InitialSetup stack). The Settings menu keeps the AppShell; `/setup/bluetooth` exists too (same module) for the ConnectToBlox flow.
2. **PoolsLayout splits at `wide` (≥1280px), not `desktop`**: between 900 and 1279px the Settings menu already takes 300px and a third column would leave the pool detail under 400px; there the pool routes are separate pages.
3. **`*` renders a NotFound page with a "Go home" button** instead of redirecting to `/` (no surprise redirects; the page is reachable and announced). 404 route errors use the same page.
4. **Deep-link stash entries expire after 60 min** (advisor item); the payload is `{ url, at }` JSON, not the bare URL.
5. **`RootGate` waits on `bootstrapDataLayer()`** (which itself awaits the three stores' `_hasHydrated` plus credentials/persistence) rather than subscribing to `_hasHydrated` directly — one gate, one promise, mockable in tests; a boot failure logs and continues (the app renders with defaults instead of hanging).
6. **Theme mirror**: the resolved mode / `'auto'` is written to `localStorage['fx.theme']` by WS3's `startThemeSync()` (called from the bootstrap); the providers do not write it a second time (they would flap between `'auto'` and the resolved value). `themeBoot.ts` resolves `'auto'` at first paint.
7. **Dev-only CSP relaxation** (`vite.config.ts` plugin `fxblox:dev-csp-inline-scripts`): `@vitejs/plugin-react` injects an inline React Refresh preamble that the production `script-src 'self'` blocks, taking the whole dev server down ("can't detect preamble"). `'unsafe-inline'` is added to the CSP meta only when `transformIndexHtml` runs under the dev server; `vite build` output is unchanged (the E2E suite runs against the production HTML).
8. **Vitest environment** is now `./src/test/env/jsdomNativeFetch.mjs` (jsdom + Node's abort classes kept reachable) and `src/test/setup.ts` bridges jsdom `AbortSignal`s into Node's `Request` — react-router data routers build `new Request(url, { signal })` on every navigation and undici rejects jsdom signals. `setup.ts` also registers `afterEach(cleanup)` for React Testing Library (Vitest runs without `globals`, so RTL's own hook never registered — WS3 had no component tests).
9. **`virtual:pwa-register/react`** is aliased to `src/test/stubs/pwaRegister.ts` in `vitest.config.ts`; `AppProviders` has a `pwa={false}` prop for hosts without the plugin.
10. **`@radix-ui/react-dropdown-menu` added to `apps/fxblox-web/package.json`** (`^2.1.24`, already installed at the workspace root via fx-ui — no install needed) for the LanguageSelector; fx-ui's `FxDropdown` is a Select (form control), the language switcher wants menu semantics.
11. **The Playwright "no console errors" assertion classifies browser resource failures as annotations**, not failures: `refreshRelayCache` hits `https://discovery.fula.network/relays` at boot and the discovery worker does not allow this origin (CORS block on every page — WS1/WS5 item), and fx-ui's gallery avatar demo loads `https://avatars.githubusercontent.com/…`, which the production CSP `img-src` blocks (allow-listed for the `/gallery` test only; the CSP was **not** loosened).
12. **`typecheck` now also runs `tsc -p e2e/tsconfig.json`** so the Playwright files are type-checked (they are outside `tsconfig.json`'s `include`).

## Open items

1. **Advisor coverage**: only agy (Google family) reviewed the result; Cursor (login), Kimi K2.7 (plan-gated), GLM-5.2 (429), MiMo (Telegram binding) all failed for account reasons — same as the WS2/WS3 sessions. Run an uncorrelated second review when a seat is fixed.
2. **Eager bundle grew to ≈675 KB raw** (shell + fx-ui + Radix/vaul + react-router + merged i18n JSON). Candidates once real screens land: split `zh` resources behind `import()`, keep fx-ui's P1 components out of the barrel used by the shell, check that the WS3 `manualChunks` policy still keeps the heavy vendors lazy (it does today).
3. **Discovery CORS**: every page logs a blocked `https://discovery.fula.network/relays` fetch (boot `refreshRelayCache`). Not a shell bug; needs the WS5 worker change (or the retry-without-header path to succeed).
4. **fx-ui gallery avatar asset** violates `img-src` — replace the remote GitHub avatar in `packages/fx-ui/src/gallery/entries.tsx` with a local/data: asset (WS2).
5. **ProfileSheet content**, the header slot consumers and the real screens are for the D–F builders; the `AppShellHeader` API (portal + presence counter) is in place.
6. **`history.state.idx`** (react-router data-router internal) backs `back()`; covered by the smoke test — re-check on a react-router major.
7. **Real-browser items from WS3 stay open** (Web Bluetooth, LNA, AppKit under CSP). The PWA update prompt path is wired but untested against a real second deploy (the smoke run only registers the worker).
8. **`docs/STATUS-app-data-layer.md` still says `src/App.tsx` is the hello shell** — superseded by this document.

## Pre-mortem (assume it failed)

| Failure | Tripwire | Mitigation |
|---|---|---|
| A screen builder registers a route in the wrong manifest / forgets the handle | `paths.test.ts` "every live path is served by the router manifests" + the smoke suite iterate the route table | keep `ROUTE_NAME_TO_PATH` and the manifests in sync; add the route to `e2e/smoke.spec.ts` |
| Deep-link stash consumed twice or never | guards test + smoke "stash survives navigation inside setup" | only `consumeDeepLinkStash()` clears it; call it exactly at SetupComplete "Home" / "Add selected" |
| Tailwind stops scanning app classes (CSS entry moved) | smoke tripwire `bg-background-app` computed colour + responsive visibility assertions | fx-ui `@source "../"`; add `@source` in the app CSS if the entry moves |
| Production CSP blocks something a screen needs (fonts, images, RPC hosts) | smoke "no console errors" runs against `vite preview` (real CSP) | extend `index.html` CSP deliberately; never `'unsafe-inline'` scripts in prod |
| Hydration never completes → spinner forever | `bootstrapDataLayer` has the 10 s `waitForHydration` cap and `rehydrateHandler` marks stores hydrated on failure; RootGate continues on boot rejection | keep the cap; surface persistent failures via the debug banner log |
| Radix/vaul overlay breaks at the 899↔900 px boundary | WS2 open item; `ProfileSheet` uses `desktopMode="side"` | manual check once the profile content lands |
| `vite dev` fails under the CSP after a plugin change | `npm run dev` + open `/` (the dev-only CSP plugin must keep matching the `script-src` string in `index.html`) | the plugin replaces the exact directive; update both together |

## Files touched outside `src/`

`apps/fxblox-web/{package.json (deps + e2e scripts + typecheck), vite.config.ts (dev-CSP plugin), vitest.config.ts (environment + PWA alias), playwright.config.ts (new), e2e/** (new)}`, `apps/fxblox-web/src/vite-env.d.ts` (`vite-plugin-pwa/react` types), this file. `dist/` was rebuilt by the verification runs (ignored by git).

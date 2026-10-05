# WS4-S3 status — Settings screens (`apps/fxblox-web`)

_Last updated 2026-08-27 (settings screen-group session). No commits, no `npm install`; everything is in the working tree. Scope: the **S3 settings group** — every stub under `src/screens/Settings/**` except `Bluetooth/**` (S1) and the foundation `SettingsMenu.tsx` (one entry added), the shared `src/components/settings/**`, `src/i18n/locales/{en,zh}/settings.json`, tests, this file. S1 (setup) and S2 (main tabs) were building in parallel; their in-progress files are visible in the verification numbers below and are called out as such._

## Verification (exact results, after the last edit)

All commands from `E:\GitHub\fxblox-web-app` (Windows, PowerShell; `bash` cannot fork on this host).

| Check | Command | Result |
|---|---|---|
| Settings tests | `npx vitest run src/screens/Settings src/components/settings` (from `apps/fxblox-web`) | **13 files / 54 tests passed** (mine). The 14th file in that folder, `src/screens/Settings/Bluetooth/__tests__/BluetoothCommands.test.tsx`, is **S1's** (1 of its 4 tests fails — `ble-connect` test id missing — while S1 is still working). |
| Full app suite | `npm test -w apps/fxblox-web` | 87 files / 754 tests: **738 passed, 16 failed in 9 files** — all outside my ownership: `Diagnostics`, `PluginDetail`, `probeDiscoveryAndListRelays`, `WalletGate` (S2); `LinkPassword`, `SetupComplete`, `setup flow navigation order`, `BluetoothCommands` (S1); and `src/app/__tests__/guards.test.tsx` (foundation; 5 cases assert on the stub copy — `Welcome — coming soon`, `Blox — coming soon`, `Link password — coming soon` — that S1/S2 replaced, and one on **my** route, see "Integrator items" #1). Duration 69.6 s. |
| Typecheck | `npm run typecheck -w apps/fxblox-web` | **0 errors in my files.** 4 errors remain, all in S1/S2 test files: `src/components/__tests__/ConnectionOptionsSheet.test.tsx(74)`, `src/screens/Devices/__tests__/Devices.test.tsx(21, 44)`, `src/screens/Diagnostics/__tests__/Diagnostics.test.tsx(109)`. |
| Lint | `npm run lint` (workspace `eslint .`) | **clean, exit 0** |
| Prettier | `npx prettier --check` on `src/screens/Settings/**` (minus `Bluetooth/`), `src/components/settings/**`, `locales/*/settings.json` | **all formatted** |
| Build / Playwright | not run (integrator) | — |

`npm run dev` was not started (another builder may hold the port); no real-browser check was done in this session — see "Open items".

## External review (standing advisor rule)

The routine panel was fired on the finished design (report-only, self-contained briefing of the six decisions below).

| Advisor | Outcome |
|---|---|
| **agy (Antigravity)** | **responded** — table below |
| Cursor (Composer 2.5) | no reply — `Authentication required. Please run 'agent login' first` |
| Codex | no reply — HTTP 402 `deactivated_workspace` on every request (model now reports as `gpt-5.6-sol`; agent def says 5.5) |
| Kimi K2.7 (Cloudflare Workers AI) | no reply — HTTP 403 code 5035, model not on the Workers Free plan (the CLAUDE.md "free" note is stale) |
| GLM-5.2 (z.ai coding plan) | no reply — HTTP 429 / error 1113 "Insufficient balance or no resource package", even on a 50-token probe |
| MiMo v2.5 Pro (bynara) | no reply — HTTP 403 `telegram_required` |

So, as in the WS2/WS3/foundation sessions, only one model family reviewed the result. An uncorrelated second review of `PoolCard.tsx`, `autopinParams.ts` and `AutoPinPairing.tsx` is still worth running once a seat is fixed.

| agy item | Verdict | Change |
|---|---|---|
| Pool join: the wallet→manual-signature account fallback is a regression on the **contract** (PC) path — a contract join needs a wallet provider to sign and pay gas | **adopted** | `PoolCard`: `account = isPC ? walletAccount : accountWithFallback` — contract joins are wallet-only (mobile rule); join-server joins keep the manual-signature address, as `usePoolsWithFallback.joinPoolViaAPI` already does |
| Join state machine: Cancel during an in-flight step lets the orphaned promise write "complete" later; a second attempt can race it | **adopted** | `PoolCard`: monotonic `attemptRef`; `beginAttempt()` returns `stale()`/`end()`; after every `await` a stale attempt returns without persisting or toasting; Cancel bumps the counter; the 120 s timeout and `end()` are no-ops for stale attempts. (Concurrent libp2p calls remain possible if the user re-joins during a cancelled attempt — same as mobile.) |
| Leave/cancel are contract-only, so a join-server user without a funded wallet cannot leave | **not changed** — plan decision (PM11 / open item §7-6: the join server has no `/leave`, `/cancel`); the `contractReady` guard already toasts "Contract Not Ready — connect your wallet" (mobile copy). Recorded under "Open items" | none |
| Bearer token in the sessionStorage deep-link stash for up to 60 min | acknowledged — foundation file; see "Integrator items" #3 | none |
| Success toast rigidly queued behind the 3 s "Leaving Pool" info toast | kept (mobile order); noted as a nice-to-have | none |
| Auto-pin: `location.assign` in the confirm-button promise continuation is within Chrome's transient user activation; fragment carrier + `navigate(replace)` strip is correct; ChainSelection stale closure is a bug fix; ConnectedDApps second decode + `switchToBlox` correct | confirmed | none |

## What exists (file map)

```
src/screens/Settings/
  Settings.tsx                       (foundation index — unchanged)
  SettingsMenu.tsx                   (foundation — + "Connected dApps" entry → /settings/dapps)
  BloxStatusMonitor.tsx              3 interval radios → useSettingsStore.bloxStatusCheckInterval (drives services/bloxStatusMonitor);
                                     web copy "only while this tab is open"; last-run line + "Check now"
  Mode.tsx                           light/dark previews (mode_light/dark.png), Automatic dark mode, language EN/中文, Debug mode,
                                     web-only "Prefer Bluetooth" (preferBluetooth)
  ChainSelection.tsx                 SKALE/Base radios (no code gate; each switch runs services/chainSwitchGuard first),
                                     connect/disconnect wallet, compact WalletNotification (switch network), manual wallet address editor
  About.tsx                          privacy text, terms link, Version, navigator.storage.persisted() note (persisted / notPersisted / unknown)
  BloxLogs.tsx                       (VITE_ENABLE_BLOX_LOGS) container FxDropdown (+ active plugins), tail count, "Other" free text,
                                     FxCodeBlock, refresh; fxblox.fetchContainerLogs gated on fulaIsReady
  Pools/Pools.tsx                    list (also the PoolsLayout master column ≥1280px): network status, CurrentBloxIndicator, search,
                                     FxHeader (Refresh + list/grid), skeletons, PoolCard per pool, error state + Retry, selected ring
  Pools/PoolDetails.tsx              rows, members (contract → RPC participants fallback), Join (join server), Leave (destructive,
                                     contract, chain + gas note), Force Rejoin, Join Requests link, Refresh
  Pools/JoinRequests.tsx             access gate, placeholder list, vote (voteJoinRequest(poolId, requestPeerId, clusterPeerId, approve))
  ConnectedDApps/ConnectedDApps.tsx  list + FxHeader toggle/add, deep-link prefill via useParams(), authorize → alert → "Open {app}" (assign)
  ConnectedDApps/AddDAppSheet.tsx    FxSheet: Blox FxDropdown (switchToBlox) + 4 inputs, fulaIsReady gate
  ConnectedDApps/DAppSettingsSheet.tsx  logo/title/tag, "{name} settings" → alert "Coming soon", RowDetails, Clear → ClearDAppSheet, Done
  ConnectedDApps/ClearDAppSheet.tsx  title/message, Cancel + Confirm (useFxSheet().close())
  ConnectedDApps/DAppCard.tsx        DAppCard + DAppHeader + RowDetails
  AutoPinPairing/AutoPinPairing.tsx  deep-link mode (/autopin-pair) + manual mode (/settings/autopin), QR dialog
  AutoPinPairing/autopinParams.ts    parseAutoPinParams (fragment → query), validateAutoPinParams, buildReturnUrl (pure)
  AutoPinPairing/QRScannerDialog.tsx FxDialog + <video> (platform/qrScanner camera scanner) + image upload fallback; parseQrPayload
  __tests__/*.test.tsx (10)          + testUtils.tsx (renderRoute / seedBlox / resetSettingsStores)
  AutoPinPairing/__tests__/*.test.ts (2)
src/components/settings/
  SettingsScreen.tsx                 page wrapper: FxPageHeader (back on phones; backOnDesktop for pool pages <1280px), 720/1200px column, data-screen
  SettingRow.tsx                     label + description + FxSwitch (aria-labelledby)
  WalletNotification.tsx             1:1 port of the mobile component (compact + full), settings-local (see deviations #9)
  PoolCard.tsx                       port of components/Cards/PoolCard.tsx (see "Pools" below) + "View details" + selected ring
  joinState.ts                       joinState_<poolId>_<bloxPeerId> over platform/kvStore
  format.ts                          truncateMiddle, shortAccount, errorMessage
  index.ts, __tests__/joinState.test.ts
src/i18n/locales/{en,zh}/settings.json   every string of the nine mobile screens + web-only copy (zh translated, en fallback anyway)
src/assets/images/{mode_light,mode_dark,file_sync_logo}.png   copied from apps/box/assets/images
src/app/routes/settingsRoutes.tsx  unchanged (paths + handles already matched)
```

Screen behaviour that maps 1:1 to the mobile sources is not re-described here; the differences are in the next section.

## Deviations from mobile / the plan (and why)

1. **Pools — leave and cancel are contract-only** (plan PM11; `pools.fx.land` has no `/leave`/`/cancel`, and none is needed: the join server records the user's own wallet as the member). Both open a `confirm()` naming the chain and adding "Base charges gas fees for this transaction." on Base, then `withCorrectNetwork(() => leavePool/cancelJoinRequest(poolId, currentClusterPeerId))`. The peer id is the Blox's **ipfs-cluster** peer id — the id joins register on-chain (the mobile port passed nothing, so the wallet address was base58-decoded and every leave threw "Non-base58 character" before the wallet prompted). `contractService.leavePool` checks membership and the member wallet first (SKALE returns no revert data), simulates with `from` (the contract checks `msg.sender`), and sends `removeMemberPeerId`; wallet errors name the gas token ("Not enough ETH on Base / sFUEL on SKALE …") or the rejection. After success the Blox is told (`blockchain.leavePoolWithChain` → go-fula `fula-pool-leave`, best effort, info toast if it can't be reached) and the card's join progress is cleared — only on success. Unknown cluster id → "Blox Not Ready" before the confirm. The notifee foreground service around the leave transaction is gone (toasts only, `pools.*` keys reused from `translation.json`).
2. **Pools — dead mobile code not ported**: `wrappedJoinPoolViaAPI`, `performEnhancedJoinPool`, `wrappedJoinPool`, `wrappedLeavePoolViaAPI`, `wrappedCancelJoinRequestViaAPI`, `handleViewJoinRequests`, `handleVoteOnRequests` and the `allowJoin` state were never reachable from the mobile UI (the card owns the join; the screen only passes `leavePool`/`cancelJoinPool`). The debug `console.log` effect is dropped too. Web additions: the "Refresh" label (mobile: "Retry"), an empty state, an error state when the hook reports `error` with no pools, "View details" on every card, the `selected` ring in the master-detail.
3. **PoolCard — account**: contract (PC, `_amd64`) joins require the connected wallet account (mobile rule); join-server joins accept the manual-signature address (advisor-adopted split, consistent with `usePoolsWithFallback.joinPoolViaAPI`). "Blox Not Registered" is a 3-way `choose()`: "Open a GitHub Issue" opens the repository issues page, "Register Blox" goes to `/users` (mobile had empty handlers with TODO comments). Stale-attempt guard added (advisor item). `getContractService` / `ethers` are `import()`ed inside the handlers so the settings chunk does not carry ethers.
4. **PoolDetails**: `leavePoolViaAPI` → contract `leavePool` (as #1); members fall back to the pool's RPC `participants` when there is no contract service (manual signature); "Pool not found" is shown only after the list has settled (skeleton before); a "Join Requests" button links to the (placeholder) join-requests route (mobile had no UI entry to it).
5. **JoinRequests**: `voteJoinRequest` takes the web contract signature `(poolId, requestPeerId, voterClusterPeerId, approve)`; mobile passed the account.
6. **ChainSelection**: the mobile Base authorization code (9870, `baseAuthorized`) is removed — Base is freely selectable. Instead every switch (either direction) runs `checkChainSwitchAllowed` (`services/chainSwitchGuard.ts`): if any known Blox is a member of, or has a pending join request to, a pool on the chain being left — and is not already in a pool on the target chain — the switch is refused with a toast naming the Blox and pool; if the RPC can't answer (or a Blox's cluster peer id is unknown and the account is in a pool) a "Switch anyway?" confirm decides. Join progress (`joinState_*`) is now chain-scoped (SKALE keeps the mobile key; other chains add the chain name). The never-set `switching` state is dropped. Addresses are middle-truncated (`truncateMiddle`, full value in `title`).
7. **ConnectedDApps**: the Blox dropdown calls `switchToBlox(peerId)` (generation-guarded) instead of writing `currentBloxPeerId` directly; after authorize the return is an alert + an explicit "Open {app}" button (`location.assign` needs a click); `returnDeepLink` gets a tolerant second `decodeURIComponent` (mobile did it unconditionally); ClearDAppSheet "Confirm" closes the sheet (mobile called an undefined global `close()`); "Coming soon" instead of the mobile typo; a menu entry and an empty state were added (mobile only reached the screen via the deep link). `file_sync_logo.png` copied as the card image (`imageMap.fileSync`).
8. **AutoPinPairing**: params are read from react-router's `useLocation()` (fragment first, query fallback — spec v1.1), captured once and **stripped from the URL** (`navigate(…, { replace: true })`) so the bearer token does not stay in the address bar / history; validation before acting (token ≤ 8 KiB, `https:` endpoint, `https:`/`fxfiles:` template with all four placeholders — `returnUrl` itself stays optional as on mobile); the `/autopin-pair` route without params shows "Missing pairing parameters" in deep-link mode (mobile fell back to manual mode); "Return to FxFiles?" is a `confirm()` whose confirm calls `assign(finalUrl)`, and the success panel keeps an "Open FxFiles" button for the "Stay Here" case; placeholder substitution replaces every occurrence via a function replacer (mobile: first occurrence, `String.replace` patterns). QR scan = `FxDialog` + `<video>` + `BarcodeDetector`/zxing via `platform/qrScanner`, plus an image-upload fallback; the JSON `{api, endpoint}` parsing is the mobile one.
9. **WalletNotification is settings-local** (`src/components/settings/WalletNotification.tsx`): the shared `src/components/WalletNotification` belongs to S2 per the plan; this is a 1:1 port with i18n keys (`settings.walletNotification.*`). Once S2's lands, swap the import in `ChainSelection.tsx` and delete this copy.
10. **PoolCard lives in `src/components/settings/PoolCard.tsx`** (the task allowed this if S2's was not ready); the props are the mobile ones plus `onViewDetails`/`selected`.
11. **BloxLogs**: `loadingLogs` is now actually set to `true` during the fetch (mobile never set it); the "Other" container keeps the mobile quirk (the dropdown shows "Other", the typed name is fetched with the refresh button / Enter).
12. **BloxStatusMonitor**: mobile's iOS note is replaced by the web note (checks only while the tab is open); a last-run line and "Check now" (`bloxStatusMonitor.runNow`) were added.
13. **About**: the storage note (`navigator.storage.persisted()` → persisted / not persisted / unknown) is new (plan PM6); the terms URL is a real link.
14. **Mode**: "Prefer Bluetooth" switch (`preferBluetooth`) is new (plan PM4).
15. **Settings menu**: "Connected dApps" entry added after "Auto-Pin Pairing". "Blox discovery" keeps the foundation's direct link to `/setup/connect-existing` (the `/settings/blox-discovery` redirect route still exists); BloxLogs and the gallery stay flag-gated as the foundation wired them.
16. **Strings**: all in `settings.json` (en + zh); existing `pools.*` keys reused for the leave flow; `Trans` with a `<bold>` component for the auto-pin intro. Toast titles/messages are the mobile English, translated in zh.

## Integrator items (files I do not own)

1. **`src/app/__tests__/guards.test.tsx` "set up → a guarded route renders directly"** asserts the stub copy `Pool details — coming soon` and a bare `7` at `/settings/pools/7`. With the real screen (no wallet account in that test → the list never loads) the page renders `[data-screen="pool-details"]` with the subtitle `Pool ID: 7` and `[data-testid="pool-not-found"]`. Suggested replacement:
   `expect(await screen.findByTestId('pool-not-found')).toBeInTheDocument(); expect(screen.getByText('Pool ID: 7')).toBeInTheDocument();`
   (The other four failing guards cases assert S1/S2 stub copy — `Welcome`, `Blox`, `Link password` — and need the same treatment.)
2. **`e2e/smoke.spec.ts` "direct deep-load of /settings/pools/1 shows the pool id"** asserts the stub's `[data-param="poolId"]`. Suggested: `await expect(page.locator('[data-screen="pool-details"]')).toContainText('Pool ID: 1');`. The other settings routes still load inside the AppShell (each screen renders a `data-screen` section), so the per-route loop should keep passing; `/settings/logs` needs `VITE_ENABLE_BLOX_LOGS` as before.
3. **`src/app/guards.tsx:56` drops `location.hash` when stashing a deep link** (`${location.pathname}${location.search}`), so a v1.1 fragment auto-pin link (`/autopin-pair#token=…`) received while the app is **not set up** loses its token after setup. One-line fix: append `${location.hash}`. Note the consequence agy raised: the bearer token would then sit in `sessionStorage` for up to the 60-minute stash TTL — acceptable for a same-tab stash, but consider a shorter TTL for auto-pin entries or clearing the stash on "Back to app".
4. **S2 hand-off**: replace `src/components/settings/WalletNotification.tsx` with the shared one when it exists (#9); `PoolCard` can move to `src/components/` if S2 prefers a single home.
5. **`vi.mock('@/wallet/useWallet')` in `PoolCard`-rendering tests**: `PoolCard` now calls `useWallet()` directly (contract-path account) in addition to `useAccountWithFallback()`; tests that render pool cards must mock both (see `Pools.test.tsx`).

## Open items

1. **Advisor coverage**: only agy reviewed; Cursor (login), Codex (402 deactivated workspace), Kimi K2.7 (plan-gated), GLM (1113 quota), MiMo (Telegram binding) all failed for account reasons. Re-run an uncorrelated review on `PoolCard.tsx` / `autopinParams.ts` when a seat is fixed.
2. **Not verified in a real browser**: the vaul/Radix sheets in the ConnectedDApps flow, `location.assign` to `fxfiles://` from the confirm continuation (agy: within Chrome's 5 s transient activation; the persistent "Open FxFiles" button is the fallback), camera QR scanning (`getUserMedia` + `BarcodeDetector`), the Radix Select in BloxLogs, and the ≥1280px pools master-detail layout. `npm run dev` + `npm run fake-blox` were not started in this session.
3. **Leave/cancel need the member wallet**: the join server records the user's own `account` as the member, so leaving is that wallet's own transaction (a wallet without ETH on Base / sFUEL on SKALE gets the "not enough … to pay the network fee" error and must top up — accepted). A user with only a manual signature (no wallet provider) can't sign, so can't leave from the web.
4. **Blox Not Registered → "Register Blox"** navigates to `/users`, which is S2's (mock) Users tab; confirm that is where registration lives on web.
5. **`JoinRequests` is still the mobile placeholder** (`contractService.getJoinRequests` does not exist); the vote path is wired but untestable end-to-end.
6. **Toast queueing**: mobile-order info toast (3 s) delays the leave success toast; consider `showToast` for the success message once UX signs off.
7. **Eager bundle**: the settings screens are lazy route modules; `ethers`/`contractService` are dynamic imports inside `PoolCard`; `zxing-wasm` is only loaded by `platform/qrScanner` on demand. Not measured with `vite build` here (integrator).

## Pre-mortem (assume it failed)

| Failure | Tripwire | Mitigation |
|---|---|---|
| FxFiles hand-off returns to the wrong URL / token leaks | `autopinParams.test.ts` (fragment-first, validation, substitution incl. `$` in values), `AutoPinPairing.test.tsx` (URL stripped, `assign` called with the exact URL) | spec v1.1 in `docs/AUTOPIN-HANDOFF.md`; add the Playwright round-trip (WS6 §6) against the FxFiles-web sender |
| Custom-scheme navigation blocked (no user activation) | manual check in Chrome; the confirm continuation is the risky path | the persistent "Open FxFiles" / "Open {app}" buttons are plain click handlers |
| Join state corrupts across Blox switches or cancelled attempts | `joinState.test.ts` (per pool + per Blox keys), `Pools.test.tsx` (401 path persists step errors; success clears the key); stale-attempt guard | keys carry the Blox peerId (multi-Blox invariant); `attemptRef` ignores late results |
| Contract path used without a wallet provider | `PoolCard` account split (PC → wallet only) + "Wallet Not Connected" toast | keep `useContractIntegration` as the only initializer of `contractService` |
| Setup-then-deep-link flow loses the token | guards `location.hash` item (#3 above) | one-line guard fix + a guards test with a `#token=` entry |
| Toast-order assumptions break tests | tests split so each toast is asserted in a fresh render; the leave test waits ≤ 6 s | prefer `showToast` for success if the order changes |
| The `Pools` master column (≤ 360px) overflows | `min-w-0` on the list items, single column in the aside, `desktop:grid-cols-2` only on the standalone page | manual 1280px check |
| `guards.test.tsx` / smoke assertions on stub copy fail after all builders land | listed under Integrator items #1–2 with exact replacements | update the foundation tests once per merged screen group |

# STATUS — WS6: FxFiles → FxBlox Web pairing hand-off (FxFiles-web side)

Date: 2026-08-27 · Repo: `E:\GitHub\FxFiles-web` · Branch: `feat/blox-web-handoff` (created from `feat/mcp-web-oauth` @ `8b91896`, tree was clean) · **Not pushed, no PR** (as instructed).

Spec implemented: `E:\GitHub\fxblox-web-app\docs\AUTOPIN-HANDOFF.md` (v1) + plan section "WS6 — FxFiles-web hand-off"; then bumped to **v1.1** (web outbound in the fragment) on the coordinator's follow-up — the FxFiles-web copy `E:\GitHub\FxFiles-web\docs\AUTOPIN-HANDOFF.md` is v1.1, the fxblox-web-app copy still says v1 (see follow-up 0).

## Commits (all on `feat/blox-web-handoff`, each with the two required trailers)

| SHA | Subject |
|---|---|
| `58d87aa` | feat(blox-pairing): web hand-off links + fragment return template (native) |
| `8e649a5` | feat(web): Blox pairing return receiver + My Devices screen |
| `9e2f3bc` | feat(site): /autopin-complete forwarder + hand-off docs |
| `17fd9b4` | fix(blox-pairing): review fixes — history hygiene + trailing-slash route (from the agy focused review, see below) |
| `8d833f9` | feat(blox-pairing): web carrier sends the hand-off params in the FRAGMENT (v1.1) — coordinator adopted review finding 1: `buildBloxWebPairUrl` → `https://blox.fx.land/autopin-pair#token=…&endpoint=…&returnUrl=…` (no query); native `fxblox://` unchanged; call sites untouched (they use the builder); `docs/AUTOPIN-HANDOFF.md` bumped to v1.1 (receiver reads `location.hash` first, v1 query accepted as fallback); `architecture.md` updated; tests updated + a "no query / JWT not before the `#`" test |

## Deliverables → files

| # | Deliverable | Status | Where |
|---|---|---|---|
| 1 | Sender: `webUrl` with the SAME params (**as a fragment since `8d833f9`, v1.1**); `kIsWeb` → web; native `fxblox://` first (query), fallback "Pair in browser"; desktop dialog button; fragment return template; helper + tests | Done | `lib/core/services/blox_pairing_links.dart` (`buildBloxWebPairUrl`, `buildBloxNativePairUrl`, `kAutopinReturnTemplate`, `kAutopinLegacyReturnTemplate`, `kAutopinReturnPlaceholders`, `returnTemplateHasAllPlaceholders`, `AutopinCompleteParams`, `parseAutopinCompleteParams(Uri)`); `lib/features/settings/screens/blox_pairing_screen.dart` (`_initiatePairing`, `_offerPairInBrowser`, `_openInBrowser`, `_ManualPairingDialogState._pairInBrowser` + button) |
| 2 | Static forwarder + `.well-known` | Done | `site/autopin-complete/index.html`; `site/.well-known/apple-app-site-association` → `"paths": ["/nft-claim*", "/autopin-complete*"]`; `assetlinks.json` uses `handle_all_urls` (no path list) → left unchanged; **also** `android/app/src/main/AndroidManifest.xml` gained `<data … android:pathPrefix="/autopin-complete"/>` in the existing autoVerify https filter (without it the Android app link would not fire — the manifest, not assetlinks, enumerates paths on Android) |
| 3 | Native `/autopin-complete` universal-link arm | Done | `lib/core/services/deep_link_service.dart`: `_handleUniversalLink` is now `Future<void>` (awaited), arm for `/autopin-complete` (and trailing-slash form) → `_handleAutoPinComplete`, which now uses `parseAutopinCompleteParams` (fragment first, then query) + `validationError` before writing `SecureStorageKeys.blox*` |
| 4 | Web receiver | Done | `lib/web/services/web_autopin_return_logic.dart` (pure: `detectAutopinReturn`, `stripAutopinReturnFromLocation`, memory holder, sessionStorage encode/decode), `web_autopin_return_web.dart` (`captureAutopinReturn`, `stashPendingAutopinReturn`, `takePendingAutopinReturn`; `history.replaceState`), `web_autopin_return_io.dart` (stub), `web_autopin_return.dart` (conditional export); `lib/main_web.dart` calls `captureAutopinReturn()` right after `captureWebOauthRedirect()`; `lib/web/screens/web_home_screen.dart` `_handoffAutopinReturnIfAny()` in `_initSignedIn` → `context.go('/blox-pairing', extra: params)` after the frame; `lib/web/router_web.dart` routes `/blox-pairing` (extra or query) + `/autopin-complete` (fallback) + redirect handling; `lib/web/screens/web_blox_pairing_screen.dart` (new, dart:io-free); `lib/web/screens/web_settings_screen.dart` `_devicesSection` → `/blox-pairing` |
| 5 | Docs | Done | `architecture.md` §2 "Additional UX — Pairing" rewritten (entry points, both carriers, template, receivers, web limitation); `docs/AUTOPIN-HANDOFF.md` = the spec, bumped to **v1.1** (web outbound fragment form + receiver fallback rule + an "FxFiles implementation map" appendix); `README.md` web section (forwarder + limitation bullet) |
| 6 | Tests | Done | `test/unit/core/services/blox_pairing_links_test.dart` (32 tests), `test/unit/web/web_autopin_return_logic_test.dart` (20 tests) |

### Design notes / deviations worth knowing

- **Params travel as go_router `extra`, not `?query`**, for the post-login hand-off (`/blox-pairing`). The task text said "navigate to `/blox-pairing?…`"; I kept the secret out of the address bar/history on purpose (agy-advisor concurred). The `/blox-pairing` route still accepts a query, and `/autopin-complete?…` is accepted as the fallback (the screen persists, then `go('/blox-pairing')` to clean the URL).
- **Redirect whitelist**: rather than blindly letting a logged-out `/autopin-complete` render, the redirect parks the params (`stashPendingAutopinReturn(parseAutopinCompleteParams(state.uri))`) and returns `/`; the post-login hand-off then completes it. Signed-in users fall through and the route renders. This is the only side effect in the redirect and it is the replaceState-failed fallback path only.
- **sessionStorage stash** (agy suggestion): the captured return is mirrored into `sessionStorage['fxfiles.autopinReturn.pending']` so a refresh between landing and sign-in does not lose it; cleared on `takePendingAutopinReturn()`. Trade-off: the secret sits in per-tab sessionStorage until sign-in (same class of exposure as the existing OAuth PKCE txn).
- **Validation** (`AutopinCompleteParams.validationError`): non-empty secret ≤ 512 chars; hardwareId ≤ 256; bloxPeerId ≤ 128; bloxName ≤ 128; no control chars (0x00–0x1F, 0x7F). Applied on the web screen AND in the native `_handleAutoPinComplete` (a small behaviour change for native: previously only "secret non-empty" was checked).
- **Web screen writes the identity fields with delete-when-absent** (a new pairing clears stale hardwareId/peerId/name); native keeps its existing "write only when present" behaviour.
- **Secret reveal/copy** on the web screen (behind a confirm dialog, mirroring the Settings encryption-key reveal): lets a user paste it into desktop's manual pairing dialog, which is the only cross-device path today (see "Plan inaccuracy" below).
- The forwarder never auto-navigates to the web app after the 2.5 s fallback (store links only), so a successful app launch is not shadowed by a second navigation (agy raised the `document.hidden` flakiness).

## Verification — exact commands and results

Environment: `flutter --version` → **Flutter 3.41.9** (stable, 2026-04-29) · `dart --version` → **Dart 3.11.5**. Windows; Bash tool fails with fork errors → PowerShell used throughout.

| Command | Result |
|---|---|
| `git status --porcelain` before branching | clean (branch was `feat/mcp-web-oauth`, not `main`; branch created from it as instructed "from the current branch") |
| `flutter test test/unit/core/services/blox_pairing_links_test.dart` | **+29, All tests passed** |
| `flutter test test/unit/core/services/blox_pairing_links_test.dart test/unit/web/web_autopin_return_logic_test.dart test/unit/features/ai_connections/web_hosted_oauth_logic_test.dart` | **+73, All tests passed** (29 + 19 + 25) |
| `flutter test test/unit/web test/widget/web` | **+161, −1** — the one failure is `test/widget/web/web_storage_section_test.dart` "renders STORAGE header, Cloud label and used/total bytes": expects text `Cloud`, widget renders `Cloud Files`. **Pre-existing**: `git diff --stat 8b91896..HEAD -- lib/web/widgets test/widget` is empty; the widget was last changed 2026-06-21 (`96c4420`, #76) after the test was written 2026-06-14 (`397d0d7`). Not touched by this branch. |
| `flutter analyze --no-pub` (whole project) | **174 issues** (infos/warnings; no errors) — pre-existing baseline (viewer screens `withOpacity`, unused imports, etc.). I did not re-run analyze on the base commit to get the exact baseline number (233 s per run); instead: |
| `flutter analyze --no-pub <the 14 touched/new files>` | **1 issue**: `warning - Unused import: 'package:fula_files/core/services/auth_service.dart' - lib\features\settings\screens\blox_pairing_screen.dart:13:8`. **Pre-existing** (0 `AuthService` usages in the HEAD version of the file); left untouched to keep the diff minimal. All new files are clean. |
| `flutter build web --release -t lib/main_web.dart --base-href /app/ --pwa-strategy=none --no-wasm-dry-run` | **`√ Built build\web`**, exit 0, compile 113.8 s, total 2:00. Only notice: `--pwa-strategy` deprecation warning. Bundle check: `build/web/main.dart.js` contains `blox.fx.land/autopin-pair`, `autopin-complete`, `fxfiles.autopinReturn.pending`, `Pair Blox`, `/blox-pairing` (new code is in the web graph, not tree-shaken). |
| Review-fix commit `17fd9b4`: `flutter test test/unit/core/services/blox_pairing_links_test.dart test/unit/web/web_autopin_return_logic_test.dart` | **+51, All tests passed** (31 + 20; 3 trailing-slash tests added) |
| Review-fix commit `17fd9b4`: `flutter analyze --no-pub <the 6 files changed by the fixes>` | **No issues found!** (15.9 s) |
| Fragment-carrier commit `8d833f9`: `flutter test test/unit/core/services/blox_pairing_links_test.dart test/unit/web/web_autopin_return_logic_test.dart` | **+52, All tests passed** (32 + 20) |
| Fragment-carrier commit `8d833f9`: `flutter analyze --no-pub lib/core/services/blox_pairing_links.dart lib/web/screens/web_blox_pairing_screen.dart lib/features/settings/screens/blox_pairing_screen.dart test/unit/core/services/blox_pairing_links_test.dart` | **1 issue** — the same pre-existing unused `auth_service.dart` import in `blox_pairing_screen.dart:13` (not touched); the changed files are clean |
| Review-fix commit: web build | NOT re-run after `17fd9b4` / `8d833f9` (the changes are a `context.go`→`context.replace` swap, a pure-Dart helper, and JS in the static page; analyze + tests cover the Dart). |
| Web compile graph dart:io check | The web build succeeding is the proof: `main_web.dart` → `web_autopin_return.dart` (conditional export) → `_web.dart` (package:web only); `web_blox_pairing_screen.dart` imports only material/services/go_router/lucide/url_launcher + `blox_pairing_links.dart` (no Flutter/io imports) + `secure_storage_service.dart` (already in the web graph). |

**Not verified (honest list):**
- No end-to-end run on a device/browser: the real `blox.fx.land/autopin-pair` page is WS4/WS6-FxBlox-side and does not exist yet (`E:\GitHub\fxblox-web-app` has no `returnUrl` handling in ts/tsx today) — so the mobile "Pair in browser" fallback will 404 until that ships. The FxBlox **mobile** substitution (`apps/box/.../AutoPinPairing.screen.tsx:96-101`: `decodeURIComponent(returnUrl).replace('$secret', encodeURIComponent(v))…` then `Linking.openURL`) was read and has no scheme check, so the https template is accepted by existing FxBlox app builds.
- iOS universal link / Android app link delivery of the fragment to the app was not exercised (no device). AASA changes are cached by Apple's CDN; until refreshed the forwarder path applies (which still works via `fxfiles://`).
- `history.replaceState` + hash-router boot ordering was not exercised in a browser in this session (same mechanism as the already-shipped `captureWebOauthRedirect`).
- The full `flutter test` suite was NOT run (only the two new files, the OAuth logic file, and `test/unit/web` + `test/widget/web`).
- No Playwright round-trip (plan item 6 of WS6 — depends on the FxBlox web side).

## Advisor consultation record (per the user's standing rules)

| Advisor | Plan review | Code review | Outcome |
|---|---|---|---|
| agy-advisor (Antigravity) | ✅ responded | (see "Code review results" below) | Plan: approach sound; suggested sessionStorage stash (adopted), null-`extra` handling on refresh (adopted — the screen falls back to stored state), noted JS `String.replace` `$` quirk is safe because `encodeURIComponent` encodes `$` (FxBlox-side; out of scope), warned about `document.hidden` flakiness (forwarder never auto-navigates to the web app), confirmed fragments survive iOS/Android app links. |
| cursor-advisor | ❌ | ❌ | `Authentication required` — cursor-agent not logged in (`cursor-agent login` needed). |
| kimi-advisor (CF Workers AI, K2.7) | ❌ | — | HTTP 403: `@cf/moonshotai/kimi-k2.7-code is not available on the Workers Free plan` (model now gated; contradicts the CLAUDE.md note — worth updating). |
| mimo-advisor (bynara) | ❌ | — | HTTP 403 `telegram_required` — the bynara router now requires binding a Telegram account at `/settings`. |
| glm-advisor (z.ai) | ❌ | — | 429 / error **1113** "Insufficient balance or no resource package" (Coding Plan quota exhausted or lapsed). |
| codex-advisor | — | ❌ | HTTP 402 `deactivated_workspace` (Codex workspace deactivated / billing). |
| kimi-k3-advisor | — | ❌ | Moonshot `provider.api_error: 500` on two consecutive 3-minute attempts (server-side; auth/model routing worked). Relay notes: `--plan` cannot be combined with `-p` in kimi-code 0.26.0 (the agent def should drop it), and double quotes in prompts fragment PowerShell 5.1 argv. |
| built-in `advisor` | not available in this agent's tool set | | |

So the plan was reviewed by ONE external advisor (agy) instead of the usual core set; the other advisors were unavailable for account/quota/server reasons outside this session's control. Flagged here so the user can fix the accounts.

### Code review results
- **agy-advisor, repo-reading review**: ❌ timed out after the 5-minute `--print-timeout` with no output (auth is fine — the plan review worked; the multi-file agentic read exceeded the bound).
- **agy-advisor, focused retry** (self-contained prompt with the parser, capture/take, router redirect/routes, home hand-off, screen `_load`/`_pair`, native fallback and the forwarder JS inline): see "Focused review outcome" below.
- **codex-advisor**: ❌ 402 `deactivated_workspace`. **kimi-k3-advisor**: ❌ 500. So the repo-reading "CLI trio" produced no review; the code was self-reviewed line by line (diff re-read after commit) and covered by 51 new unit tests + the web build.

#### Focused review outcome (agy, self-contained prompt — returned 4 findings)

| # | Finding | Verdict | Action |
|---|---|---|---|
| 1 | **JWT in the outbound GET query** (`https://blox.fx.land/autopin-pair?token=<JWT>…`): lands in browser history, proxy/CDN/GitHub-Pages access logs and Referer headers. | Valid. It was the v1 contract (query); escalated to the coordinator. | **Adopted by the coordinator → fixed in `8d833f9`** (v1.1): the web carrier now emits `https://blox.fx.land/autopin-pair#token=…&endpoint=…&returnUrl=…` (fragment, no query). Receiver rule recorded in `docs/AUTOPIN-HANDOFF.md` v1.1: FxBlox-web reads `location.hash` first, the v1 `?token=…` query stays accepted as a fallback, strips the fragment via `history.replaceState`, serves `<meta name="referrer" content="no-referrer">`. |
| 2 | Fallback route `/autopin-complete?secret=…` → `context.go('/blox-pairing')` leaves the secret-carrying history entry; browser Back re-runs the persist. | Valid. | **Fixed** in `17fd9b4`: `context.replace('/blox-pairing')`. |
| 3 | Forwarder never strips `#secret=…` → stays in history, replays on refresh, leaks if the URL is shared. | Valid. | **Fixed** in `17fd9b4`: `history.replaceState(null, '', location.pathname)` right after capture; buttons work from the captured variables; a reload shows "incomplete or already used". |
| 4 | Hash-route detection rejects `#/autopin-complete/?secret=` (trailing slash). | Valid (minor). | **Fixed** in `17fd9b4`: shared `isAutopinReturnRoutePath()` used by the parser, the web strip logic and the native universal-link arm; 3 tests added. |
| Q | `+` in secrets: safe as long as FxBlox `encodeURIComponent`s values (mobile does → `%2B`); a raw `+` would decode as a space on both sides. | Agreed. | Recorded for the FxBlox-web implementer (follow-up 2). |

## Notes for the parent / follow-ups

0. **Spec v1.1 (fragment web carrier) — DONE on the FxFiles side (`8d833f9`).** ACTION for the FxBlox-web side: implement the receiver rule (`location.hash` first, `?token=` fallback, strip + no-referrer) and **sync the spec copy** `E:\GitHub\fxblox-web-app\docs\AUTOPIN-HANDOFF.md` (still v1 with the query form; I was asked to update only the FxFiles-web copy, so the two copies now differ).
0b. **Pre-existing log exposure (not introduced here):** `DeepLinkService._handleDeepLink` / `init()` `debugPrint` the FULL incoming URI (`Handling deep link: $uri`, `Initial link received:`, `Link received:`), which already included the `fxfiles://autopin-complete?secret=…`, `nft-claim#secret=` and `?key=<JWT>` secrets; the new fragment form flows through the same lines. Suggest redacting query+fragment in those three log lines in a separate hardening PR.
1. **Plan inaccuracy (please correct in the plan / README expectations):** WS6 says "the stored credentials are used by native/desktop FxFiles on the same vault". They are **not** shared across devices — `SecureStorageKeys.blox*` is device-local (flutter_secure_storage: Keychain/Keystore/Windows credential store; on web, browser storage). Nothing in the repo syncs them through the vault. What pairing from the web DOES achieve is the important part: the Blox stores the auto-pin token/endpoint and starts pinning the user's cloud files. Native/desktop FxFiles need their own pairing (or the desktop manual dialog with the revealed secret). The screen, README and architecture.md state this honestly.
2. **FxBlox web side (WS4/other agent)** must implement `https://blox.fx.land/autopin-pair#token&endpoint&returnUrl` (fragment; `?query` fallback): validate (`token` ≤ 8 KiB, `endpoint` https, `returnUrl` scheme `https:`/`fxfiles:` + all four placeholders), substitute with `encodeURIComponent` (prefer a replacer function `replace('$secret', () => enc(v))` to be immune to `$`-pattern quirks), and `location.assign(finalUrl)` on a user click; values MUST be `encodeURIComponent`-ed (a raw `+` would be decoded as a space by both the forwarder's `URLSearchParams` and Dart's `Uri.splitQueryString`). Until then the mobile fallback and the web "Pair Blox" button lead to a missing page.
3. **GitHub Pages trailing slash:** `files.fx.land/autopin-complete` 301s to `/autopin-complete/`; browsers carry the fragment across the redirect (same as the shipped `/nft-claim` link), and the native handler + AASA + manifest accept both forms.
4. **Pre-existing test failure** `web_storage_section_test.dart` ("Cloud" vs "Cloud Files") — unrelated; a one-line test fix if wanted.
5. **Stray files:** a reviewer agent dropped `combined_review.txt` / `combined_review_utf8.txt` (a concatenated diff) in the repo root; removed after the reviews finished (not committed).
6. `assetlinks.json` unchanged (uses `handle_all_urls`); `AndroidManifest.xml` changed instead (documented above).

## Pre-mortem (assume it failed)

| Failure | Tripwire | Mitigation in place |
|---|---|---|
| Fragment dropped before the web app sees it (Pages 301, browser) | `#/autopin-complete` route arrives without `secret` → screen shows nothing paired | Parser also accepts the query form; the forwarder can be switched to emit `?secret=` if a browser is found to drop the fragment |
| `history.replaceState` throws / router boots before capture | URL still shows `#/autopin-complete?…` after load | `/autopin-complete` route + redirect fallback persist/park the params anyway |
| User refreshes between landing and sign-in | hand-off silently lost | sessionStorage stash restored into memory on the next `captureAutopinReturn()` |
| Old FxBlox app rejects an https `returnUrl` | pairing completes on the Blox but no return | Verified the mobile code has no scheme check; legacy template constant kept for a quick revert |
| Android app link not verified → opens browser | forwarder renders on the phone | forwarder auto-tries `fxfiles://autopin-complete?…` (legacy query form the app always accepted) |
| Over-strict validation rejects a real payload | `DeepLinkService: autopin-complete rejected: …` in logs / red banner on the web screen | Limits are generous (secret 512, ids 256/128, name 128) and unicode names allowed |
| Secret persisted while logged out on web | — | Web persists only from the post-login hand-off or a signed-in route; logged-out landings are parked, not written |

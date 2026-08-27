# WS3 status — `apps/fxblox-web` data / platform layer

_Last updated 2026-08-27 (implementation session). No commits were made; everything is in the working tree. Scope was WS3 only: stores, hooks, api, services, utils, contracts, wallet, i18n, models, platform shims, build/PWA config and tests — **no screens, routes, shells or React components** (WS4). `src/App.tsx` is still the hello shell; `src/main.tsx` only gained a `void bootstrapDataLayer()` call before render._

## Verification (exact results)

All commands run from `E:\GitHub\fxblox-web-app` (Windows, PowerShell) after the last edit.

| Check | Command | Result |
|---|---|---|
| Tests | `npm test -w apps/fxblox-web` | **40 files, 534 tests, all passed** (`vitest run`, jsdom + `fake-indexeddb/auto` + jest-dom; 18.5 s on the final run, 42 s when run alongside the build). The console noise in the run (`refreshRelayCache failed: Error: boom`, `Failed to convert PeerID to bytes32 …`, `onStreamFrame callback raised …`) is expected — those tests exercise the failure paths and assert on them. |
| Typecheck | `npm run typecheck -w apps/fxblox-web` | clean (`tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json`, 0 errors, exit 0) |
| Lint | `npm run lint` (workspace) | clean (exit 0, no findings) |
| Build | `npm run build -w apps/fxblox-web` | success (`✓ built in 18.1 s`, `precache 27 entries (2504 KiB)`, `postbuild: wrote 404.html and version.json`, exit 0). **No `Circular chunk` warnings.** One expected Rollup notice: "Some chunks are larger than 500 kB after minification" — that is `vendor-appkit` (3.8 MB raw / 1.05 MB gzip; Reown AppKit + viem + WalletConnect + Coinbase/Base SDKs), which is lazy. |

### What the browser loads at first paint (`dist/index.html`)

| Eager chunk | Size (raw) | Contents |
|---|---|---|
| `index-*.js` (entry) | 78 KB | our source (bootstrap, stores, i18n, secureStore, kvStore, discovery, bloxStatusMonitor, clientLogger…) + `idb-keyval` |
| `vendor-react-*.js` | 240 KB (76 KB gzip) | react, react-dom, scheduler, zustand, i18next, react-i18next |
| `index-*.js` + `_commonjsHelpers-*.js` | 2.7 KB | Node polyfill shims + Rollup CJS helper |
| **Total eager JS** | **321 KB raw** | (was **4.66 MB** before the chunking fix below — AppKit and ethers were being preloaded) |

Lazy chunks and their static import edges (no cycles): `vendor-appkit` 3.8 MB → {entry (idb-keyval), vendor-ec, vendor-ethers, vendor-polyfills, vendor-react}; `vendor-libp2p` 394 KB → {vendor-ec}; `vendor-ethers` 388 KB → {scrypt, vendor-ec, vendor-polyfills}; `vendor-crypto` (fula-sec-web, did-jwt, @stablelib) 238 KB → {entry, vendor-polyfills}; `vendor-ec` (elliptic/@noble/@scure/hash.js/js-sha3) 98 KB; `vendor-polyfills` 61 KB; `abis` 77 KB; `contractService` 27 KB; `appkit` (wallet/appkit.ts + chains.ts) 2 KB; `helper` 3 KB; fula-web-client's own code 53 KB. The AppKit chunk is precached by neither the service worker (`globIgnores`) nor the shell.

**What was NOT verified in this workstream:** nothing was run in a real browser. Web Bluetooth (`requestDevice`, GATT writes, notifications, 512-byte cap), Chrome Local Network Access (`targetAddressSpace: 'local'`), the CORS/no-cors failure taxonomy against a real Blox hotspot, Reown AppKit's modal/WalletConnect flow and the PWA update prompt are covered by unit tests over fakes only. That is WS4/E2E work; the tripwires are listed under "Open items".

## External review (standing advisor rule)

Two rounds were fired on the finished code (report-only; nothing was delegated).

**Round 1 — data layer (secureStore, lanHttp, sse, ResponseAssembler, stores):** agy (Antigravity), Cursor, Kimi K2.7 (Cloudflare), GLM-5.2 and MiMo were fired; **only agy responded.** Cursor: not logged in (`cursor-agent login` needed); Kimi K2.7: Cloudflare `403` code 5035 (model no longer on the Workers Free plan); GLM-5.2: `429` / `1113` (quota exhausted); MiMo: bynara `403 telegram_required`. Codex and Copilot were not fired in that round. The built-in `advisor` tool is not available to this agent.

| agy item | Verdict | Change |
|---|---|---|
| `secureStore.withStore`: the request promise could reject before the transaction promise was awaited → unhandled rejection | agreed | `withStore` marks the request handled (`result.catch(() => undefined)`) and awaits both with `Promise.all`; regression test "a rejected IDB request surfaces as a rejection of the call, not an unhandled rejection" |
| `secureStore.wipe()` deleted the database while a connection was open and resolved immediately on `blocked` | agreed | `closeDb()` is awaited before `deleteDatabase`; `wipe` waits for `success`/`error` with a 5 s cap and no longer resolves on `blocked` |
| SSE parser: a trailing `\r` at end-of-stream leaked into the data; `retry:` parsed with `parseInt` | agreed | `end()` strips one trailing `\r`; `retry:` accepted only when `/^\d+$/` (spec behaviour); tests added |
| `ResponseAssembler`: a GATT write that never completes hung the call past the timeout, and the timeout rejection could be unhandled while the write was pending | agreed | write is raced against the command promise (`Promise.race([transport.write(...), commandPromise])`) and the command promise is marked handled; test "a GATT write that never completes still rejects at the timeout" |
| no-cors probes "need Private Network Access preflight headers" | **rejected**: with Chrome ≥ 142 Local Network Access is a permission prompt on the fetch itself (`targetAddressSpace: 'local'`), not a PNA preflight (per the plan's `lanHttp` contract). Kept the taxonomy as designed; recorded here as an unverified-in-browser item | none |
| BLE protocol has no transaction ids, so a late reply could be attributed to the next command | acknowledged, **not changed**: the framing is the firmware's; mobile has the same property and the assembler enforces one command in flight and drops notifications when no command is pending | none |

**Round 2 — the final Vite chunking policy** (`manualChunks` computed from the module graph + `onlyExplicitManualChunks`): agy, Codex, Cursor and Kimi K2.7 were fired at the time of writing; their replies had not arrived when this file was written — see the "Advisor round 2" addendum at the end of this document (updated when they answer, or recording that they did not).

## Module map

Source of the port: `E:\GitHub\fx\apps\box\src\**` (react-native). Classification: **Verbatim** = copied, at most an eslint header / import path; **Adapted** = same logic and public surface, platform calls swapped; **Rewritten** = new implementation behind the mobile-shaped interface; **Dropped** = not ported (with reason).

### stores (`src/stores`)

| File | Class | Notes |
|---|---|---|
| `persist/idbStorage.ts` | Rewritten | Shared `createJSONStorage` over idb-keyval (`fxblox-kv`/`kv`), `PERSIST_KEYS` keep the mobile slice names (`userProfileSlice`, `bloxsModelSlice`, `modeSlice`, `PoolsModelSlice`, `PluginsModelSlice`, `dAppsSlice`) so recorded blobs migrate 1:1; `zustandIdbStorage()`, `waitForHydration(stores)`, `rehydrateHandler(name, markHydrated)` (marks hydrated even when rehydration throws — zustand otherwise swallows the error and the app waits forever), `_setPersistBackingForTests`. |
| `useUserProfileStore.ts` | Adapted | version/migration/partialize kept (v0→v1). Keychain → `platform/secureStore`; `logout()` wipes the secure store, disconnects the wallet via `import('@/wallet/appkit')` and resets the other stores; `getEarnings/getContractRewards/claimRewards` dynamic-import ethers + contracts (keeps the shell free of ethers). The migration imports `./useBloxsStore` dynamically with one macrotask retry (ESM cycle: the store module is not yet initialised when persist runs the migration synchronously). |
| `useBloxsStore.ts` | Adapted | version 3, migrations, `partialize`, all multi-Blox guards verbatim (`switchGeneration`, `latestSwitchPeerId`, `resolveConnStatus` mirror, `restorePriorIfSuperseded`, `fulaReadyForPeerId`, `removeBlox` repoint, `waitForBloxStatusSettled`); `@/utils/helper` is imported dynamically; exports `_switchState` for tests. The nonexistent `fula.setAuth` call is gone. |
| `usePoolsStore.ts`, `usePluginsStore.ts`, `useSettingsStore.ts`, `dAppsSettingsStore.ts` | Adapted | same shapes; `usePluginsStore` keeps `inFlightListActivePlugins` keyed `${peerId}:${initFulaGen}`; `useSettingsStore` adds `preferBluetooth`, `resolveColorMode/useColorMode/startThemeSync` (system theme via `matchMedia`), `isDebugModeActive`; `dAppsSettingsStore.setAuth` keeps the mobile signature but only calls `blockchain.accountFund` when an `accountId` is present (mobile called `fula.setAuth`, which does not exist in the web client) and gains `reset()`. |
| `index.ts` | Adapted | barrel + `waitForHydration`. |

### hooks (`src/hooks`)

Adapted (same names/returns; AppKit and `lanHttp` underneath): `useFetch` (+ `useFetchWithBLE`), `useCallbackState`, `useIsFirstRender`, `useAccountWithFallback`, `useFulaBalance`, `useClaimableTokens`, `useRewards`, `usePluginsForBlox`, `useWalletConnection`, `useWalletNetwork`, `useContractIntegration` (+ `usePoolOperations`, `useRewardOperations`), `useLogger`, `usePools`, `usePoolsWithFallback`. Rewritten: `useHotspotReachable` (`probeHotspot` over `lanHttp` + `classify`, `useIsConnectedToBox`), `useTasksLogic({ navigateToPools })` (navigation injected — no router in WS3). Dropped from `usePools`: the `/leave` and `/cancel` API paths (plan).

### api (`src/api`)

`index.ts` (`API_URL = env.BLOX_AP_URL`, `apiUrlFor`), `wifi.ts`, `bloxHardware.ts` — Adapted: axios → `platform/lanHttp` (`lanJson`), simple-request discipline (GET, or POST `application/x-www-form-urlencoded`), `putApDisable` is a GET (plan), 15 s timeout on `postWifiConnect`, BLE branch via `safeGetConnectedPeripherals()` → `BleRegistry`; `getBloxPropertiesAtIp` feeds `lanIpCache`.

### services (`src/services`)

| File | Class | Notes |
|---|---|---|
| `discoveryClient.ts` | Rewritten | `refreshRelayCache`, `readRelayCache`, `findBox` (3 tiers: discovery → cache → hardcoded), `listRelays() → {relays, source}`, `probeDiscovery`; header `x-fula-client: app` with a retry **without** the header when the fetch fails with a `TypeError` (CORS preflight rejection is tolerated — plan (g)); `_configureForTests`. |
| `poolApiService.ts` | Adapted | `joinPool`, `health`; no `/leave`, `/cancel` (plan). |
| `poolReadService.ts` | Adapted | ethers read path, dynamic-import friendly. |
| `bloxStatusMonitor.ts` | Rewritten | replaces mobile's `backgroundBloxCheck` (headless JS) with a foreground, visibility-gated poller: `start/stop/configure/runNow/subscribe/getState`, uses `platform/notifications.showNotification`. |
| `pluginCatalog.ts` | New | catalog fetch from `PLUGIN_CATALOG_BASE` (raw.githubusercontent fula-ota plugins). |

### utils (`src/utils`)

Verbatim (eslint header only): `anonymizeTranscript`, `appPeerId`, `bloxAiEvents`, `bloxName`, `buildFeedbackPayload`, `findPendingQuestion` (one `noUncheckedIndexedAccess` guard), `ipIsPrivateLan`, `parsePendingResponse`, `uploadTranscriptUrl`, `media`, `users`. `helper.ts`: `initFula / resetInitFula / getInitFulaGen / waitForFulaInit / withFulaSweepLock / markSweepMovedClient / consumeSweepMovedClient` **verbatim**, `getMyDID/getMyDIDKeyPair` over `@functionland/fula-sec-web`, `findBox/refreshRelayCache` re-exported from `services/discoveryClient`, `generateUniqueId` split into `uniqueId.ts` (keeps fula-sec-web out of the shell). Adapted: `aiTransport` (+ `lanIpCache` with `refreshOnce(bloxPeerId, appPeerId)`), `httpAiClient` (over `platform/sse.openSse`), `bleAiClient` (over `BleCommandWriter`), `ble.ts` (re-exports the platform assembler + `safeGetConnectedPeripherals`), `manualBloxIp` / `aiSessionPersistence` (KV store), `clientLogger` (phoneLogger port; `os: 'web'`; `installNetworkLogger` + ring buffer), `diagnosticsUpload` (URL from env), `peerIdConversion` (ethers base58 instead of multiformats), `networkSwitcher` (`useAppKitNetwork`), `clipboard`, `constants` (`FXDiscoveryURL = env.DISCOVERY_URL`, relay cache key/age, `PLUGIN_CATALOG_BASE`, BLE UUIDs, `DEFAULT_NETWORK_NAME`), `index.ts` (`KeyChain` = `platform/secureStore`, `Helper`, `Constants`, `WalletConnectConfigs` = `wallet/chains`).

### contracts (`src/contracts`)

`abis.ts` **verbatim**. `contractService.ts` verbatim except the plan's one-line `new ethers.providers.Web3Provider(web3Provider, 'any')` plus strict-TS patches listed in its header (`(receipt as ethers.ContractReceipt).events?.find`, `provider.request!(…)` ×4, `(error as Error).message`) and an eslint header (`no-explicit-any`, `no-unused-vars`, `prefer-const`) so the file stays diff-able against mobile. `types.ts` verbatim; `config.ts` adapted (`import.meta.env.DEV`, chain ids from `wallet/chainIds`); `contractServiceProvider.tsx` adapted (`platform/notify`) — it is a provider, not a screen.

### wallet (`src/wallet`)

| File | Class | Notes |
|---|---|---|
| `appkit.ts` | Rewritten | `initAppKit({ themeMode })` → `createAppKit({ adapters: [new Ethers5Adapter()], networks, defaultNetwork: skaleEuropaHub, projectId: env.REOWN_PROJECT_ID, metadata, features: { analytics:false, email:false, socials:false, swaps:false, onramp:false }, enableInjected, enableEIP6963, enableWalletConnect, themeMode })`; `getAppKit`, `setAppKitTheme`, `disconnectWallet`. Loaded only via `import()`. |
| `useWallet.ts` | Rewritten (shim) | mobile `useWalletConnectModal`-shaped `{ account, connected, connecting, chainId (hex), provider, sdk:{connect,disconnect,getProvider}, open, close, disconnect, switchNetwork }` over the AppKit hooks. |
| `signChainCode.ts` | Rewritten | byte-identical to mobile `LinkPassword`: `personal_sign` of `'0x' + hex(utf8(new HDKEY(password).chainCode))` with params `[msgHex, account.toLowerCase()]`; unit-tested against a fixed vector. |
| `chains.ts`, `chainIds.ts`, `types.ts`, `index.ts` | Adapted | literal `AppKitNetwork` objects (type import only) for Base + SKALE Europa Hub, `providerMetadata`, `Eip1193Provider`. |

### platform (`src/platform`) — the interfaces WS4 codes against

| Module | Interface |
|---|---|
| `secureStore.ts` | `Service` enum (`DIDPassword`, `Signiture`, `Address`, `FULARootCID`, `FULAPeerId`), `save(username, password, service) → {username, password, service}`, `load(service) → creds \| false`, `reset(service)`, `listServices()`, `wipe()`, `ensurePersistentStorage()`, `isPersisted()`. IDB `fxblox-secure`: store `meta` holds a **non-extractable** AES-GCM-256 `CryptoKey`; store `secrets` holds `{v:1, service, username, iv, ct, createdAt, updatedAt}`; AAD `fxblox|secure|v1|<service>` (a record copied to another slot does not decrypt — tested). |
| `kvStore.ts` | `KeyValueStore { get/set/del/keys }`, `createIdbKvStore()` (`fxblox-kv`/`kv`), `createMemoryKvStore(seed?)`, `kvStore` singleton. |
| `lanHttp.ts` | `lanFetch(url, init, {fetchImpl})`, `lanJson(url, opts) → {data, status, headers}`, `buildLanRequest(url, {method, query, form, timeoutMs, signal})` (cors / no-store / credentials omit / `targetAddressSpace:'local'` for private targets; throws on custom headers), `LanHttpError { kind: 'timeout'\|'unreachable'\|'cors'\|'lna-denied'\|'http'\|'aborted', url, status?, body? }`, `isLanHttpError`, `classifyNetworkFailure` (no-cors probe), `lnaPermissionState`, `API_URL`. |
| `sse.ts` | `SseParser.feed(text) → events[]`, `end()`; `openSse(url, {method, headers, body, signal, fetchImpl}, {onOpen, onMessage, onError, onClose}) → {close(), closed}` (fetch + `ReadableStream`, exactly-once terminal callback). |
| `bluetooth/*` | `BleTransport { id, name, isConnected, attach, write, subscribe, disconnect }`; `BleSession` (Web Bluetooth: `pick()` with `namePrefix` `fulatower`/`fxblox` + `optionalServices`, `attach()` with getPrimaryService retry ×3, `write()` 512-byte cap + optional `chunk <n>/<m>` fragmentation behind `VITE_ENABLE_BLE_CHUNKED_WRITES`, serialized write queue, `subscribe()`, `reconnect()` via `getDevices`/`watchAdvertisements`, `disconnect()`, `onDisconnect`); `BleRegistry` (peerId ↔ device-id map persisted at `fx.bleDeviceMap.v1`, `connectedPeripherals()`, `sessionFor`, `currentMismatches`); `ResponseAssembler.writeToBLEAndWaitForResponse(command, peripheralId, serviceUUID?, characteristicUUID?, timeout = 30000, onStreamFrame?)` (mobile signature; `BleStreamTimeoutError.partialFrames`); `fragmentCommand`, `BleCommandTooLong`, `BleUnavailableError`, `BleNoDeviceError`. |
| `notify.ts` | `toast({type, title, message})`, `setToastSink(fn)`, `useToast()` shim — UI-free; WS4 installs the fx-ui sink. |
| `network.ts`, `visibility.ts` | `isOnline`, `probeInternet` (no-cors `generate_204`), `onOnlineChange`, `connectionInfo`, `onConnectionChange`; `isForeground`, `onVisibilityChange`, `onForeground` (replaces `AppState`). |
| `notifications.ts`, `clipboard.ts`, `share.ts`, `linking.ts`, `deviceInfo.ts`, `locale.ts`, `theme.ts`, `backgroundTasks.ts` (no-op), `qrScanner.ts` (`BarcodeDetector` → `zxing-wasm/reader`), `browserSupport.ts` (pre-existing) | thin browser shims with the mobile call shapes. |

### lib / i18n / models / features / app

- `lib/fula/index.ts` + `types.ts`: the `@functionland/fula-web-client` contract (`FulaNamespace`, `BlockchainNamespace`, `FxbloxNamespace`, `IdentityNamespace`, `FulaClientConfig`, `FulaWebErrorCode`). The namespaces are **lazy proxies**: `fula.x(...)` awaits `import('@functionland/fula-web-client')` and throws `… does not export "fula.x" yet (WS1 in progress)` for a missing member; `loadFulaClient()`, `isFulaClientAvailable()`, `configure()`, `isFulaWebError()`. Tests keep `vi.mock('@/lib/fula')`.
- `i18n/index.ts` + the same locale JSON files (language persisted at `localStorage.userLanguage`).
- `models/*` verbatim (`blox`, `dApps`, `pool`, `account`, `mocks`).
- `features/diagnostics/useAiSession.ts` (reducer verbatim; `AppState` → `onForeground`; `bleManager: BleCommandWriter | null`), `quickStartPrompts.ts` (copy); `features/setup/setupMachine.ts` (pure reducer: `SetupStep`, `SetupContext`, `SetupEvent`, `SetupEffect`, `STEP_ROUTES`, `STEP_PROGRESS`, `canProceed`, `setupReducer`, `stepForPath`) — WS4 wraps it in a screen.
- `app/bootstrap.ts`: `bootstrapDataLayer()` (idempotent: i18n, `startThemeSync`, `waitForHydration`, `loadAllCredentials`, `ensurePersistentStorage`, `installNetworkLogger`, `refreshRelayCache`, `bloxStatusMonitor.start()`), plus lazy loaders `loadWallet`, `loadContracts`, `loadFulaClient`, `loadDiagnostics`. `themeBoot.ts` is the pre-paint theme script (moved out of `index.html` because the CSP has no `'unsafe-inline'` for scripts).
- `config/env.ts` (`env` with defaults, `flag()`, `list()`), `vite-env.d.ts`, `types/fula-sec-web.d.ts` (see deviations).

### Dropped

`backgroundBloxCheck` headless task (→ foreground `bloxStatusMonitor`), `react-native-keychain` (→ `secureStore`), `react-native-ble-manager` (→ `platform/bluetooth`), axios (→ `lanHttp`), NetInfo/AppState/Linking/Share/Clipboard/DeviceInfo (→ platform shims), `useWalletConnectModal` (→ `useWallet` shim), pool `/leave` and `/cancel` API calls (plan), `fula.setAuth` (does not exist in the web client), `multiformats` in `peerIdConversion` (ethers base58 gives the same bytes for `Qm…`/`12D3…` ids — cross-checked in tests), all screens/components/navigation (WS4).

## Build, PWA, CSP, env

- `vite.config.ts`: react, `@tailwindcss/vite`, svgr, `vite-plugin-node-polyfills` (`buffer`, `process`, `events`, `util`, `stream`, `crypto`; globals), `vite-plugin-pwa` (`generateSW`, `registerType: 'prompt'`, `injectRegister: false` — WS4 wires `useRegisterSW`, manifest "FxBlox", `globIgnores: ['**/vendor-appkit-*.js']`, `navigateFallback`, `navigateFallbackDenylist: [/\/version\.json$/]`, `skipWaiting: false`, `clientsClaim: false`, **no runtime route for private-IP http** (unmatched requests fall through to the browser so LNA semantics are untouched), `NetworkOnly` for the cloud/RPC/WalletConnect host list), `VITE_BASE`, `define` (`__APP_VERSION__`, `__GIT_SHA__`, `__BUILD_TIME__`), `es2022`, sourcemaps.
- **Chunking** (`manualChunks` + `output.onlyExplicitManualChunks: true`): the eager module set is computed from Rollup's graph (`getModuleIds` → `isEntry` → `importedIds`); eager React-family modules → `vendor-react`, other eager modules stay with the entry; lazy modules → `vendor-polyfills` / `vendor-ethers` / `vendor-appkit` (AppKit + its whole closure) / `vendor-libp2p` (+ closure) / `vendor-crypto` / `vendor-ec`. Reason: Rollup's `addStaticDependenciesToManualChunk` absorbs every unassigned static dependency of a manual chunk — that pulled the shared `idb-keyval` into `vendor-appkit`, and the entry then preloaded 3 MB of AppKit (observed: 4.66 MB eager). Rollup 4.63's `onlyExplicitManualChunks` turns that absorption off; the dependency closures are listed explicitly to avoid the circular chunks that otherwise appear.
- `index.html`: CSP extended for AppKit/WalletConnect (`img-src` api.web3modal.org / explorer-api.walletconnect.com / imagedelivery.net; `connect-src` wss://relay.walletconnect.com|.org, https://rpc.walletconnect.com|.org, api.web3modal.org, verify.walletconnect.com|.org, explorer-api.walletconnect.com, pulse/keys/notify/echo.walletconnect.org; `frame-src` verify.walletconnect.*; `font-src` https://fonts.reown.com — **unverified**, see open items); the inline theme script became `<script type="module" src="/src/themeBoot.ts">`.
- `.env.example` documents `VITE_BLOX_AP_URL` (default `http://10.42.0.1:3500`), `VITE_DISCOVERY_URL`, `VITE_POOLS_URL`, `VITE_AI_TRAINING_URL`, `VITE_REOWN_PROJECT_ID`, `VITE_ENABLE_BLE_AI`, `VITE_ENABLE_BLE_CHUNKED_WRITES`, `VITE_ENABLE_BLOX_LOGS`, `VITE_ENABLE_GALLERY`, `VITE_FORCE_BLE`, `VITE_RELAY_WT_ADDRS`, `VITE_BASE`.
- `tsconfig.json`: `types: ["vite/client", "web-bluetooth"]`, `paths` for `@/*` and a local override of `@functionland/fula-sec-web` types; `vitest.config.ts`: jsdom, `src/test/setup.ts`, `define` for the build constants, alias of `@functionland/fula-sec-web` to `lib/esm/index.js`.
- `public/icons/icon.svg` added (manifest also references `icon-192.png` / `icon-512.png`, **not created** — see open items).

## Tests (40 files / 534 tests)

- Ported mobile suites (`src/utils/__tests__`): `aiSessionPersistence`, `aiTransport`, `anonymizerCrossRuntime`, `anonymizeTranscript`, `appPeerId`, `ble`, `bleAiClient`, `bloxAiEvents`, `buildFeedbackPayload`, `clientLogger`, `diagnosticsUpload`, `findPendingQuestion`, `helper`, `httpAiClient`, `lanIpCache`, `manualBloxIp`, `parsePendingResponse`, `peerIdConversion` (+ fixture JSON), `uploadTranscriptUrl`.
- New suites: `platform/__tests__/{secureStore, sse, lanHttp, kvStore, network}`, `platform/bluetooth/__tests__/{responseAssembler (over `FakeBleTransport`), fragment (512-byte cap + `chunk n/m`), registry}`, `stores/__tests__/{idbStorage (envelope + recorded mobile blobs through the migrations), bloxsStore.invariants (AUDIT_multi_device S2/S3/M2/M4/H2 + generation guards), pluginsStore, userProfileStore}`, `services/__tests__/{discoveryClient, bloxStatusMonitor, poolApiService}`, `wallet/__tests__/signChainCode`, `hooks/__tests__/useHotspotReachable`, `lib/fula/__tests__/index`, `contracts/__tests__/contractService`, `features/diagnostics/__tests__/useAiSession`, `features/setup/__tests__/setupMachine`.
- Helpers: `src/test/setup.ts` (fake-indexeddb, jest-dom, `matchMedia` + `navigator.storage` shims), `src/test/helpers/{waitFor, fakeBleTransport, sseResponse}.ts`.

## Deviations from the plan (and why)

1. **`lib/fula` namespaces are lazy proxies** rather than direct re-exports: a static re-export would put libp2p (394 KB) + fula-web-client into the shell; the proxy defers the import to the first call and gives a clear error for members WS1 has not shipped yet. `export type { FulaWebError }` remains a type re-export.
2. **`dAppsSettingsStore.setAuth`** keeps its signature but no longer calls `fula.setAuth` (it does not exist in the web client, and mobile's call was dead code); it only funds the account when an id is present.
3. **`useTasksLogic({ navigateToPools })`** takes navigation as a parameter (no router in WS3).
4. **`clientLogger` reports `os: 'web'`** — the blox-ai upload schema enum on the server currently allows `android | ios`; the server (or WS4's upload path) must accept `web` before diagnostics uploads from the browser will validate.
5. **`peerIdConversion` uses `ethers.utils.base58`** instead of `multiformats` (same bytes; keeps libp2p out of the contracts path). Note the mobile tests expected some `Qm…` ids to round-trip through bytes32 — they cannot (a CIDv0 hash carries more than 32 bytes of prefix+digest), so the web tests assert the mobile behaviour (error + fallback) instead.
6. **`httpAiClient` calls `onComplete` before marking the stream closed.** Mobile sets `closed = true` first and then `safeComplete()` is short-circuited — a latent bug that surfaced as a hang under Vitest; the order is fixed here (documented in the file).
7. **`ResponseAssembler`** drops mobile's 2 s post-connect sleep and `retrieveServices` retry loop; `BleSession.attach()` owns the retry (×3 on `getPrimaryService`).
8. **`BleRegistry`** replaces mobile's `safeGetConnectedPeripherals()` (a `ble.ts` wrapper keeps the name); the peerId ↔ peripheral map that the mobile audit flagged as missing is persisted at `fx.bleDeviceMap.v1`.
9. **Chains are literal `AppKitNetwork` objects** (only a type import from `@reown/appkit/networks`) instead of `defineChain` so `wallet/chains.ts` can be imported by eager code (hooks/config) without loading AppKit.
10. **`@functionland/fula-sec-web` types are overridden locally** (`src/types/fula-sec-web.d.ts` via tsconfig `paths`; Vitest alias to `lib/esm/index.js`): the package's own `.d.ts` is `export = main` of a path that does not exist, and its `exports` map has no Node ESM condition. The runtime import is untouched.
11. **`themeBoot.ts` module** instead of the inline theme script (CSP `script-src 'self'`).
12. **`rehydrateHandler`** marks a store hydrated even when persist rehydration throws (logs the error, continues with defaults) — otherwise a corrupt blob would block the shell forever.
13. **`contractService.ts`** carries four strict-TS patches + an eslint header (listed in the file header) in addition to the plan's `Web3Provider(…, 'any')` line.
14. **`discoveryClient` retries without `x-fula-client`** when the header triggers a CORS failure (the discovery worker's preflight is WAF-blocked today, per the WS1 status).
15. **`lanIpCache.refreshOnce(bloxPeerId, appPeerId)`** replaces the mobile signature that took a fula handle.
16. New files not in the mobile tree: `services/pluginCatalog.ts`, `app/bootstrap.ts`, `utils/uniqueId.ts`, `platform/*`, `stores/persist/idbStorage.ts`, `wallet/signChainCode.ts`, `features/setup/setupMachine.ts`.
17. **Chunk policy** goes beyond the plan's regex list (`onlyExplicitManualChunks` + graph-computed eager set + `vendor-ec` / `vendor-polyfills` leaf chunks) — required to actually keep AppKit/ethers lazy (see Build).

## Open items (for WS4 / WS1 / firmware)

1. **Real-browser verification** of: Web Bluetooth pairing + 512-byte writes + `chunk n/m` fragmentation against a Blox (the firmware must support the fragmented form before `VITE_ENABLE_BLE_CHUNKED_WRITES` is turned on); Chrome LNA prompt on `http://10.42.0.1:3500` and the `lna-denied` / `cors` classification; AppKit modal + WalletConnect relay under the CSP; the PWA update prompt.
2. **CSP**: `font-src https://fonts.reown.com` is a guess from the AppKit docs and is unverified; if AppKit fonts 404/violate in the console, adjust. The full WalletConnect host list should be checked against the AppKit 1.8.x network log once a wallet flow is run.
3. **Manifest icons**: `icons/icon-192.png` and `icons/icon-512.png` are referenced by the manifest but only `icon.svg` exists — add the PNGs (design asset) or drop the entries.
4. **`@functionland/fula-web-client` exports**: the app's `lib/fula/types.ts` contract and WS1's `STATUS-fula-web-client.md` were reconciled by WS1 (`configure({ relayWtAddrs, requestTimeoutSec })`, 2-arg `fula.setAuth`); anything the app calls that WS1 does not export throws the explicit `… does not export "<ns>.<fn>" yet` error at call time rather than at import — WS4 should surface that as a toast.
5. **blox-ai upload schema**: accept `os: 'web'` (deviation 4).
6. **`vendor-appkit` is 3.8 MB raw / 1.05 MB gzip** even when lazy; `enableWalletConnect`/Coinbase/Base SDKs are the bulk. If wallet connection ends up rarely used, consider `enableCoinbase: false` and dropping the Base account SDK (untested — flagging only).
7. **Advisor coverage**: only agy (Google family) reviewed either round; Cursor, Codex, Kimi K2.7, GLM-5.2 and MiMo all failed for account/provider reasons (details in the two advisor sections). An uncorrelated second review (Codex or Cursor once their seats are fixed) is still worth running on `secureStore`, `lanHttp` and the store invariants before WS4 builds on them.

## Dependencies

**No packages were added or installed.** Everything used (`@reown/appkit`, `@reown/appkit-adapter-ethers5`, `ethers@5`, `@functionland/fula-sec-web`, `idb-keyval`, `zustand`, `i18next`/`react-i18next`, `zxing-wasm`, `vite-plugin-pwa`, `vite-plugin-node-polyfills`, `vite-plugin-svgr`, `fake-indexeddb`, `@testing-library/jest-dom`, `@types/web-bluetooth`, `vitest`, `jsdom`) was already declared in `apps/fxblox-web/package.json` and installed at the workspace root. The only `package.json` change is a `test:watch` script.

## Files touched outside `src/`

`apps/fxblox-web/{index.html, package.json, tsconfig.json, vite.config.ts}` (modified); `apps/fxblox-web/{.env.example, vitest.config.ts, public/icons/icon.svg}` (new); this file.

## Advisor round 2 addendum (chunking policy)

Fired agy, Codex, Cursor and Kimi K2.7 with the final `manualChunks` policy and the chunk graph above.

| Advisor | Outcome |
|---|---|
| Cursor (Composer 2.5) | **no reply** — `Authentication required. Please run 'agent login' first` (exit 1); re-auth with `cursor-agent login` |
| Kimi K2.7 (Cloudflare Workers AI) | **no reply** — HTTP 403 code 5035: `@cf/moonshotai/kimi-k2.7-code is not available on the Workers Free plan` (deterministic plan-gating, not transient) |
| Codex (GPT-5.x) | **no reply** — HTTP 402 `{"detail":{"code":"deactivated_workspace"}}` on every request (account/workspace state; `codex login` / account check needed) |
| agy (Antigravity) | see below |

agy's verdict (the only reply): the approach is sound — `manualChunks` runs after the module graph is complete, `importedIds` is static-only (dynamic imports live in `dynamicallyImportedIds`), the absence of a `Circular chunk` warning means the chunk graph is a DAG so evaluation order/TDZ is not at risk, and a lazy chunk resolving `idb-keyval` from the already-evaluated entry chunk is the optimal outcome.

| agy item | Verdict | Change |
|---|---|---|
| `eagerModules` is memoised at module scope, so `vite build --watch` would reuse a stale set after an import changes from dynamic to static | agreed | added a tiny inline plugin `fxblox:reset-eager-chunk-cache` whose `buildStart()` resets the cache per build; re-ran typecheck/lint/build — all green, eager set unchanged (321 KB) |
| A future secondary HTML entry or worker would also be `isEntry` and its static deps would count as eager | acknowledged, no change: today the only root is `index.html`; Vite bundles workers in a separate Rollup build, and a second HTML page's static deps *are* eager for that page. Revisit if a second entry is ever added (filter the roots to `index.html`). | none |
| `id.replace(/\\/g, '/')` is redundant (Vite normalises ids to POSIX) | agreed, left in place (harmless) | none |
| Trailing-slash package boundaries in the regexes (`buffer` vs `buffer-xor`) | agy: correct as written | none |

Operational note from the relay: the first `agy` invocation failed because the prompt contained double quotes that Windows PowerShell 5.1 passes unescaped to native argv; the relay retried with `\"` escaping. This is an advisor-harness quirk, not a code finding.

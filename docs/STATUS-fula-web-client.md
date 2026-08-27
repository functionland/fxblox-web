# WS1 status — `packages/fula-web-client`

_Last updated 2026-08-27 (implementation session). No commits were made; everything is in the working tree._

## Verification (exact results)

| Check | Command (from `E:\GitHub\fxblox-web-app`) | Result |
|---|---|---|
| Typecheck | `npm run typecheck -w packages/fula-web-client` | clean (`tsc --noEmit -p tsconfig.json`, exit 0, no output) |
| Tests | `npm test -w packages/fula-web-client` | **8 files, 58 tests, all passed** in 2.98 s (identity 4, signing 3, httpOverStream 17, actions 7, discovery 9, dial 4, clock 2, e2e-node 12 @ 399 ms) |
| Lint (package) | `npx eslint packages/fula-web-client` | clean (exit 0, no output) |
| Lint (workspace) | `npm run lint` (`npx eslint . -f json` for the count) | **clean at the last run: 0 errors, 0 warnings across the workspace.** Earlier runs in this session showed 20 → 3 findings, all in files owned by other workstreams (`apps/fxblox-web`, `packages/fx-ui`) that were fixed in parallel; none of them was ever in `packages/fula-web-client` |
| Browser bundle | `npx esbuild packages/fula-web-client/src/index.ts --bundle --platform=browser --format=esm` | exit 0; 1 110 578 bytes (unminified ESM); no `node:` imports, no `@libp2p/tcp`, no "Only supported in browsers" stub (the `browser` field mappings applied); one guarded `process.env` reference in a dependency (the app's `nodePolyfills` covers it). `npm run build -w apps/fxblox-web` also passes, but the app shell does not import the package yet (31 modules), so it proves nothing about this package |

The golden vectors from go-fula (`test/vectors/{identity,signing}.json`) still pass byte-for-byte.

## External review (standing advisor rule)

Fired on the finished code: agy, Codex, Kimi K3, Cursor, GLM-5.2, Kimi K2.7 (Cloudflare), MiMo. **Only agy (Antigravity) responded.** The others failed for account/provider reasons unrelated to this code — the same seats §8 of the plan recorded as down: Codex `402 deactivated_workspace`; Cursor OAuth token rejected (`cursor-agent login`); Kimi K2.7 on Cloudflare `403` (model no longer on the Workers Free plan); Kimi K3 CLI provider `500` (persistent today; its agent def also needs `--plan` dropped for `-p` mode); GLM-5.2 `429` on every call including a 50-token probe; MiMo `403 telegram_required` (bynara.id now needs a one-time Telegram binding). The built-in `advisor` tool is not available in this session.

agy's findings and what was done with them:

| agy item | Verdict | Change |
|---|---|---|
| Sequential `await write` before reading could deadlock on muxer back-pressure if the server answers before consuming the body | agreed (low likelihood — bodies are tiny JSON and go-fula reads the body before verifying — but cheap to fix) | `requestOverDuplex` now writes and reads concurrently; if the response completes before the request was fully sent the stream is aborted instead of waiting; `streamToByteDuplex.write` sends in 64 KiB slices |
| Adopting a pre-existing libp2p connection reset its age/bytes | agreed | `trackConnection` uses `connection.timeline.open`; `needsRedial` already honours the relay's reported `limits.bytes/seconds` |
| Suspect (post-background) connections reused without a liveness check | agreed | `ensureConnected` pings a suspect connection (5 s, `runOnLimitedConnection`) and redials on failure |
| `circuitRelayTransport()` "defaults to discovering relays — pass `discoverRelays: 0`" | **rejected**: that option does not exist in `@libp2p/circuit-relay-v2` 4.2.12; discovery/reservations start only in `listener.listen()` (`transport/listener.js:58-62`), i.e. only when the node listens on `/p2p-circuit`. With `addresses.listen: []` the node is a pure dialer | none (documented here and in `node.ts`) |
| `DialOptions.force` "does not exist" | **rejected**: `@libp2p/interface` 3.3.0 `DialOptions { force?: boolean }` (read from `dist/src/index.d.ts:434`) | none |
| `maxConnections: 8` too tight while candidates churn | partially agreed (js-libp2p prunes rather than refuses, but headroom is free) | default raised to 16 (plan said 8 — deviation noted) |
| Mapping every reset on a relayed connection to `RELAY_LIMIT` masks a crashed Blox | agreed | `mapStreamError` reports `RELAY_LIMIT` only near the limits (age > 25 min, bytes > 10 MiB, relay-reported budget < 1 MiB / < 60 s, or libp2p's own `DurationLimit`/`TransferLimit` errors), otherwise `STREAM_ERROR` with a "relayed connection" note (unit-tested in `test/dial.test.ts`) |
| Unbounded trailer loop | agreed | total trailer bytes are capped at the 8 KiB header limit |
| 401 retry-once, lifecycle mutex/semaphore, error-name matching, header-injection guards, no secret logging | agy: sound | none |

Contract fit with the app (`apps/fxblox-web/src/lib/fula/types.ts`, read after the fact): `configure()` now also accepts the app's `relayWtAddrs: string[]` (keyed to relays by `/p2p` suffix or host) and `requestTimeoutSec`; `fula.setAuth` accepts the app's 2-argument call.

## Delivered (all under `packages/fula-web-client`)

| Plan item | File(s) | Notes |
|---|---|---|
| 1. libp2p node | `src/core/node.ts`, `src/node/createNodeNode.ts` | `createBrowserNode(privateKey, opts)`: webTransport + circuitRelayTransport, noise, yamux, identify, `ping({ runOnLimitedConnection: true })`, permissive gater (`denyDialMultiaddr: () => false` — the default browser gater denies private addrs), `addresses.listen: []` (pure dialer), `connectionManager { maxConnections: 8, dialTimeout: 20 s }`, `peerDiscovery: []`. Node variant swaps WebTransport for `@libp2p/tcp` and shares `buildNodeOptions`. Exported as `@functionland/fula-web-client/node`. |
| 2. Discovery | `src/core/discovery.ts` | Tiers: `bloxAddr` → `/find-box` → cached `/relays` (`fx.relayCache.v1` in the injected KV) → hardcoded relays (`relay.dev.fx.land`, `relay.fula.network`). Certhash sources per relay: `/relays[].addrs` → delegated routing `GET …/routing/v1/peers/<R>` → build-time `relayWebTransportAddrs`; cached per relay (`fx.relayWt.v1:<R>`, 24 h, stale value kept as last resort). TCP circuits are rewritten to `<WT>/p2p/R/p2p-circuit/p2p/B`; the TCP forms are appended last so a Node client can still use them (the client filters with `node.isDialable`). `configure({ findBox, relays, fetch, kv, relayWebTransportAddrs, discoveryUrl, delegatedRoutingUrl, … })`. All network calls are best-effort (the discovery worker's preflight is WAF-blocked today). |
| 3. Dial | `src/core/dial.ts` | Ordered candidates, 20 s each / 90 s overall / AbortSignal, `force` redial, `TrackedConnection { openedAt, bytes, relayed }`, `needsRedial` (28 min / 12 MiB, or the relay's own reported limits), error mapping with priority NO_RESERVATION > RELAY_LIMIT > NO_CERTHASH > UNSUPPORTED_PROTOCOL > DIAL_TIMEOUT > DIAL_FAILED; stream resets on relayed connections → RELAY_LIMIT. |
| 4. HTTP over stream | `src/core/httpOverStream.ts` | `ByteDuplex` adapter of a libp2p v3 `Stream` (`send` + `onDrain`, async iteration, `close` only after the full read), request serializer (`POST /<action>`, `Host: <peer>.invalid`, `Content-Length`, `Connection: close`, header-injection guards), incremental parser (Content-Length / chunked incl. extensions+trailers / read-to-EOF; EOF at a chunk boundary is accepted; 8 KiB header cap, 4 MiB body cap), abort → TIMEOUT. Also `HttpRequestParser` + `serializeResponse` for the test box / future `tools/fake-blox`. Unit-tested with an in-memory duplex that emulates kubo's close-on-half-close (`test/helpers/memoryDuplex.ts`), including a negative test showing a naive client loses the body. |
| 5. Actions | `src/core/actions.ts` | Full table with wire names, bodies and the status the Go client accepts (verified against go-fula `blockchain/interface.go`, `mobile/blockchain.go` and the per-action client functions). `fetch-container-logs` uses `ContainerName`/`TailCount`; `account-fund` is the hand-built `{"amount":1000000000000000000,"to":…}`; `fula-pool-join` carries the BLOX peer id. |
| 6. Client | `src/core/client.ts` | Serialised `newClient` (promise-chain mutex; reuse when same identity + bloxAddr and `refresh=false`), identity derivation, node creation via `nodeFactory`, `bloxPeerId` from the trailing `/p2p/<id>` of `bloxAddr` (empty addr only with `exchange==='noop'`, as go-fula), dial + `/x/fula-ping` probe (resolves with the peer id even if they fail), `isReady`, `checkConnection(timeoutSec)` (ping probe → libp2p ping fallback, never rejects), `ping` (3 libp2p pings, JSON like go-fula), `logout`, `shutdown`, `request` (65 s timeout, ≤ 4 in flight, `runOnLimitedConnection`), clock offset from the ping `timestamp` (**milliseconds** in `ping_server.go`; seconds also accepted), 401 → re-sync → retry once → `NOT_AUTHORIZED`, proactive redial, `visibilitychange` → connection suspect + discovery refresh. `getClientState()` for the UI. |
| 7. Shim + protocols | `src/core/nativeShim.ts`, `src/protocols/{fula,blockchain,fxblox}.ts`, `src/types/{blockchain,fxblox}.ts` | `FulaNativeModule` surface as `Promise<string>` functions; protocols copied from react-native-fula 1.58.x with the JSON-parse / resolve-with-error quirks preserved; `setAuth`, `registerLifecycleListener` no-ops; logging never includes identities. |
| 8. Log + clock | `src/core/log.ts`, `src/core/clock.ts` | 1000-entry ring buffer, `globalThis.__fula.logs`, `enableDebug`, `getDebugLog`, `setLogSink`; `ClockSync` with midpoint RTT correction. |
| 9. Tests | `test/*.test.ts` | Golden tests untouched; parser/duplex, actions, discovery, clock unit tests; `test/e2e-node.test.ts` runs the real client against a js-libp2p fake Blox that verifies the X-Fula headers exactly like go-fula (`buildSignedDigest` + Ed25519 pubkey from the peer id + authorizer set + ±300 s), emulates kubo's forwarder, and exercises: peer-id parity, signed POST wire format, `bloxFreeSpace`, `listActivePlugins`, `getClusterInfo`, `checkConnection`, `ping` (3/3), `account-fund` body literal, `fula-pool-join` body, 1 MiB chunked response, HTTP_ERROR on unexpected status, 401 → clock re-sync (box clock +400 s) → retry, unauthorized identity → NOT_AUTHORIZED after exactly 2 attempts, client reuse/logout/NOT_INITIALIZED, `noop` exchange rule, unreachable box (DIAL_FAILED fast, newClient still resolves). |
| 10. Docs | `README.md`, this file | |

`src/index.ts` exports `fula`, `blockchain`, `fxblox`, `identity`, `signing`, `configure`, `FulaWebError`, `enableDebug`, `getDebugLog` (+ `getClientState`, `ACTIONS`, `createBrowserNode`, discovery helpers, types).

## Deviations from the plan (and why)

1. **Extra error codes**: `DIAL_FAILED`, `STREAM_ERROR`, `NOT_INITIALIZED`, `UNSUPPORTED_ACTION`, `INVALID_ARGUMENT` were added to the plan's set — without them non-timeout dial failures and pre-`newClient` calls had no honest code (`errors.ts` documents each).
2. **Always POST with `{}` for body-less actions** (plan) — note go-fula's own client sends GET with a nil body for those; the server never checks the method and every handler decodes `{}` fine.
3. **Expected statuses mirror the Go client exactly**: 200 for blox/hardware/autopin actions, 202 for `handleAction`/logs/sizes/pools/accounts, and **'any' for plugin actions** (the Go plugin client functions do not check the status; go-fula answers plugin errors as `http.Error(500, text)` and the RN layer then fails on JSON.parse — same observable behaviour here).
4. **`newClient` dials + probes inside the call** (plan) with the 90 s overall dial budget; it is configurable (`connectOnNewClient`) because mobile's `newClient` does not connect and the app's `initFula` loop may prefer that.
5. **`/x/fula-ping` `timestamp` is milliseconds** (`UnixMilli` in `ping_server.go`), not seconds as the plan text implies; `clock.ts` accepts both.
6. **Unsupported react-native-fula methods** reject with `UNSUPPORTED_ACTION` instead of guessing wire formats: `initFula`/`init` (no WNFS), `chatWithAI`/`getChatChunk`/`streamChunks` (streaming over a long-lived stream), `createPool`, `votePoolJoinRequest`, `newStoreRequest`, `removeReplicationRequest`, `removeStorer`, `removeStoredReplication`, `transferToFula` (request shapes not verified). None of these is in the WS3 contract.
7. **`find-bestandtarget-inlogs` body** is `{"NodeContainerName","TailCount"}` — verified in `go-fula/wap/pkg/wifi/properties.go:80` (`FindBestAndTargetInLogsRequest` has no json tags, like `FetchContainerLogsRequest` at line 75).
8. **`uint8arrays`, `it-length-prefixed`, `p-defer`** are declared in `package.json` but unused (the plan listed them); they can be dropped in a later cleanup. **No new dependencies were needed.**
9. Package `exports` gained `./node` (TCP variant for tests/tools) and `./http` (parser/serializer for `tools/fake-blox`).
10. `connectionManager.maxConnections` defaults to 16 instead of the plan's 8 (see the review table).
11. `mapStreamError` only blames the relay (`RELAY_LIMIT`) for resets that happen near the relay limits; earlier resets on a relayed connection are `STREAM_ERROR` (the connection is dropped and redialed on the next call either way).

## Open items

- **Browser spike gates (b)–(e) are still pending**: nothing here has talked to the real relay/Blox over WebTransport yet. The candidate rewrite was validated against the live delegated-routing answer shape from gate (b0), but the WebTransport handshake, the circuit HOP to the real Blox, and the relay-limit behaviour (`RELAY_LIMIT` mapping relies on `StreamResetError`/`ConnectionClosedError` names and the `RESOURCE_LIMIT_EXCEEDED` status text) need the real network.
- `circuitRelayTransport()` with no `/p2p-circuit` listen address should stay a pure dialer (no reservations / relay discovery) — believed correct from the js-libp2p v3 source, verify in gate (b) by watching the relay logs / `node.getConnections()`.
- `/relays` response shape is parsed defensively (`parseRelaysResponse` accepts `[{peerId|peer_id|id, multiaddr|addr|address, addrs?}]` or `{relays:[…]}`) — pin it once PR-C lands. Same for `/find-box` (`[{multiaddr}]` per the plan).
- `checkConnection` falls back to a libp2p ping when `/x/fula-ping` is not mounted (older firmware) — that only proves reachability, not that go-fula is up; the UI should treat `UNSUPPORTED_PROTOCOL` on actions as "update your Blox".
- Playwright e2e against the kubo-based `tools/fake-blox/libp2p` harness (WS7) is not part of this workstream; the Node e2e test covers the client logic, not real kubo/WebTransport behaviour.
- The 20 workspace lint errors in `apps/fxblox-web` and `packages/fx-ui` belong to WS3/WS4/WS2.

## Pre-mortem (assume it failed in the browser)

| Cause | Tripwire | Mitigation |
|---|---|---|
| WebTransport dial fails (certhash stale, UDP blocked) | `NO_CERTHASH` from `dialCandidates`; discovery refresh on the next attempt | delegated routing is re-queried on `refresh`; PR-C adds `/relays[].addrs`; PM1 fallbacks (AutoTLS websockets) |
| Circuit HOP refused (`NO_RESERVATION`) | error code surfaced with the candidate | UI: "Blox offline / paired to another relay"; other relay candidates are tried first |
| kubo forwarder closes before the body (misread of the half-close rule) | `BAD_RESPONSE: truncated…` | the client never half-closes early (`requestOverDuplex`); the memory-duplex test guards the rule |
| Relay resets long transfers (>16 MiB) | `RELAY_LIMIT` | proactive redial at 12 MiB; body cap 4 MiB per response |
| Clock skew > 5 min → every action 401 | `NOT_AUTHORIZED` after one retry, offset visible in `getClientState()` | offset learned from `/x/fula-ping` (ms/s tolerant); UI shows the derived peer id for comparison |
| A stale libp2p connection is reused after backgrounding | `suspect` flag + `connection.status` check; fatal stream errors drop the connection | `visibilitychange` handler; every request maps a reset to a redial on the next call |

# @functionland/fula-web-client

Browser (js-libp2p v3) client for go-fula Blox actions. It mirrors the `fula`, `blockchain` and `fxblox`
namespaces of `@functionland/react-native-fula` 1.58.x so the FxBlox web app can call the same functions the
mobile app calls — with the **same identity** (a Blox paired from the phone is manageable from the browser
without re-pairing).

```
browser ──WebTransport──▶ relay (kubo) ──/p2p-circuit──▶ Blox kubo ──/x/fula-blockchain──▶ go-fula :4020
                                                                   └─/x/fula-ping───────▶ go-fula :4021
```

## API

```ts
import { fula, blockchain, fxblox, identity, signing, configure, FulaWebError, enableDebug, getDebugLog } from '@functionland/fula-web-client';

const appPeerId = await fula.newClient(secretKeyCsv, '', bloxAddr, '', false, true, false); // "12D3KooW…"
await fula.checkConnection(20);                    // /x/fula-ping round trip (fallback: libp2p ping) → boolean
const space = await blockchain.bloxFreeSpace();    // { size, used, avail, used_percentage }
const plugins = await fxblox.listActivePlugins();  // { status: true, msg: ['blox-ai'] }
await fula.logout(secretKeyCsv, '');
```

| Namespace | Functions |
|---|---|
| `fula` | `newClient`, `isReady`, `checkConnection(timeoutSec=20)`, `ping(timeoutSec=60)`, `logout`, `shutdown`, `setAuth` (no-op), `registerLifecycleListener` (no-op), `init` (rejects `UNSUPPORTED_ACTION` — no WNFS in the browser) |
| `blockchain` | `createAccount`, `checkAccountExists`, `accountFund`, `listPools`, `joinPool`, `leavePool`, `joinPoolWithChain`, `leavePoolWithChain`, `cancelPoolJoin`, `listPoolJoinRequests`, `batchUploadManifest`, `replicateInPool`, `listAvailableReplicationRequests`, `bloxFreeSpace`, `getAccount`, `assetsBalance`, `autoPinPair`, `autoPinRefresh`, `autoPinUnpair` (+ `createPool`, `votePoolJoinRequest`, `newStoreRequest`, `removeReplicationRequest`, `removeStorer`, `removeStoredReplication`, `transferToFula` which reject `UNSUPPORTED_ACTION`) |
| `fxblox` | `wifiRemoveall`, `reboot`, `partition`, `eraseBlData`, `fetchContainerLogs`, `findBestAndTargetInLogs`, `getFolderSize`, `getDatastoreSize`, `getDockerImageBuildDates`, `getClusterInfo`, `listPlugins`, `listActivePlugins`, `installPlugin`, `uninstallPlugin`, `showPluginStatus`, `getInstallStatus`, `getInstallOutput`, `updatePlugin` |
| `identity` | `identityFromSecretKey(sk)`, `peerIdFromSecretKey(sk)`, `identityStringFromSecretKey(sk)` |
| `signing` | `signHeaders(identity, action, body, unixSec)`, `buildSignedMessage`, `buildSignedDigest` |

The protocol functions are near-verbatim copies of react-native-fula's, **including their quirks**: most
`blockchain.*` functions *resolve* with the error object instead of rejecting (`.catch((err) => err)`), non-JSON
bodies are returned as raw strings, and the plugin functions' `status:false` path resolves after a second parse.
apps/box relies on this behaviour, so it is preserved on purpose.

### `configure(options)`

```ts
configure({
  kv: indexedDbStore,                 // KeyValueStore { get, set, delete } — caches /relays + certhashes (default: in-memory)
  fetch: window.fetch,                // injectable for tests
  relays: [...],                      // override the hardcoded fallback relays
  relayWebTransportAddrs: { [relayPeerId]: ['/dns/…/webtransport/certhash/…'] }, // build-time certhashes (VITE_RELAY_WT_ADDRS)
  findBox: async (bloxPeerId) => [...multiaddrs], // full override of discovery (tests / fake harness)
  nodeFactory: createNodeNode,        // Node variant (TCP) for Vitest; default createBrowserNode
  nodeOptions: { maxConnections: 16 },
  requestTimeoutMs: 65_000, perCandidateMs: 20_000, overallDialMs: 90_000, maxInFlight: 4,
  maxConnectionAgeMs: 28 * 60_000, maxConnectionBytes: 12 * 1024 * 1024, connectOnNewClient: true,
  // aliases used by the app's FulaClientConfig contract:
  relayWtAddrs: ['/dns/relay.dev.fx.land/udp/4001/quic-v1/webtransport/certhash/…'], // keyed to a relay by /p2p suffix or host
  requestTimeoutSec: 65,
});
```

## Identity parity with mobile

Mobile passes `keyPair.secretKey.toString()` (a `Uint8Array` → `"d0,d1,…,d63"`) to go-fula, whose
`mobile/keygen.go` does `seed := sha256.Sum256([]byte(secret))` and `crypto.GenerateEd25519Key(bytes.NewReader(seed))`.
`src/core/identity.ts` does exactly that (`sha256(utf8(Array.from(secretKey).join(',')))` → Ed25519 seed → peer id),
and `test/vectors/identity.json` / `signing.json` — emitted by go-fula's own code — pin the seed, the protobuf
private key, the peer id and nine Ed25519 signatures byte-for-byte.

Signed requests (`src/core/signing.ts`, parity with `go-fula/blockchain/auth_signed.go`):

```
message   = action + ":" + unixSeconds + ":" + base64std(sha256(body))
digest    = sha256(utf8(message))
X-Fula-Peer-ID / X-Fula-Timestamp / X-Fula-Signature = base64std(Ed25519.sign(digest))
```

The server tolerates ±300 s; the client learns the Blox clock offset from `/x/fula-ping`'s `timestamp` and, on a
401, re-learns it and retries **once** before surfacing `NOT_AUTHORIZED` (go-fula answers 401 for both a bad
signature and an unauthorized peer).

## Wire protocol

Every action is `POST /<action>` over a fresh `/x/fula-blockchain` stream with `Host: <bloxPeerId>.invalid`,
`Content-Type: application/json`, `Content-Length`, `Connection: close` and the three signed headers. Bodies and
expected statuses live in `src/core/actions.ts` (verified against go-fula):

| Wire action | Body | OK |
|---|---|---|
| `blox-free-space`, `reboot`, `wifi-removeall`, `partition`, `get-cluster-info`, `get-account`, `get-docker-image-build-dates`, `erase-blockchain-data` | `{}` | 200 |
| `list-plugins`, `list-active-plugins`, `install-plugin` `{plugin_name,params}`, `uninstall-plugin` / `get-install-status` / `update-plugin` `{plugin_name}`, `get-install-output` `{plugin_name,params}`, `show-plugin-status` `{plugin_name,lines}` | | any (the Go client does not check) |
| `fetch-container-logs` `{"ContainerName","TailCount"}` (Go struct has no json tags), `find-bestandtarget-inlogs`, `get-folder-size` `{folder_path}`, `get-datastore-size` `{}` | | 202 |
| `account-create` `{}`, `account-exists` `{account}`, `account-fund` `{"amount":1000000000000000000,"to":…}` (bare `BigInt`), `asset-balance` | | 202 |
| `fula-pool-join` `{pool_id, peer_id:<BLOX peer id>, chain_name}`, `fula-pool-leave` `{pool_id, chain_name}`, `fula-pool-cancel_join`, `fula-pool-poolrequests`, `fula-pool`, `fula-manifest-*`, `replicate` | | 202 |
| `auto-pin-pair` `{pinning_token,pinning_endpoint}`, `auto-pin-refresh`, `auto-pin-unpair` | | 200 |

HTTP/1.1 is hand-rolled (`src/core/httpOverStream.ts`) because of two kubo facts: its `p2p listen` forwarder
**full-closes the stream when the client half-closes** (so the write side is only closed after the whole
response was read), and with `Connection: close` **EOF is a valid body terminator** (Content-Length and chunked
framing are still honoured). Caps: 8 KiB headers, 4 MiB body.

## Dial strategy

Candidates for Blox `B`, in order (`src/core/discovery.ts`), each tried for 20 s, 90 s overall:

1. the `bloxAddr` passed to `newClient` (a TCP relay circuit is rewritten to WebTransport);
2. `POST discovery.fula.network/find-box {peerId}` circuit addresses (entries already carrying
   `/webtransport/certhash/` are used as-is);
3. `GET discovery.fula.network/relays` (cached in the injected KV as `fx.relayCache.v1`; PR-C adds `addrs[]`);
4. the hardcoded relays `relay.dev.fx.land` and `relay.fula.network`.

A TCP-only relay `R` becomes `<R WebTransport addr with certhash>/p2p/R/p2p-circuit/p2p/B`. Certhash sources:
`/relays[].addrs` → delegated routing `GET delegated-ipfs.dev/routing/v1/peers/R` → build-time
`relayWebTransportAddrs`; cached per relay for a day and refreshed after a WebTransport/certhash dial error and on
foreground (`visibilitychange`). The discovery worker's CORS preflight is currently blocked by a WAF, so every
network call is best-effort and falls through. Streams are opened with `runOnLimitedConnection: true`.

Relay circuits are limited to 30 min / 16 MiB by kubo's RelayService; the client redials proactively at 28 min /
12 MiB and reports a reset slipping through as `RELAY_LIMIT`.

## Errors

`FulaWebError.code`: `NOT_AUTHORIZED`, `HTTP_ERROR` (unexpected status; message is go-fula's
`unexpected response: <status> <body>`), `BAD_RESPONSE`, `NO_CANDIDATES`, `NO_CERTHASH`, `DIAL_TIMEOUT`,
`NO_RESERVATION` (Blox offline / not on this relay), `RELAY_LIMIT`, `CIRCUIT_DATA_CAP`, `TIMEOUT`,
`CLIENT_CLOSED`, `UNSUPPORTED_PROTOCOL` (older firmware), `DIAL_FAILED`, `STREAM_ERROR`, `NOT_INITIALIZED`,
`UNSUPPORTED_ACTION`, `INVALID_ARGUMENT`.

## Debugging

`enableDebug(true)` mirrors the ring-buffer log to the console; `getDebugLog()` returns the last 1000 entries;
in browsers the live buffer is `globalThis.__fula.logs`. Identities/secret keys are never logged. For libp2p's own
logs set `localStorage.debug = '*libp2p:*'`.

## Tests

```sh
npm test -w packages/fula-web-client        # golden vectors, HTTP parser, actions, discovery, clock, e2e (Node TCP)
npm run typecheck -w packages/fula-web-client
```

`test/e2e-node.test.ts` runs the real client (with `@functionland/fula-web-client/node`'s TCP node) against a
js-libp2p "Blox" that verifies the signed headers exactly like go-fula and emulates kubo's close-on-half-close.

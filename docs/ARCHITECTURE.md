# Architecture (condensed)

```
browser (https://blox.fx.land, Chromium)
 ├─ apps/fxblox-web            React 19 + react-router v7; zustand stores ported from apps/box
 │    platform/                 kvStore (IndexedDB), secureStore (WebCrypto AES-GCM, non-extractable key),
 │                              lanHttp (fetch + Chrome LNA), bluetooth (Web Bluetooth), sse (fetch+ReadableStream),
 │                              network, clipboard, share, linking, deviceInfo, locale, qrScanner, visibility
 │    wallet/                   @reown/appkit + @reown/appkit-adapter-ethers5 (ethers v5), signChainCode()
 │    features/                 setup wizard, blox dashboard, plugins, diagnostics (Blox AI), devices, settings
 ├─ packages/fx-ui             Tailwind v4 tokens (from libs/component-library/theme.ts) + Radix primitives
 └─ packages/fula-web-client   js-libp2p (WebTransport + circuit-relay-v2 + noise + yamux)
                                identity: sha256(utf8(secretKey.join(','))) → Ed25519 → peerId (== mobile appPeerId)
                                signed HTTP/1.1 over /x/fula-blockchain (X-Fula-Peer-ID / -Timestamp / -Signature)

Blox
 ├─ :3500 WAP (go-fula wap)      hotspot only (10.42.0.1) — setup: /properties /wifi/* /peer/exchange /partition …
 ├─ :8083 blox-ai (FastAPI)      LAN — /troubleshoot (SSE) /diag/* /execute-action …
 ├─ BLE GATT 00000001-710e-…     fulatower_<id> — proxies the same commands + logs/exec
 └─ kubo :4001                   /x/fula-blockchain → 127.0.0.1:4020 (go-fula, signed actions), /x/fula-ping → :4021
Cloud
 ├─ discovery.fula.network       /relays, /find-box (CORS *)
 ├─ relay.dev.fx.land :4001      kubo relay (tcp / quic-v1 / webtransport)
 └─ pools.fx.land                /join /ping /ping-cluster (CORS *)
```

Identity chain (identical to mobile): password → `HDKEY(password).chainCode` → wallet `personal_sign` →
`HDKEY(password).createEDKeyPair(signature)` → 64-byte `secretKey` → `DID(secretKey).did()` and
libp2p peerId (`packages/fula-web-client/src/core/identity.ts`). A Blox paired from the phone is manageable from
the browser without re-pairing.

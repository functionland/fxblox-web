# Phase-0 spike log (WS0)

| Gate | Result | Notes |
|---|---|---|
| (a) Identity parity | **vectors PASS (2026-08-27)**; live phone check pending | `go-fula` branch `feat/web-client-vectors`: `blockchain/auth_signed_vectors_test.go` (round-trip through the real `verifySignedRequest` + `signRequest`) and `mobile/keygen_vectors_test.go` (`GenerateEd25519KeyFromString` == inline derivation) both pass; emitted `packages/fula-web-client/test/vectors/{identity,signing}.json`; Vitest reproduces seed, peerId (e.g. secret `0,1,…,63` → `12D3KooWPnaMDrD7QLZKiT2iktjm9Kucx7XEPrSCUS6TTBbYuiRj`), pubkey, protobuf and all 9 signatures byte-for-byte. Remaining: derive in-browser from the user's real password+signature and compare with the phone's "App PeerId" |
| (b0) Certhash discovery | **PASS (2026-08-27)** | `GET https://delegated-ipfs.dev/routing/v1/peers/12D3KooWDRrBaAfPwsGJivBoUw5fE7ZpDiyfUjqgiURq2DEcL835` (Accept: application/json) returned `/dns/relay.dev.fx.land/udp/4001/quic-v1/webtransport/certhash/uEiCLmoPz5PDjRKDCu7vxowpW_s71izflO2HLncZlhYFQuQ/certhash/uEiAk6HQNr9aK22Ih_p6_Yo_6LQgkLqjf7WwZ7dkmCTD7UA` (+ `/ip4/40.233.107.227/udp/4001/quic-v1`, tcp, quic). Certhashes rotate (~14 d) — re-query at dial time. `GET https://discovery.fula.network/relays` without `x-fula-client` → **403** (Cloudflare WAF); with `x-fula-client: app` → 200 (2 relays: relay.dev.fx.land 12D3KooWDRr…, relay.fula.network 12D3KooWLgh…, TCP-only multiaddrs). **`OPTIONS /relays` preflight with `Origin: https://blox.fx.land` + `Access-Control-Request-Headers: x-fula-client` → 403** — the WAF blocks the preflight (browsers cannot attach custom headers to OPTIONS). PR-C therefore needs (1) the worker's `access-control-allow-headers: content-type, x-fula-client` AND (2) a Cloudflare WAF rule exception for `OPTIONS` requests / allow-listed `Origin`s on `discovery.fula.network` (dashboard change, not code) |
| (b) Browser → relay over WebTransport | pending | |
| (c) Circuit to the real Blox + `/x/fula-ping` | pending | |
| (d) Signed `blox-free-space` | pending | |
| (e) Relay limits | pending | |
| (f) Build sanity | pending | |
| (g) Android Chrome LNA | pending | |
| (h) Web Bluetooth 512 B write | pending | |
| (i) `account-fund` body form | **PASS** | `go-fula/blockchain/utils.go`: `BigInt.MarshalJSON` returns `b.String()` — a bare decimal number, no quotes → body is `{"amount":1000000000000000000,"to":"<account>"}` (`AccountFundRequest{Amount BigInt \`json:"amount"\`; To string \`json:"to"\`}`) |

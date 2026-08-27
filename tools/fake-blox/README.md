# fake-blox

Local stand-ins for the Blox services the web app talks to, with the CORS/Origin behaviour that firmware PR-A/PR-B
add to the real device.

```sh
npm run fake-blox                      # :3500 WAP, :8083 Blox AI, :8545 RPC on 127.0.0.1
FAKE_BLOX_SCENARIO=old-firmware npm run fake-blox   # no CORS headers (today's Blox)
FAKE_BLOX_SCENARIO=busy|slow|ap-drops-after-connect npm run fake-blox
FAKE_BIND=10.42.0.1 npm run fake-blox   # hotspot-shaped testing via a loopback alias
```

Set `VITE_BLOX_AP_URL=http://127.0.0.1:3500` (and the AI manual IP `127.0.0.1`) in the app for dev/E2E.

The libp2p fake (two pinned kubo binaries + a Node clone of go-fula's `serveProxy`) is added with the
`fula-web-client` harness in Phase 1.

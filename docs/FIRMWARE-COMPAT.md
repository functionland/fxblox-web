# Firmware / infra compatibility matrix

The web app feature-detects each capability and shows an "update your Blox / relay" banner when it is missing.

| Capability (web) | Needs | Detect | Status |
|---|---|---|---|
| Hotspot setup over HTTP (`http://10.42.0.1:3500`) | **PR-A** go-fula `wap/pkg/server/server.go`: CORS + OPTIONS + `Origin` guard | `OPTIONS /properties` → 204 with `Access-Control-Allow-Origin` | PR pending |
| Blox AI (`http://<ip>:8083`, SSE) | **PR-B** blox-ai `src/app.py`: `CORSMiddleware` + `Origin` guard | `OPTIONS /health` → 204 with ACAO | PR pending |
| Device management over libp2p from the browser | **PR-C** libp2p-relay: relay heartbeat publishes `ipfs id` addrs (WebTransport certhash) + worker returns them; `x-fula-client` in `access-control-allow-headers` | `/relays[].addrs` contains `/certhash/` | PR pending (zero-cost fallbacks: `/find-box` entries with certhash, delegated routing, `tools/relay-probe`) |
| LAN-direct libp2p (same Wi-Fi, no relay) | **PR-D** fula-ota kubo config `/webrtc-direct` + LAN addrs in heartbeat | `/find-box` has a non-circuit `/ip4/` entry | optional (v1.1) |
| Blox AI over Bluetooth | **PR-E** fula-ota `bluetooth.py` wires `ble_commands.json` (`ai/*`, `diag/*`) | BLE `ai/status` returns JSON | optional |

| Component | Version the plan was verified against |
|---|---|
| go-fula | `main` @ 8b4e5fd (2026-08) |
| kubo (box + relay) | v0.41.0 (relay `install.sh`); box image pulls `ipfs/kubo` per fula-ota compose |
| blox-ai | `main` (FastAPI, uvicorn :8083) |
| fula-ota | `main` (bluetooth.py GATT `00000001-710e-4a5b-8d75-3e5b444bc3cf`) |

# FxBlox Web

Browser version of the FxBlox mobile app (`functionland/fx` → `apps/box`), hosted on GitHub Pages at **https://blox.fx.land**.

Chromium-only (Chrome/Edge desktop ≥142, Android Chrome). It talks to your Blox over:

- the Blox hotspot HTTP API (`http://10.42.0.1:3500`, via Chrome's Local Network Access permission),
- Web Bluetooth (the Blox GATT service),
- libp2p (js-libp2p → WebTransport → relay circuit → kubo → go-fula actions),
- the Blox AI service on your LAN (`http://<blox-ip>:8083`, SSE),

and to Ethereum wallets through Reown AppKit (MetaMask extension on desktop, WalletConnect on Android).

## Workspace

| Path | What |
|---|---|
| `packages/fula-web-client` | `@functionland/fula-web-client` — js-libp2p browser client mirroring `@functionland/react-native-fula` (`fula`, `blockchain`, `fxblox` namespaces) |
| `packages/fx-ui` | `@functionland/fx-ui` — DOM design system (Tailwind v4 + Radix) with the Fx tokens |
| `apps/fxblox-web` | the app (Vite + React 19 + TypeScript) |
| `tools/fake-blox` | fake Blox servers (`:3500` WAP, `:8083` Blox AI, JSON-RPC) for dev + Playwright |
| `docs/` | `ARCHITECTURE.md`, `FIRMWARE-COMPAT.md`, `SECURITY.md`, `AUTOPIN-HANDOFF.md`, `SPIKE.md` |

## Develop

```sh
npm install
npm run fake-blox          # fake :3500 / :8083 / RPC on 127.0.0.1
npm run dev                # Vite dev server
npm test                   # Vitest across workspaces
npm run typecheck && npm run lint
```

## Deploy

Pushes to `main` build and deploy to GitHub Pages (`.github/workflows/deploy.yml`). `public/CNAME` pins the custom domain; `scripts/postbuild.mjs` copies `index.html` → `404.html` for SPA routing.

## Firmware compatibility

Some features need Blox firmware / relay changes that ship via OTA — see `docs/FIRMWARE-COMPAT.md`. The app feature-detects and shows an "update your Blox" banner until they land.

The full implementation plan lives in the Functionland planning notes (`i-want-to-design-federated-fox.md`); `docs/ARCHITECTURE.md` is the condensed version.

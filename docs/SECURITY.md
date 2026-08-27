# Security notes

## Secrets at rest

The DID password, wallet signature, address, fula peer id and root CID (the values the mobile app keeps in the OS
keychain) are stored in IndexedDB (`fxblox-secure`) encrypted with AES-GCM-256 under a **non-extractable** WebCrypto
`CryptoKey` that itself lives in IndexedDB. Each record carries AAD `fxblox|secure|v1|<service>` so a ciphertext cannot
be moved between slots. `wipe()` deletes the records, the key and the database (logout / "clear cached data").

Trust model, stated plainly:

- Protects the secrets at rest and prevents key exfiltration (the key cannot be exported by script).
- Does **not** protect against script running on this origin: an XSS could *use* the key while the page runs. The
  Content-Security-Policy (no third-party scripts, `script-src 'self' 'wasm-unsafe-eval'`) is therefore the primary
  control; the design assumes CSP is not bypassed and the browser's crypto isolation holds.
- Identity is cheaply re-derivable from the password + one wallet signature, so loss of the store is a 30-second
  "re-link", not data loss.
- Deferred hardening: PIN-wrapped unlock and idle auto-lock.

## Device APIs

- `:3500` / `:8083` are plain HTTP on the LAN/hotspot. Chrome's Local Network Access permission gates the browser side;
  firmware PRs add a CORS allow-list (`https://blox.fx.land`, `https://functionland.github.io`, `http://localhost:*`)
  **and** an `Origin` guard so a cross-site simple-form POST from another page cannot drive the Blox.
- libp2p actions are authenticated by Ed25519-signed headers bound to the app's peer id (the Blox `authorizer`); the
  browser presents the same identity as the phone. A 401 is retried once with a corrected clock, then surfaced as
  "not authorized".

## CSP

See `apps/fxblox-web/index.html`. `connect-src` allows private-IP `http://*:3500` / `http://*:8083` hosts (CSP cannot
express CIDRs); the client additionally refuses any non-RFC1918 target before issuing a LAN request.

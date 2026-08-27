// Fake go-fula WAP server (real one: E:\GitHub\go-fula\wap\pkg\server\server.go, binds 10.42.0.1:3500).
// Route table mirrors server.go:833-853. Bodies for POSTs are application/x-www-form-urlencoded (Go r.FormValue
// reads both the query string and the body).
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { applyCors, json, readBody } from './cors.mjs';

const SCENARIO = process.env.FAKE_BLOX_SCENARIO ?? '';
const SLOW_MS = SCENARIO === 'slow' ? 4000 : 0;

export function createWapState() {
  return {
    hardwareID: 'fake-hw-0001',
    kuboPeerId: process.env.FAKE_BLOX_PEER_ID ?? '12D3KooWFakeBloxPeerIdFakeBloxPeerIdFakeBloxPeer00',
    clusterPeerId: '12D3KooWFakeClusterPeerIdFakeClusterPeerIdFakeCl00',
    authorizer: '',
    otaVersion: 'fake-2026.08',
    restartNeeded: 'false',
    wifi: { status: 'disconnected', ssid: '', connectingSince: 0 },
    apEnabled: true,
    partitioned: false,
    freeSpace: { device_count: 1, size: 1_000_000_000_000, used: 250_000_000_000, avail: 750_000_000_000, used_percentage: 25 },
  };
}

function params(req, body) {
  const url = new URL(req.url, 'http://x');
  const p = new URLSearchParams(body);
  const get = (k) => url.searchParams.get(k) ?? p.get(k) ?? '';
  return { get };
}

export function startWap({ port = 3500, host = '127.0.0.1', state = createWapState() } = {}) {
  const server = http.createServer(async (req, res) => {
    if (applyCors(req, res, { scenario: SCENARIO })) return;
    if (SLOW_MS) await new Promise((r) => setTimeout(r, SLOW_MS));
    const path = new URL(req.url, 'http://x').pathname;
    const body = req.method === 'POST' ? await readBody(req) : '';
    const { get } = params(req, body);

    // wifi status machine: connecting → connected after 3 s
    if (state.wifi.status === 'connecting' && Date.now() - state.wifi.connectingSince > 3000) {
      state.wifi.status = 'connected';
      if (SCENARIO === 'ap-drops-after-connect') state.apEnabled = false;
    }

    switch (path) {
      case '/readiness':
        return json(res, 200, { status: 'ready' });
      case '/wifi/list':
        return json(res, 200, [
          { ssid: 'HomeNet', rssi: -45, security: 'WPA2' },
          { ssid: 'CoffeeShop', rssi: -70, security: 'WPA2' },
          { ssid: 'HiddenTest', rssi: -60, security: 'WPA2' },
        ]);
      case '/wifi/status':
        return json(res, 200, { status: state.wifi.status === 'connected' });
      case '/wifi/connect': {
        if (req.method !== 'POST') return json(res, 405, { error: 'Unsupported method type.' });
        const ssid = get('ssid');
        if (!ssid) return json(res, 400, { error: 'ssid required' });
        state.wifi = { status: 'connecting', ssid, connectingSince: Date.now() };
        res.writeHead(200, { 'content-type': 'text/plain' });
        return res.end('Wifi connected!');
      }
      case '/ap/enable':
        state.apEnabled = true;
        return json(res, 200, { status: 'ok' });
      case '/ap/disable':
        state.apEnabled = false;
        return json(res, 200, { status: 'ok' });
      case '/properties':
        return json(res, 200, {
          bloxFreeSpace: state.freeSpace,
          hardwareID: state.hardwareID,
          ota_version: state.otaVersion,
          restartNeeded: state.restartNeeded,
          kubo_peer_id: state.kuboPeerId,
          ipfs_cluster_peer_id: state.clusterPeerId,
          authorizer: state.authorizer,
        });
      case '/partition':
        state.partitioned = true;
        return json(res, 200, { status: true, msg: 'partitioned' });
      case '/delete-fula-config':
        state.authorizer = '';
        return json(res, 200, { status: true, msg: 'deleted' });
      case '/peer/exchange': {
        if (req.method !== 'POST') return json(res, 405, { error: 'Unsupported method type.' });
        const peerId = get('peer_id');
        const seed = get('seed');
        if (!peerId || !seed) return json(res, 400, { error: 'peer_id and seed required' });
        state.authorizer = peerId;
        return json(res, 200, { peer_id: state.kuboPeerId });
      }
      case '/peer/generate-identity':
        return json(res, 200, { peer_id: state.kuboPeerId });
      case '/pools/join':
      case '/pools/leave':
      case '/pools/cancel':
        return json(res, 200, { status: true });
      case '/chain/status':
        return json(res, 200, { synced: true });
      case '/account/id':
        return json(res, 200, { accountId: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty' });
      case '/account/seed':
        return json(res, 200, { accountSeed: '//fake' });
      default:
        return json(res, 404, { error: 'not found' });
    }
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve({ server, state, port, host })));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startWap({ port: Number(process.env.FAKE_WAP_PORT ?? 3500), host: process.env.FAKE_BIND ?? '127.0.0.1' }).then(({ port, host }) =>
    console.log(`[fake-blox] WAP listening on http://${host}:${port} (scenario: ${SCENARIO || 'default'})`),
  );
}

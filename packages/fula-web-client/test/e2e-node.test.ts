/**
 * End-to-end: the REAL client (Node libp2p variant: TCP instead of WebTransport) against a js-libp2p "Blox"
 * that plays kubo + go-fula:
 *   - `/x/fula-blockchain`: parses the HTTP/1.1 request from the stream, verifies the three X-Fula-* headers with
 *     the go-fula digest construction (public key extracted from the Ed25519 peer id), checks the `authorizer`
 *     set, answers `HTTP/1.1 <status> … Connection: close` and closes — and, like kubo's forwarder, tears the
 *     stream down if the client half-closes before the response was written;
 *   - `/x/fula-ping`: answers the go-fula JSON (`timestamp` in milliseconds, as `ping_server.go` does).
 */
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { generateKeyPair } from '@libp2p/crypto/keys';
import { identify } from '@libp2p/identify';
import type { Libp2p, Stream } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';
import { ping } from '@libp2p/ping';
import { tcp } from '@libp2p/tcp';
import { createLibp2p } from 'libp2p';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { concat, fromBase64Std, utf8 } from '../src/core/encoding.js';
import { HttpRequestParser, decodeText, serializeResponse, type HttpRequest } from '../src/core/httpOverStream.js';
import { buildSignedDigest } from '../src/core/signing.js';
import { FulaWebError, blockchain, configure, fula, fxblox, getClientState, resetConfig } from '../src/index.js';
import { createNodeNode } from '../src/node/createNodeNode.js';

// Identities from test/vectors/identity.json (go-fula golden vectors)
const AUTHORIZED_SECRET = Array.from({ length: 64 }, (_, i) => i).join(',');
const AUTHORIZED_PEER = '12D3KooWPnaMDrD7QLZKiT2iktjm9Kucx7XEPrSCUS6TTBbYuiRj';
const UNAUTHORIZED_SECRET = Array.from({ length: 64 }, (_, i) => 255 - i).join(',');
const UNAUTHORIZED_PEER = '12D3KooWGP58fHqVhWH5kD2FwNjWntFk3p3D6HMayqzwvWvZQ3vu';

interface SeenRequest {
  action: string;
  method: string;
  peerId: string | undefined;
  status: number;
  headers: Record<string, string>;
  rawBody: string;
}

interface FakeBox {
  node: Libp2p;
  addr: string;
  peerId: string;
  requests: SeenRequest[];
  pings: number;
  /** Box clock offset relative to the test process (simulates a Blox whose clock is off). */
  skewMs: number;
  authorizer: Set<string>;
  stop(): Promise<void>;
}

async function readRequest(stream: Stream): Promise<HttpRequest | undefined> {
  const parser = new HttpRequestParser();
  for await (const chunk of stream) {
    const req = parser.push(chunk instanceof Uint8Array ? chunk : chunk.subarray());
    if (req !== undefined) return req;
  }
  return undefined;
}

async function writeAll(stream: Stream, bytes: Uint8Array, chunkSize = 16 * 1024): Promise<void> {
  for (let off = 0; off < bytes.byteLength; off += chunkSize) {
    if (!stream.send(bytes.subarray(off, Math.min(off + chunkSize, bytes.byteLength)))) await stream.onDrain();
  }
}

function jsonResponse(status: number, statusText: string, body: string): Uint8Array {
  const b = utf8(body);
  return serializeResponse(status, statusText, { 'Content-Type': 'application/json', 'Content-Length': String(b.byteLength), Connection: 'close' }, b);
}

function chunkedResponse(status: number, statusText: string, body: Uint8Array, chunkSize = 16 * 1024): Uint8Array {
  const parts: Uint8Array[] = [serializeResponse(status, statusText, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked', Connection: 'close' })];
  for (let off = 0; off < body.byteLength; off += chunkSize) {
    const slice = body.subarray(off, Math.min(off + chunkSize, body.byteLength));
    parts.push(utf8(`${slice.byteLength.toString(16)}\r\n`), slice, utf8('\r\n'));
  }
  parts.push(utf8('0\r\n\r\n'));
  return concat(parts);
}

// go: http.Error(w, "", http.StatusUnauthorized)
const UNAUTHORIZED = serializeResponse(
  401,
  'Unauthorized',
  { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Content-Length': '1', Connection: 'close' },
  utf8('\n'),
);

interface Verification {
  valid: boolean;
  authorized: boolean;
  peerId: string | undefined;
}

function dispatch(box: FakeBox, action: string, rawBody: string): { status: number; response: Uint8Array } {
  switch (action) {
    case 'blox-free-space':
      return { status: 200, response: jsonResponse(200, 'OK', JSON.stringify({ device_count: 1, size: 1000, used: 250, avail: 750, used_percentage: 25 })) };
    case 'list-active-plugins':
      return { status: 200, response: jsonResponse(200, 'OK', JSON.stringify({ msg: ['blox-ai'], status: true })) };
    case 'get-cluster-info':
      return { status: 200, response: jsonResponse(200, 'OK', JSON.stringify({ cluster_peer_id: 'c', cluster_peer_name: 'n' })) };
    case 'fetch-container-logs': {
      const body = JSON.parse(rawBody) as { ContainerName: string; TailCount: string };
      const size = body.TailCount === 'big' ? 1024 * 1024 : 64;
      return { status: 202, response: chunkedResponse(202, 'Accepted', utf8(JSON.stringify({ status: true, msg: 'x'.repeat(size) }))) };
    }
    case 'account-fund': {
      const body = JSON.parse(rawBody) as { amount: number; to: string };
      return { status: 202, response: jsonResponse(202, 'Accepted', JSON.stringify({ from: box.peerId, to: body.to, amount: String(body.amount) })) };
    }
    case 'fula-pool-join': {
      const body = JSON.parse(rawBody) as { pool_id: number };
      return { status: 202, response: jsonResponse(202, 'Accepted', JSON.stringify({ account: 'acct', pool_id: body.pool_id })) };
    }
    default:
      return { status: 400, response: jsonResponse(400, 'Bad Request', JSON.stringify({ message: 'unknown action', description: action })) };
  }
}

async function startFakeBox(): Promise<FakeBox> {
  const node = await createLibp2p({
    privateKey: await generateKeyPair('Ed25519'),
    addresses: { listen: ['/ip4/127.0.0.1/tcp/0'] },
    transports: [tcp()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    // kubo answers /ipfs/ping/1.0.0 — the fallback `fula.checkConnection` / `fula.ping` rely on
    services: { identify: identify(), ping: ping() },
  });
  const box: FakeBox = {
    node,
    addr: '',
    peerId: node.peerId.toString(),
    requests: [],
    pings: 0,
    skewMs: 0,
    authorizer: new Set([AUTHORIZED_PEER]),
    stop: async () => {
      await node.stop();
    },
  };
  const boxNow = (): number => Date.now() + box.skewMs;

  // go-fula blockchain/auth_signed.go verifySignedRequest + blockchain.go authorized()
  const verify = async (req: HttpRequest, action: string): Promise<Verification> => {
    const peerIdStr = req.headers['x-fula-peer-id'];
    const ts = req.headers['x-fula-timestamp'];
    const sig = req.headers['x-fula-signature'];
    const fail: Verification = { valid: false, authorized: false, peerId: peerIdStr };
    if (peerIdStr === undefined || ts === undefined || sig === undefined) return fail;
    if (!/^-?\d+$/.test(ts)) return fail;
    if (Math.abs(Math.floor(boxNow() / 1000) - Number(ts)) > 300) return fail;
    let pid: ReturnType<typeof peerIdFromString>;
    try {
      pid = peerIdFromString(peerIdStr);
    } catch {
      return fail;
    }
    if (pid.type !== 'Ed25519') return fail;
    const digest = await buildSignedDigest(action, ts, req.body);
    let ok = false;
    try {
      ok = await pid.publicKey.verify(digest, fromBase64Std(sig));
    } catch {
      ok = false;
    }
    if (!ok) return fail;
    return { valid: true, authorized: box.authorizer.has(peerIdStr), peerId: peerIdStr };
  };

  await node.handle(
    '/x/fula-blockchain',
    async (stream) => {
      let answered = false;
      // kubo p2p/stream.go: a client half-close tears the whole forwarder down
      stream.addEventListener('remoteCloseWrite', () => {
        if (!answered) stream.abort(new Error('kubo forwarder: client half-closed before the response was written'));
      });
      try {
        const req = await readRequest(stream);
        if (req === undefined) return;
        const action = req.path.split('/').pop() ?? '';
        const rawBody = decodeText(req.body);
        const auth = await verify(req, action);
        const { status, response } = auth.valid && auth.authorized ? dispatch(box, action, rawBody) : { status: 401, response: UNAUTHORIZED };
        box.requests.push({ action, method: req.method, peerId: auth.peerId, status, headers: req.headers, rawBody });
        await writeAll(stream, response);
        answered = true;
        await stream.close();
      } catch (e) {
        stream.abort(e instanceof Error ? e : new Error(String(e)));
      }
    },
    { runOnLimitedConnection: true },
  );

  await node.handle(
    '/x/fula-ping',
    async (stream) => {
      try {
        const req = await readRequest(stream);
        if (req === undefined) return;
        box.pings++;
        const body = JSON.stringify({ success: true, timestamp: boxNow(), peer_id: box.peerId, uptime_ms: 4242, cluster_healthy: false });
        await writeAll(stream, jsonResponse(200, 'OK', body));
        await stream.close();
      } catch (e) {
        stream.abort(e instanceof Error ? e : new Error(String(e)));
      }
    },
    { runOnLimitedConnection: true },
  );

  const ma = node.getMultiaddrs().find((m) => m.toString().startsWith('/ip4/127.0.0.1/'));
  if (ma === undefined) throw new Error('fake box has no loopback address');
  box.addr = ma.toString(); // includes /p2p/<box peer id>
  return box;
}

const noNetwork = (async () => {
  throw new Error('no network access in tests');
}) as unknown as typeof fetch;

describe('e2e: real client ↔ js-libp2p fake Blox over TCP', () => {
  let box: FakeBox;

  beforeAll(async () => {
    box = await startFakeBox();
    configure({
      nodeFactory: createNodeNode,
      findBox: async () => [box.addr],
      fetch: noNetwork,
      perCandidateMs: 5_000,
      overallDialMs: 10_000,
      requestTimeoutMs: 10_000,
      pingTimeoutMs: 5_000,
    });
  }, 20_000);

  afterAll(async () => {
    await fula.shutdown();
    await box.stop();
    resetConfig();
  });

  it('newClient derives the mobile peer id, dials the box and probes /x/fula-ping', async () => {
    const peerId = await fula.newClient(AUTHORIZED_SECRET, '', box.addr, '', false, true, true);
    expect(peerId).toBe(AUTHORIZED_PEER);
    expect(await fula.isReady()).toBe(true);
    const state = getClientState();
    expect(state?.connected).toBe(true);
    expect(state?.bloxPeerId).toBe(box.peerId);
    expect(state?.appPeerId).toBe(AUTHORIZED_PEER);
    expect(box.pings).toBeGreaterThanOrEqual(1);
  });

  it('blockchain.bloxFreeSpace() sends a signed POST with Connection: close and parses the JSON', async () => {
    const res = await blockchain.bloxFreeSpace();
    expect(res).toEqual({ device_count: 1, size: 1000, used: 250, avail: 750, used_percentage: 25 });
    const seen = box.requests.find((r) => r.action === 'blox-free-space');
    expect(seen?.status).toBe(200);
    expect(seen?.peerId).toBe(AUTHORIZED_PEER);
    expect(seen?.method).toBe('POST');
    expect(seen?.headers['host']).toBe(`${box.peerId}.invalid`);
    expect(seen?.headers['connection']).toBe('close');
    expect(seen?.headers['content-type']).toBe('application/json');
    expect(seen?.headers['content-length']).toBe('2');
    expect(seen?.rawBody).toBe('{}');
  });

  it('fxblox.listActivePlugins() returns the {status,msg} shape and getClusterInfo parses', async () => {
    await expect(fxblox.listActivePlugins()).resolves.toEqual({ msg: ['blox-ai'], status: true });
    await expect(fxblox.getClusterInfo()).resolves.toEqual({ cluster_peer_id: 'c', cluster_peer_name: 'n' });
  });

  it('fula.checkConnection() is true and fula.ping() reports 3 successful libp2p pings', async () => {
    expect(await fula.checkConnection(10)).toBe(true);
    const p = await fula.ping(10);
    expect(p.success).toBe(true);
    expect(p.successes).toBe(3);
    expect(p.errors).toEqual([]);
  });

  it('account-fund body is the bare-number BigInt form; fula-pool-join carries the BLOX peer id', async () => {
    const to = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
    const fund = await blockchain.accountFund(to);
    expect(fund).toEqual({ from: box.peerId, to, amount: '1000000000000000000' });
    expect(box.requests.find((r) => r.action === 'account-fund')?.rawBody).toBe(`{"amount":1000000000000000000,"to":"${to}"}`);

    const join = await blockchain.joinPoolWithChain(3, 'skale');
    expect(join).toEqual({ account: 'acct', pool_id: 3 });
    expect(JSON.parse(box.requests.find((r) => r.action === 'fula-pool-join')?.rawBody ?? '{}')).toEqual({
      pool_id: 3,
      peer_id: box.peerId,
      chain_name: 'skale',
    });
  });

  it('reads a 1 MiB chunked response (Transfer-Encoding: chunked + Connection: close)', async () => {
    const res = await fxblox.fetchContainerLogs('fula_go', 'big');
    expect(res.status).toBe(true);
    expect(res.msg.length).toBe(1024 * 1024);
    expect(getClientState()?.connectionBytes).toBeGreaterThan(1024 * 1024);
  });

  it('an unexpected status surfaces as HTTP_ERROR with the go-fula message (resolve-with-error quirk)', async () => {
    const res = await blockchain.autoPinUnpair();
    expect(res).toBeInstanceOf(FulaWebError);
    const err = res as unknown as FulaWebError;
    expect(err.code).toBe('HTTP_ERROR');
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/^unexpected response: 400 /);
  });

  it('re-learns the clock offset after a 401 and retries once (box clock 400 s ahead)', async () => {
    const before = box.requests.length;
    box.skewMs = 400_000;
    const res = await blockchain.bloxFreeSpace();
    expect(res).toMatchObject({ size: 1000 });
    const attempts = box.requests
      .slice(before)
      .filter((r) => r.action === 'blox-free-space')
      .map((r) => r.status);
    expect(attempts).toEqual([401, 200]);
    const offset = getClientState()?.clockOffsetSeconds ?? 0;
    expect(offset).toBeGreaterThanOrEqual(399);
    expect(offset).toBeLessThanOrEqual(401);

    // next request signs with the learned offset → no 401
    const before2 = box.requests.length;
    await blockchain.bloxFreeSpace();
    expect(box.requests.slice(before2).map((r) => r.status)).toEqual([200]);
    box.skewMs = 0;
  });

  it('an unauthorized identity gets NOT_AUTHORIZED after exactly one retry', async () => {
    const peerId = await fula.newClient(UNAUTHORIZED_SECRET, '', box.addr, '', false, true, true);
    expect(peerId).toBe(UNAUTHORIZED_PEER);
    const before = box.requests.length;

    // blockchain.* resolves with the error (react-native-fula quirk preserved)
    const res = await blockchain.bloxFreeSpace();
    expect(res).toBeInstanceOf(FulaWebError);
    const err = res as unknown as FulaWebError;
    expect(err.code).toBe('NOT_AUTHORIZED');
    expect(err.status).toBe(401);
    expect(err.peerId).toBe(UNAUTHORIZED_PEER);
    expect(err.message).toContain(UNAUTHORIZED_PEER);
    expect(box.requests.slice(before).map((r) => `${r.peerId}:${r.status}`)).toEqual([`${UNAUTHORIZED_PEER}:401`, `${UNAUTHORIZED_PEER}:401`]);

    // fxblox.* re-throws
    await expect(fxblox.fetchContainerLogs('fula_go', '50')).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' });
  });

  it('newClient reuses the running client unless refresh=true; logout stops it', async () => {
    const pingsBefore = box.pings;
    expect(await fula.newClient(UNAUTHORIZED_SECRET, '', box.addr, '', false, true, false)).toBe(UNAUTHORIZED_PEER);
    expect(box.pings).toBe(pingsBefore); // reused: no new node, no new probe

    expect(await fula.logout(UNAUTHORIZED_SECRET, '')).toBe(true);
    expect(await fula.isReady()).toBe(false);
    expect(await fula.checkConnection(2)).toBe(false);
    const res = await blockchain.bloxFreeSpace();
    expect((res as unknown as FulaWebError).code).toBe('NOT_INITIALIZED');
    await expect(fula.ping(1)).rejects.toMatchObject({ code: 'NOT_INITIALIZED' });
    await fula.shutdown(); // idempotent
  });

  it('newClient without a bloxAddr requires exchange "noop" (go-fula mobile/config.go rule)', async () => {
    await expect(fula.newClient(AUTHORIZED_SECRET, '', '', '', false, true, true)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(await fula.newClient(AUTHORIZED_SECRET, '', '', 'noop', false, true, true)).toBe(AUTHORIZED_PEER);
    expect(await fula.isReady()).toBe(true);
    expect(await fula.checkConnection(2)).toBe(false);
    await fula.shutdown();
  });

  it('a box that is not reachable fails fast with DIAL_FAILED/DIAL_TIMEOUT and newClient still resolves', async () => {
    configure({ findBox: async () => [`/ip4/127.0.0.1/tcp/1/p2p/${box.peerId}`], perCandidateMs: 2_000, overallDialMs: 3_000 });
    expect(await fula.newClient(AUTHORIZED_SECRET, '', box.addr, '', false, true, true)).toBe(AUTHORIZED_PEER);
    const state = getClientState();
    expect(state?.connected).toBe(false);
    expect(['DIAL_FAILED', 'DIAL_TIMEOUT']).toContain(state?.lastError?.code);
    expect(await fula.checkConnection(3)).toBe(false);
    const res = await blockchain.bloxFreeSpace();
    expect(['DIAL_FAILED', 'DIAL_TIMEOUT']).toContain((res as unknown as FulaWebError).code);
    await fula.shutdown();
    configure({ findBox: async () => [box.addr], perCandidateMs: 5_000, overallDialMs: 10_000 });
  }, 15_000);
});

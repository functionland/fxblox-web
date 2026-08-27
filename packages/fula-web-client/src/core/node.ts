/**
 * js-libp2p node configuration (plan §WS1 "libp2p node").
 *
 * Browser node = pure dialer: WebTransport (to the relay) + circuit-relay-v2 transport (to the Blox through the
 * relay), noise, yamux, identify, ping. No listen addresses → the circuit transport never tries to make its own
 * reservation (circuit v2 only needs the *destination's* reservation). No peer discovery, no DHT.
 *
 * Why the connection gater override: libp2p's default browser gater denies private multiaddrs and insecure
 * websockets (`libp2p/dist/src/config/connection-gater.browser.js`). The optional LAN tier
 * (`/ip4/<lan>/udp/4001/quic-v1/webtransport/certhash/…`, after firmware PR-D) is a private address, so we allow
 * everything and let discovery decide what to dial.
 *
 * Node variant (tests / fake harness) lives in `src/node/createNodeNode.ts` and shares `buildNodeOptions`.
 */
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { identify, type Identify } from '@libp2p/identify';
import type { ComponentLogger, ConnectionGater, PrivateKey } from '@libp2p/interface';
import { ping, type Ping } from '@libp2p/ping';
import { webTransport } from '@libp2p/webtransport';
import { createLibp2p, type Libp2p, type Libp2pOptions } from 'libp2p';

export type FulaNodeServices = { identify: Identify; ping: Ping };
export type FulaNode = Libp2p<FulaNodeServices>;
export type TransportFactory = NonNullable<Libp2pOptions['transports']>[number];
export type NodeFactory = (privateKey: PrivateKey, opts?: NodeOptions) => Promise<FulaNode>;

export interface NodeOptions {
  /** @default 16 */
  maxConnections?: number;
  /** Per-dial ceiling inside libp2p; the client applies its own 20 s per candidate on top. @default 20_000 */
  dialTimeoutMs?: number;
  /** Listen addresses — empty for the browser (pure dialer); the Node test box listens on TCP. */
  listen?: string[];
  /** Override the permissive gater (tests). */
  connectionGater?: ConnectionGater;
  logger?: ComponentLogger;
  /** Additional transports appended to the platform defaults. */
  extraTransports?: TransportFactory[];
}

/** A relay circuit costs two connections (relay + circuit) and closing ones linger briefly — 16 leaves headroom while candidates churn. */
export const DEFAULT_MAX_CONNECTIONS = 16;
export const DEFAULT_DIAL_TIMEOUT_MS = 20_000;

/** Allows every dial (private LAN WebTransport addresses included). Inbound is irrelevant — we never listen. */
export const PERMISSIVE_GATER: ConnectionGater = {
  denyDialMultiaddr: () => false,
};

export function buildNodeOptions(privateKey: PrivateKey, transports: TransportFactory[], opts: NodeOptions = {}): Libp2pOptions<FulaNodeServices> {
  const options: Libp2pOptions<FulaNodeServices> = {
    privateKey,
    nodeInfo: { name: 'fula-web-client', version: '0.0.1' },
    addresses: { listen: opts.listen ?? [] },
    transports: [...transports, ...(opts.extraTransports ?? [])],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      // /x/fula-ping and the libp2p ping fallback both run over the relayed (limited) connection.
      ping: ping({ runOnLimitedConnection: true }),
    },
    connectionGater: opts.connectionGater ?? PERMISSIVE_GATER,
    connectionManager: {
      maxConnections: opts.maxConnections ?? DEFAULT_MAX_CONNECTIONS,
      dialTimeout: opts.dialTimeoutMs ?? DEFAULT_DIAL_TIMEOUT_MS,
      addressDialTimeout: opts.dialTimeoutMs ?? DEFAULT_DIAL_TIMEOUT_MS,
      maxParallelDials: 4,
    },
    peerDiscovery: [],
  };
  if (opts.logger !== undefined) options.logger = opts.logger;
  return options;
}

/** Browser node: WebTransport → relay → circuit → Blox. */
export async function createBrowserNode(privateKey: PrivateKey, opts: NodeOptions = {}): Promise<FulaNode> {
  return createLibp2p(buildNodeOptions(privateKey, [webTransport(), circuitRelayTransport()], opts));
}

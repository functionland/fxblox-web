/**
 * Node.js variant of the libp2p node — TCP + circuit relay — for Vitest and the fake-Blox harness.
 * WebTransport cannot dial from Node (no QUIC), so it is left out; everything else is identical to the browser
 * node (`buildNodeOptions`), which is the point: the e2e test exercises the real client code path.
 */
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import type { PrivateKey } from '@libp2p/interface';
import { tcp } from '@libp2p/tcp';
import { createLibp2p } from 'libp2p';
import { buildNodeOptions, type FulaNode, type NodeOptions } from '../core/node.js';

export async function createNodeNode(privateKey: PrivateKey, opts: NodeOptions = {}): Promise<FulaNode> {
  return createLibp2p(buildNodeOptions(privateKey, [tcp(), circuitRelayTransport()], opts));
}

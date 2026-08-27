/**
 * @functionland/fula-web-client — browser (js-libp2p) client for go-fula Blox actions.
 * Public surface mirrors @functionland/react-native-fula 1.58.x (`fula`, `blockchain`, `fxblox`).
 */
export * as fula from './protocols/fula.js';
export * as blockchain from './protocols/blockchain.js';
export * as fxblox from './protocols/fxblox.js';
export * as identity from './core/identity.js';
export * as signing from './core/signing.js';

export { configure, resetConfig, getConfig, getClientState, parseBloxPeerId, BLOCKCHAIN_PROTOCOL, PING_PROTOCOL } from './core/client.js';
export type { ConfigureOptions, ClientConfig, ClientState, ActionResponse, PingProbeResult } from './core/client.js';

export { FulaWebError, isFulaWebError } from './core/errors.js';
export type { FulaWebErrorCode } from './core/errors.js';

export { enableDebug, isDebugEnabled, getDebugLog, clearDebugLog, setLogSink } from './core/log.js';
export type { LogEntry, LogLevel } from './core/log.js';

export { ACTIONS, ACCOUNT_FUND_AMOUNT, wireActionNames } from './core/actions.js';
export type { ActionSpec, ActionKey } from './core/actions.js';

export { createBrowserNode, PERMISSIVE_GATER } from './core/node.js';
export type { FulaNode, NodeFactory, NodeOptions } from './core/node.js';

export {
  HARDCODED_RELAYS,
  MemoryKeyValueStore,
  resolveCandidates,
  listRelays,
  relayWebTransportAddrs,
  rewriteCircuitForBrowser,
} from './core/discovery.js';
export type { KeyValueStore, RelayInfo, FindBoxFn, DiscoveryConfig, Candidate } from './core/discovery.js';

export type { FulaIdentity } from './core/identity.js';
export type { SignedHeaders } from './core/signing.js';
export type { FulaNativeModule } from './core/nativeShim.js';
export type * as BlockchainTypes from './types/blockchain.js';
export type * as FxBloxTypes from './types/fxblox.js';

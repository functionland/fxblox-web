/**
 * The react-native-fula NativeModule surface (`src/interfaces/fulaNativeModule.ts`), implemented on top of the web
 * client. Every method returns what the native module returns — a Promise of the raw JSON *string* from go-fula
 * (or a boolean / void for lifecycle calls) — so `src/protocols/*` can be near-verbatim copies of react-native-fula.
 *
 * Status handling mirrors go-fula's client functions: when the response status is not one the Go client accepts,
 * the native promise rejects with Go's `unexpected response: <status> <body>` message → here HTTP_ERROR. 401 is
 * turned into NOT_AUTHORIZED by `client.request` (after the retry-once rule).
 *
 * Methods that have no reachable go-fula action from the browser (filesystem `initFula`, the streaming `chat-ai`
 * trio, and the seed-driven pool/manifest admin calls whose request shapes could not be verified) reject with
 * UNSUPPORTED_ACTION instead of guessing a wire format.
 */
import { ACTIONS, isOkStatus, type ActionSpec } from './actions.js';
import * as client from './client.js';
import { FulaWebError } from './errors.js';

export interface FulaNativeModule {
  registerLifecycleListener: () => Promise<void>;
  initFula: (
    identity: string,
    storePath: string,
    bloxAddr: string,
    exchange: string,
    autoFlush: boolean,
    rootCid: string | null,
    useRelay: boolean | null,
    refresh: boolean,
  ) => Promise<{ peerId: string; rootCid: string }>;
  newClient: (
    identity: string,
    storePath: string,
    bloxAddr: string,
    exchange: string,
    autoFlush: boolean,
    useRelay: boolean | null,
    refresh: boolean,
  ) => Promise<string>;
  isReady: (filesystemCheck: boolean) => Promise<boolean>;
  logout: (identity: string, storePath: string) => Promise<boolean>;
  checkConnection: (timeout: number) => Promise<boolean>;
  ping: (timeout: number) => Promise<string>;
  shutdown: () => Promise<void>;

  // Blockchain
  createAccount: (seed: string) => Promise<string>;
  checkAccountExists: (account: string) => Promise<string>;
  accountFund: (account: string) => Promise<string>;
  createPool: (seed: string, poolName: string) => Promise<string>;
  listPools: () => Promise<string>;
  joinPool: (poolID: string) => Promise<string>;
  leavePool: (poolID: string) => Promise<string>;
  joinPoolWithChain: (poolID: string, chainName: string) => Promise<string>;
  leavePoolWithChain: (poolID: string, chainName: string) => Promise<string>;
  cancelPoolJoin: (poolID: string) => Promise<string>;
  listPoolJoinRequests: (poolID: string) => Promise<string>;
  votePoolJoinRequest: (seed: string, poolID: number, account: string, accept: boolean) => Promise<string>;
  batchUploadManifest: (cid: string[], poolID: string, replicationFactor: string) => Promise<string>;
  replicateInPool: (cid: string[], account: string, poolID: string) => Promise<string>;
  newStoreRequest: (seed: string, poolID: number, uploader: string, cid: string) => Promise<string>;
  listAvailableReplicationRequests: (poolID: string) => Promise<string>;
  removeReplicationRequest: (seed: string, poolID: number, cid: string) => Promise<string>;
  removeStorer: (seed: string, storer: string, poolID: number, cid: string) => Promise<string>;
  removeStoredReplication: (seed: string, uploader: string, poolID: number, cid: string) => Promise<string>;

  // On-Blox chain calls
  assetsBalance: (account: string, assetId: string, classId: string) => Promise<string>;
  transferToFula: (amount: string, wallet: string, chain: string) => Promise<string>;
  getAccount: () => Promise<string>;

  // Hardware
  eraseBlData: () => Promise<string>;
  fetchContainerLogs: (containerName: string, tailCount: string) => Promise<string>;
  findBestAndTargetInLogs: (containerName: string, tailCount: string) => Promise<string>;
  getFolderSize: (folderPath: string) => Promise<string>;
  getDatastoreSize: () => Promise<string>;
  bloxFreeSpace: () => Promise<string>;
  wifiRemoveall: () => Promise<string>;
  reboot: () => Promise<string>;
  partition: () => Promise<string>;
  getDockerImageBuildDates: () => Promise<string>;
  getClusterInfo: () => Promise<string>;

  // Plugins
  listPlugins: () => Promise<string>;
  listActivePlugins: () => Promise<string>;
  installPlugin: (pluginName: string, params: string) => Promise<string>;
  uninstallPlugin: (pluginName: string) => Promise<string>;
  showPluginStatus: (pluginName: string, lines: number) => Promise<string>;
  getInstallOutput: (pluginName: string, params: string) => Promise<string>;
  getInstallStatus: (pluginName: string) => Promise<string>;
  updatePlugin: (pluginName: string) => Promise<string>;

  // AI
  chatWithAI: (aiModel: string, userMessage: string) => Promise<string>;
  getChatChunk: (streamID: string) => Promise<string>;
  streamChunks: (streamID: string) => Promise<void>;

  // Auto-pin
  autoPinPair: (token: string, endpoint: string) => Promise<string>;
  autoPinRefresh: (token: string) => Promise<string>;
  autoPinUnpair: () => Promise<string>;
}

/** Sends the action, enforces the Go client's expected status, returns the raw body string. */
export async function callAction<A extends unknown[]>(spec: ActionSpec<A>, ...args: A): Promise<string> {
  const body = spec.encode(...args);
  const res = await client.request(spec, body);
  if (!isOkStatus(spec, res.status)) {
    // Same text go-fula's client produces: fmt.Errorf("unexpected response: %d %s", resp.StatusCode, string(b))
    throw new FulaWebError('HTTP_ERROR', `unexpected response: ${res.status} ${res.body}`, { status: res.status, action: spec.action });
  }
  return res.body;
}

/** FulaModule.java parses the pool id with Integer.parseInt — reject non-integers up front. */
export function toInt(value: string | number, name: string): number {
  const n = typeof value === 'number' ? value : Number.parseInt(value, 10);
  if (!Number.isInteger(n)) throw new FulaWebError('INVALID_ARGUMENT', `${name} must be an integer (got ${JSON.stringify(value)})`);
  return n;
}

function unsupported(method: string, why: string): Promise<never> {
  return Promise.reject(new FulaWebError('UNSUPPORTED_ACTION', `${method} is not available in the web client: ${why}`));
}

const NO_FILESYSTEM = 'the browser client has no WNFS datastore';
const NO_STREAMING = 'go-fula streams chat-ai over a long-lived stream that the one-request-per-stream web client does not support yet';
const UNVERIFIED = 'the go-fula request shape for this seed-driven admin call has not been verified for the web client';

export const Fula: FulaNativeModule = {
  registerLifecycleListener: async () => undefined,
  initFula: () => unsupported('initFula', NO_FILESYSTEM),
  newClient: (identity, storePath, bloxAddr, exchange, autoFlush, useRelay, refresh) =>
    client.newClient(identity, storePath, bloxAddr, exchange, autoFlush, useRelay, refresh),
  isReady: (filesystemCheck) => client.isReady(filesystemCheck),
  logout: (identity, storePath) => client.logout(identity, storePath),
  checkConnection: (timeout) => client.checkConnection(timeout),
  ping: (timeout) => client.ping(timeout),
  shutdown: () => client.shutdown(),

  // go-fula `account-create` takes no body; the seed is plugged server-side (blockchain.PlugSeedIfNeeded).
  createAccount: (_seed) => callAction(ACTIONS.createAccount),
  checkAccountExists: (account) => callAction(ACTIONS.accountExists, account),
  accountFund: (account) => callAction(ACTIONS.accountFund, account),
  createPool: () => unsupported('createPool', UNVERIFIED),
  listPools: () => callAction(ACTIONS.listPools),
  joinPool: (poolID) => callAction(ACTIONS.joinPool, toInt(poolID, 'poolID'), client.requireBloxPeerId()),
  leavePool: (poolID) => callAction(ACTIONS.leavePool, toInt(poolID, 'poolID')),
  joinPoolWithChain: (poolID, chainName) => callAction(ACTIONS.joinPoolWithChain, toInt(poolID, 'poolID'), client.requireBloxPeerId(), chainName),
  leavePoolWithChain: (poolID, chainName) => callAction(ACTIONS.leavePoolWithChain, toInt(poolID, 'poolID'), chainName),
  cancelPoolJoin: (poolID) => callAction(ACTIONS.cancelPoolJoin, toInt(poolID, 'poolID')),
  listPoolJoinRequests: (poolID) => callAction(ACTIONS.listPoolJoinRequests, toInt(poolID, 'poolID')),
  votePoolJoinRequest: () => unsupported('votePoolJoinRequest', UNVERIFIED),
  batchUploadManifest: (cid, poolID, replicationFactor) =>
    callAction(ACTIONS.batchUploadManifest, cid, toInt(poolID, 'poolID'), toInt(replicationFactor, 'replicationFactor')),
  replicateInPool: (cid, account, poolID) => callAction(ACTIONS.replicateInPool, cid, account, toInt(poolID, 'poolID')),
  newStoreRequest: () => unsupported('newStoreRequest', UNVERIFIED),
  listAvailableReplicationRequests: (poolID) => callAction(ACTIONS.listAvailableReplicationRequests, toInt(poolID, 'poolID')),
  removeReplicationRequest: () => unsupported('removeReplicationRequest', UNVERIFIED),
  removeStorer: () => unsupported('removeStorer', UNVERIFIED),
  removeStoredReplication: () => unsupported('removeStoredReplication', UNVERIFIED),

  assetsBalance: (account, assetId, classId) => callAction(ACTIONS.assetsBalance, account, toInt(classId, 'classId'), toInt(assetId, 'assetId')),
  transferToFula: () => unsupported('transferToFula', 'the chain-specific convert_tokens action name has not been verified for the web client'),
  getAccount: () => callAction(ACTIONS.getAccount),

  eraseBlData: () => callAction(ACTIONS.eraseBlData),
  fetchContainerLogs: (containerName, tailCount) => callAction(ACTIONS.fetchContainerLogs, containerName, tailCount),
  findBestAndTargetInLogs: (containerName, tailCount) => callAction(ACTIONS.findBestAndTargetInLogs, containerName, tailCount),
  getFolderSize: (folderPath) => callAction(ACTIONS.getFolderSize, folderPath),
  getDatastoreSize: () => callAction(ACTIONS.getDatastoreSize),
  bloxFreeSpace: () => callAction(ACTIONS.bloxFreeSpace),
  wifiRemoveall: () => callAction(ACTIONS.wifiRemoveall),
  reboot: () => callAction(ACTIONS.reboot),
  partition: () => callAction(ACTIONS.partition),
  getDockerImageBuildDates: () => callAction(ACTIONS.getDockerImageBuildDates),
  getClusterInfo: () => callAction(ACTIONS.getClusterInfo),

  listPlugins: () => callAction(ACTIONS.listPlugins),
  listActivePlugins: () => callAction(ACTIONS.listActivePlugins),
  installPlugin: (pluginName, params) => callAction(ACTIONS.installPlugin, pluginName, params),
  uninstallPlugin: (pluginName) => callAction(ACTIONS.uninstallPlugin, pluginName),
  showPluginStatus: (pluginName, lines) => callAction(ACTIONS.showPluginStatus, pluginName, lines),
  getInstallOutput: (pluginName, params) => callAction(ACTIONS.getInstallOutput, pluginName, params),
  getInstallStatus: (pluginName) => callAction(ACTIONS.getInstallStatus, pluginName),
  updatePlugin: (pluginName) => callAction(ACTIONS.updatePlugin, pluginName),

  chatWithAI: () => unsupported('chatWithAI', NO_STREAMING),
  getChatChunk: () => unsupported('getChatChunk', NO_STREAMING),
  streamChunks: () => unsupported('streamChunks', NO_STREAMING),

  autoPinPair: (token, endpoint) => callAction(ACTIONS.autoPinPair, token, endpoint),
  autoPinRefresh: (token) => callAction(ACTIONS.autoPinRefresh, token),
  autoPinUnpair: () => callAction(ACTIONS.autoPinUnpair),
};

export default Fula;

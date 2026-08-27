/**
 * Contract consumed from `@functionland/fula-web-client` (plan §WS3 "Contract consumed from
 * packages/fula-web-client"). It mirrors the `@functionland/react-native-fula@1.58.2` surface exactly as the
 * mobile app calls it — the response types below are copied from that package's `src/types/{blockchain,fxblox}.ts`.
 *
 * The client package is built in parallel (WS1); everything in the app codes against THIS interface and tests
 * `vi.mock('@/lib/fula')`.
 */

// ---- blockchain response types (react-native-fula/src/types/blockchain.ts) ----
export interface SeededResponse {
  seed: string;
  account: string;
}
export interface AccountFundResponse {
  from: string;
  to: string;
  amount: string;
}
export interface PoolJoinResponse {
  account: string;
  poolID: number;
}
export interface PoolLeaveResponse {
  account: string;
  poolID: number;
}
export interface BloxFreeSpaceResponse {
  size: number;
  avail: number;
  used: number;
  used_percentage: number;
  device_count?: number;
}
export interface AutoPinPairResponse {
  status: string;
  pairing_secret: string;
  hardware_id: string;
}

// ---- fxblox response types (react-native-fula/src/types/fxblox.ts) ----
export interface StatusMsgResponse {
  status: boolean;
  msg: string;
}
export type wifiRemoveallResponse = StatusMsgResponse;
export type rebootResponse = StatusMsgResponse;
export type partitionResponse = StatusMsgResponse;
export type FetchContainerLogsResponse = StatusMsgResponse;
export interface GetFolderPathResponse {
  folder_path: string;
  size: string;
}
export interface GetDatastoreSizeResponse {
  size: string;
  storage_max: string;
  count: string;
  folder_path: string;
  version: string;
}
export interface ListActivePluginsResponse {
  msg: string[] | string;
  status: boolean;
}
export type InstallPluginResponse = StatusMsgResponse;
export type UninstallPluginResponse = StatusMsgResponse;
export type GetInstallStatusResponse = StatusMsgResponse;
export interface GetInstallOutputResponse {
  status: boolean;
  msg: string | { [key: string]: string };
}
export type UpdatePluginResponse = StatusMsgResponse;
export interface GetClusterInfoResponse {
  cluster_peer_id: string;
  cluster_peer_name: string;
}

// ---- namespaces ----
export interface FulaNamespace {
  /**
   * `identity` = the 64-byte DID secretKey comma-joined (`Uint8Array.toString()`), `storePath` = '',
   * `bloxAddr` = circuit multiaddr (or '' for no target), `exchange` = '' | 'noop', then autoFlush / useRelay /
   * refresh as the mobile app passes them. Resolves with the app peerId (the Blox `authorizer`).
   */
  newClient(
    identity: string,
    storePath: string,
    bloxAddr: string,
    exchange: '' | 'noop' | string,
    autoFlush: boolean,
    useRelay: boolean,
    refresh: boolean,
  ): Promise<string>;
  isReady(filesystemCheck?: boolean): Promise<boolean>;
  checkConnection(timeoutSec?: number): Promise<boolean>;
  logout(identity: string, storePath: string): Promise<boolean>;
  shutdown(): Promise<void>;
  /** No-op on web (mirrors react-native-fula; kept for call-shape parity). */
  setAuth?(peerId: string, allow: boolean): Promise<boolean>;
}

export interface BlockchainNamespace {
  createAccount(seed: string): Promise<SeededResponse>;
  bloxFreeSpace(): Promise<BloxFreeSpaceResponse>;
  joinPoolWithChain(poolID: number, chain: string): Promise<PoolJoinResponse>;
  leavePoolWithChain(poolID: number, chain: string): Promise<PoolLeaveResponse>;
  accountFund(account: string): Promise<AccountFundResponse>;
  autoPinPair(token: string, endpoint: string): Promise<AutoPinPairResponse>;
}

export interface FxbloxNamespace {
  wifiRemoveall(): Promise<wifiRemoveallResponse>;
  reboot(): Promise<rebootResponse>;
  partition(): Promise<partitionResponse>;
  fetchContainerLogs(containerName: string, tailCount: string | number): Promise<FetchContainerLogsResponse>;
  getFolderSize(folderPath: string): Promise<GetFolderPathResponse>;
  getDatastoreSize(): Promise<GetDatastoreSizeResponse>;
  getClusterInfo(): Promise<GetClusterInfoResponse>;
  listActivePlugins(): Promise<ListActivePluginsResponse>;
  installPlugin(pluginName: string, params: string): Promise<InstallPluginResponse>;
  uninstallPlugin(pluginName: string): Promise<UninstallPluginResponse>;
  getInstallStatus(pluginName: string): Promise<GetInstallStatusResponse>;
  getInstallOutput(pluginName: string, params: string): Promise<GetInstallOutputResponse>;
  updatePlugin(pluginName: string): Promise<UpdatePluginResponse>;
}

export interface FulaIdentityLike {
  peerIdString: string;
  identityString: string;
  seed: Uint8Array;
}

export interface IdentityNamespace {
  identityFromSecretKey(secretKey: Uint8Array | string): Promise<FulaIdentityLike>;
  peerIdFromSecretKey(secretKey: Uint8Array | string): Promise<string>;
  identityStringFromSecretKey(secretKey: Uint8Array | string): string;
}

/** Runtime configuration hook (fake-blox state injection, discovery override, relay list). */
export interface FulaClientConfig {
  discoveryUrl?: string;
  findBox?: (bloxPeerId: string) => Promise<string[]>;
  relayWtAddrs?: string[];
  requestTimeoutSec?: number;
}

export type FulaWebErrorCode =
  | 'NOT_AUTHORIZED'
  | 'HTTP_ERROR'
  | 'BAD_RESPONSE'
  | 'NO_CANDIDATES'
  | 'NO_CERTHASH'
  | 'DIAL_TIMEOUT'
  | 'NO_RESERVATION'
  | 'RELAY_LIMIT'
  | 'CIRCUIT_DATA_CAP'
  | 'TIMEOUT'
  | 'CLIENT_CLOSED'
  | 'UNSUPPORTED_PROTOCOL';

export interface FulaClientContract {
  fula: FulaNamespace;
  blockchain: BlockchainNamespace;
  fxblox: FxbloxNamespace;
  identity: IdentityNamespace;
  configure: (config: FulaClientConfig) => void;
}

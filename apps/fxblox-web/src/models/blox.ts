export interface TBlox {
  peerId: string; // kubo peerID (connection identifier)
  clusterPeerId?: string; // ipfs-cluster peerID (pool/reward operations)
  name: string;
}
export interface TBloxFreeSpace {
  device_count: number;
  size: number;
  avail: number;
  used: number;
  used_percentage: number;
}
export interface TBloxFolderSize {
  fula: string;
  chain: string;
  fulaCount: string;
  userOwnData: string;
}
export type TBloxConectionStatus = 'CONNECTED' | 'CHECKING' | 'SWITCHING' | 'DISCONNECTED' | 'NO INTERNET' | 'NO CLIENT';
export type DockerContainerInfo = {
  image: string;
  version: string;
  id: string;
  labels: Record<string, string>;
  created: string;
  repo_digests: string[];
};
export type TBloxProperty = {
  bloxFreeSpace: TBloxFreeSpace;
  containerInfo_fula: DockerContainerInfo;
  containerInfo_fxsupport: DockerContainerInfo;
  containerInfo_node: DockerContainerInfo;
  hardwareID: string;
  ota_type?: 'rpi' | 'rk' | 'pc';
  ota_version?: string;
  restartNeeded?: 'false' | 'true';
  kubo_peer_id?: string;
  ipfs_cluster_peer_id?: string;
  /** PR-A: LAN WebTransport / webrtc-direct addrs with certhash from kubo `/api/v0/id`. */
  kubo_addrs?: string[];
  authorizer?: string;
};

/**
 * The mDNS record shape the mobile pairing flow consumed. On web there is no mDNS; `utils/lanIpCache` keeps the
 * same shape so the AI transport selector is unchanged — records are fed by HTTP interactions instead.
 */
export type MDNSBloxService = {
  addresses: string[];
  fullName: string;
  host: string;
  name: string;
  port: number;
  txt: {
    authorizer: string;
    bloxPeerIdString: string | 'NA'; // kubo peerID
    hardwareID: string;
    poolName: string;
    ipfsClusterID?: string; // ipfs-cluster peerID
    ipAddress?: string; // explicit LAN IP
    bloxAiPort?: string;
  };
};

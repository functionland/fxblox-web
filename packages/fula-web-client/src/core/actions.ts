/**
 * go-fula action table — wire names, JSON bodies and the status the go-fula *client* treats as success.
 *
 * Sources (verified 2026-08-27 against E:\GitHub\go-fula):
 *   - names:     blockchain/interface.go `action*` constants
 *   - bodies:    blockchain/interface.go request structs (json tags) and mobile/blockchain.go (what the phone sends)
 *   - statuses:  the per-action client functions in blockchain/{blox,bl_account,bl_pool,bl_autopin,bl_plugins}.go
 *                (`resp.StatusCode != http.StatusOK|StatusAccepted`; the plugin client functions check nothing → 'any')
 *
 * Go-parity notes:
 *   - The server signs/verifies only `path.Base(url)` + body hash; no handler checks the method. We always POST.
 *   - go-fula sends a nil body for argument-less actions; we send `{}` instead. Every handler that decodes a body
 *     decodes `{}` fine, and handlers that ignore the body do not care. (`{}` is also what the golden vectors use.)
 *   - `fetch-container-logs`: `wifi.FetchContainerLogsRequest` has NO json tags → Go's encoder emits the field
 *     names verbatim: `ContainerName`, `TailCount` (TailCount is a string on the wire).
 *   - `account-fund`: `blockchain.BigInt.MarshalJSON` returns `b.String()` → a bare decimal number, no quotes.
 *     The body string is built by hand so the 1e18 literal can never be re-serialised by JSON.stringify.
 *   - `fula-pool-join` / `fula-pool-leave`: mobile fills `peer_id` with the BLOX (kubo) peer id (`c.bloxPid`),
 *     not the app's own id; `chain_name` is `omitempty`.
 *   - Plugin actions (`bl_plugins.go handlePluginAction`) answer with `w.Write(result)` → 200 and a
 *     `{status, msg}` JSON produced by `*Impl`; errors come back as `http.Error(500, text)`.
 */

export type OkStatuses = readonly number[] | 'any';

export interface ActionSpec<A extends unknown[] = []> {
  /** go-fula wire action (the request path is `/<action>`). */
  readonly action: string;
  /** Statuses the go-fula client treats as success ('any' = it does not check). */
  readonly ok: OkStatuses;
  /** Builds the exact JSON body string sent (and signed). */
  readonly encode: (...args: A) => string;
}

export const ACCOUNT_FUND_AMOUNT = '1000000000000000000';

function def<A extends unknown[]>(action: string, ok: OkStatuses, encode: (...args: A) => string): ActionSpec<A> {
  return { action, ok, encode };
}

const json = (o: Record<string, unknown>): string => JSON.stringify(o);
const EMPTY = (): string => '{}';

export const ACTIONS = {
  // ---- Blox hardware / info (blockchain/blox.go) — 200 -------------------------------------------------------
  bloxFreeSpace: def('blox-free-space', [200], EMPTY),
  eraseBlData: def('erase-blockchain-data', [200], EMPTY),
  wifiRemoveall: def('wifi-removeall', [200], EMPTY),
  reboot: def('reboot', [200], EMPTY),
  partition: def('partition', [200], EMPTY),
  getAccount: def('get-account', [200], EMPTY),
  getDockerImageBuildDates: def('get-docker-image-build-dates', [200], EMPTY),
  getClusterInfo: def('get-cluster-info', [200], EMPTY),

  // ---- Blox logs / sizes (blockchain/blox.go) — 202 ---------------------------------------------------------
  fetchContainerLogs: def<[containerName: string, tailCount: string]>('fetch-container-logs', [202], (ContainerName, TailCount) =>
    json({ ContainerName, TailCount }),
  ),
  findBestAndTargetInLogs: def<[containerName: string, tailCount: string]>('find-bestandtarget-inlogs', [202], (ContainerName, TailCount) =>
    json({ NodeContainerName: ContainerName, TailCount }),
  ),
  getFolderSize: def<[folderPath: string]>('get-folder-size', [202], (folder_path) => json({ folder_path })),
  getDatastoreSize: def('get-datastore-size', [202], EMPTY),

  // ---- Accounts (blockchain/bl_account.go) — 202 -------------------------------------------------------------
  createAccount: def('account-create', [202], EMPTY),
  accountExists: def<[account: string]>('account-exists', [202], (account) => json({ account })),
  accountFund: def<[to: string]>('account-fund', [202], (to) => `{"amount":${ACCOUNT_FUND_AMOUNT},"to":${JSON.stringify(to)}}`),
  assetsBalance: def<[account: string, classId: number, assetId: number]>('asset-balance', [202], (account, class_id, asset_id) =>
    json({ account, class_id, asset_id }),
  ),

  // ---- Pools (blockchain/bl_pool.go) — 202 -------------------------------------------------------------------
  joinPool: def<[poolId: number, bloxPeerId: string]>('fula-pool-join', [202], (pool_id, peer_id) => json({ pool_id, peer_id })),
  joinPoolWithChain: def<[poolId: number, bloxPeerId: string, chainName: string]>('fula-pool-join', [202], (pool_id, peer_id, chain_name) =>
    json({ pool_id, peer_id, chain_name }),
  ),
  leavePool: def<[poolId: number]>('fula-pool-leave', [202], (pool_id) => json({ pool_id })),
  leavePoolWithChain: def<[poolId: number, chainName: string]>('fula-pool-leave', [202], (pool_id, chain_name) => json({ pool_id, chain_name })),
  cancelPoolJoin: def<[poolId: number]>('fula-pool-cancel_join', [202], (pool_id) => json({ pool_id })),
  listPoolJoinRequests: def<[poolId: number]>('fula-pool-poolrequests', [202], (pool_id) => json({ pool_id })),
  listPools: def('fula-pool', [202], EMPTY),
  listAvailableReplicationRequests: def<[poolId: number]>('fula-manifest-available', [202], (pool_id) => json({ pool_id })),
  batchUploadManifest: def<[cids: string[], poolId: number, replicationFactor: number]>(
    'fula-manifest-batch_upload',
    [202],
    (cid, pool_id, replication_factor) => json({ cid, pool_id, replication_factor }),
  ),
  replicateInPool: def<[cids: string[], uploader: string, poolId: number]>('replicate', 'any', (cids, uploader, pool_id) =>
    json({ cids, uploader, pool_id }),
  ),

  // ---- Plugins (blockchain/bl_plugins.go) — the Go client does not check the status ---------------------------
  listPlugins: def('list-plugins', 'any', EMPTY),
  listActivePlugins: def('list-active-plugins', 'any', EMPTY),
  installPlugin: def<[pluginName: string, params: string]>('install-plugin', 'any', (plugin_name, params) => json({ plugin_name, params })),
  uninstallPlugin: def<[pluginName: string]>('uninstall-plugin', 'any', (plugin_name) => json({ plugin_name })),
  showPluginStatus: def<[pluginName: string, lines: number]>('show-plugin-status', 'any', (plugin_name, lines) => json({ plugin_name, lines })),
  getInstallOutput: def<[pluginName: string, params: string]>('get-install-output', 'any', (plugin_name, params) => json({ plugin_name, params })),
  getInstallStatus: def<[pluginName: string]>('get-install-status', 'any', (plugin_name) => json({ plugin_name })),
  updatePlugin: def<[pluginName: string]>('update-plugin', 'any', (plugin_name) => json({ plugin_name })),

  // ---- Auto-pin (blockchain/bl_autopin.go) — 200 -------------------------------------------------------------
  autoPinPair: def<[token: string, endpoint: string]>('auto-pin-pair', [200], (pinning_token, pinning_endpoint) =>
    json({ pinning_token, pinning_endpoint }),
  ),
  autoPinRefresh: def<[token: string]>('auto-pin-refresh', [200], (pinning_token) => json({ pinning_token })),
  autoPinUnpair: def('auto-pin-unpair', [200], EMPTY),
} as const;

export type ActionKey = keyof typeof ACTIONS;

export function isOkStatus(spec: ActionSpec<never[]> | { ok: OkStatuses }, status: number): boolean {
  return spec.ok === 'any' ? true : spec.ok.includes(status);
}

/** Every distinct wire name the client can emit (for docs/tests). */
export function wireActionNames(): string[] {
  return Array.from(new Set(Object.values(ACTIONS).map((s) => s.action))).sort();
}

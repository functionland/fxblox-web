/**
 * `@/lib/fula` stand-in: vi.mock('@/lib/fula', () => import('@/components/main/__tests__/fulaMock')).
 * Every namespace method is a `vi.fn` with a benign default; tests override per case.
 */
import { vi } from 'vitest';

export const fula = {
  newClient: vi.fn(async () => 'app-peer'),
  isReady: vi.fn(async () => true),
  checkConnection: vi.fn(async () => true),
  logout: vi.fn(async () => true),
  shutdown: vi.fn(async () => undefined),
};

export const blockchain = {
  createAccount: vi.fn(async () => ({ seed: '', account: '' })),
  bloxFreeSpace: vi.fn(async () => ({ size: 0, avail: 0, used: 0, used_percentage: 0 })),
  joinPoolWithChain: vi.fn(async () => ({ status: 'ok' })),
  leavePoolWithChain: vi.fn(async () => ({ status: 'ok' })),
  accountFund: vi.fn(async () => ({})),
  autoPinPair: vi.fn(async () => ({ status: 'ok', pairing_secret: '', hardware_id: '' })),
};

export const fxblox = {
  wifiRemoveall: vi.fn(async () => ({ status: true, msg: '' })),
  reboot: vi.fn(async () => ({ status: true, msg: '' })),
  partition: vi.fn(async () => ({ status: true, msg: '' })),
  fetchContainerLogs: vi.fn(async () => ({ status: true, msg: '' })),
  getFolderSize: vi.fn(async () => ({ folder_path: '', size: '0' })),
  getDatastoreSize: vi.fn(async () => ({ size: '0', storage_max: '', count: '0', folder_path: '', version: '' })),
  getClusterInfo: vi.fn(async () => ({ cluster_peer_id: '', cluster_peer_name: '' })),
  listActivePlugins: vi.fn(async () => ({ status: true, msg: [] as string[] })),
  installPlugin: vi.fn(async () => ({ status: true, msg: 'ok' })),
  uninstallPlugin: vi.fn(async () => ({ status: true, msg: 'ok' })),
  getInstallStatus: vi.fn(async () => ({ status: true, msg: 'No Status' })),
  getInstallOutput: vi.fn(async () => ({ status: true, msg: {} as Record<string, string> })),
  updatePlugin: vi.fn(async () => ({ status: true, msg: 'ok' })),
};

export const identity = {};

export const loadFulaClient = vi.fn(async () => ({}));
export const isFulaClientAvailable = vi.fn(async () => true);
export const configure = vi.fn(async () => undefined);
export const isFulaWebError = (_e: unknown): boolean => false;

/** Clears calls AND restores the default implementations (vitest 3 `mockReset` keeps the `vi.fn(impl)` original). */
export function resetFulaMock(): void {
  for (const ns of [fula, blockchain, fxblox]) {
    for (const fn of Object.values(ns)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
}

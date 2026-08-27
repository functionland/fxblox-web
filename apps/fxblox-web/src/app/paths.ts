/**
 * URL builders for every screen (plan §WS4 route table) + `ROUTE_NAME_TO_PATH`, the mobile `Routes` → URL map.
 * All paths are basename-relative (react-router adds `import.meta.env.BASE_URL`).
 */
import { Routes } from '@/navigation/routes';
import type { ScenarioId } from '@/features/diagnostics/quickStartPrompts';

export type QueryValue = string | number | boolean | undefined | null;
export type Query = Record<string, QueryValue>;

/** Appends `?k=v` pairs; `true` → `1`, `false`/`undefined`/`null` are dropped. */
export function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === false) continue;
    q.set(key, value === true ? '1' : String(value));
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

const seg = (value: string | number): string => encodeURIComponent(String(value));

/** "Link Password" → "link-password" (spaced mobile route names → slugs). */
export const slugify = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export const paths = {
  root: '/',
  setup: {
    root: '/setup',
    welcome: '/setup/welcome',
    /** Was "Connect To Wallet" on mobile (Chrome LNA / Bluetooth / camera explainer on web). */
    requirements: '/setup/requirements',
    linkPassword: '/setup/link-password',
    connectBlox: '/setup/connect-blox',
    connectExisting: '/setup/connect-existing',
    setAuthorizer: (query?: { manual?: boolean; ip?: string; port?: number; peerId?: string }) =>
      withQuery('/setup/set-authorizer', query),
    connectWifi: '/setup/connect-wifi',
    checkConnection: (query?: { ssid?: string }) => withQuery('/setup/check-connection', query),
    complete: (query?: { manual?: boolean }) => withQuery('/setup/complete', query),
    bluetooth: '/setup/bluetooth',
  },
  blox: '/blox',
  bloxManage: '/blox/manage',
  users: '/users',
  plugins: '/plugins',
  plugin: (name: string) => `/plugins/${seg(name)}`,
  /** Diagnostics tab; `scenario` is consumed once by the screen (`useConsumeOnce('scenario')`). */
  bloxAi: (query?: { scenario?: ScenarioId }) => withQuery('/blox-ai', query),
  devices: '/devices',
  settings: {
    root: '/settings',
    bloxStatusMonitor: '/settings/blox-status-monitor',
    mode: '/settings/mode',
    chain: '/settings/chain',
    pools: '/settings/pools',
    pool: (poolId: string | number) => `/settings/pools/${seg(poolId)}`,
    joinRequests: (poolId: string | number) => `/settings/pools/${seg(poolId)}/join-requests`,
    dapps: '/settings/dapps',
    autopin: '/settings/autopin',
    bluetooth: '/settings/bluetooth',
    /** Behind `VITE_ENABLE_BLOX_LOGS`. */
    logs: '/settings/logs',
    about: '/settings/about',
    /** Redirects to `/setup/connect-existing` (mobile "Blox discovery" menu item). */
    bloxDiscovery: '/settings/blox-discovery',
  },
  /** FxFiles deep link (`fxblox://connectdapp/...` on mobile). */
  connectDApp: (p: {
    appName: string;
    bundleId: string;
    peerId: string;
    returnDeepLink: string;
    accountId: string;
  }) =>
    `/connectdapp/${seg(p.appName)}/${seg(p.bundleId)}/${seg(p.peerId)}/${seg(p.returnDeepLink)}/${seg(p.accountId)}`,
  autopinPair: (query?: { token?: string; endpoint?: string; returnUrl?: string }) =>
    withQuery('/autopin-pair', query),
  gallery: '/gallery',
  galleryEntry: (id: string) => `/gallery/${seg(id)}`,
} as const;

/** Route patterns (react-router syntax) for the parameterised screens. */
export const ROUTE_PATTERNS = {
  plugin: '/plugins/:name',
  poolDetails: '/settings/pools/:poolId',
  joinRequests: '/settings/pools/:poolId/join-requests',
  connectDApp: '/connectdapp/:appName/:bundleId/:peerId/:returnDeepLink/:accountId',
  autopinPair: '/autopin-pair',
  galleryEntry: '/gallery/:id',
} as const;

/**
 * Mobile routes that are dead on mobile and not ported (plan §WS4 "Not ported"): `Hub`/`HubTab` (Hub.screen),
 * root `Plugin` (the root-stack Plugin.screen registration; the tab + `/plugins/:name` page are ported).
 * They map to `DEAD_ROUTE_PATH` so `ROUTE_NAME_TO_PATH` stays a total `Record<Routes, string>`.
 */
export const DEAD_ROUTES: ReadonlySet<Routes> = new Set<Routes>([
  Routes.Hub,
  Routes.HubTab,
  Routes.Plugin,
]);
export const DEAD_ROUTE_PATH = '/';

const gallery = (name: string) => `${paths.gallery}/${slugify(name)}`;

/** Every mobile `Routes` value → web URL (patterns for parameterised screens). */
export const ROUTE_NAME_TO_PATH: Record<Routes, string> = {
  // Root
  [Routes.InitialSetup]: paths.setup.welcome,
  [Routes.MainTabs]: paths.blox,
  [Routes.Hub]: DEAD_ROUTE_PATH,
  [Routes.Plugin]: DEAD_ROUTE_PATH,

  // Initial Setup
  [Routes.Welcome]: paths.setup.welcome,
  [Routes.LinkPassword]: paths.setup.linkPassword,
  [Routes.ConnectToWallet]: paths.setup.requirements,
  [Routes.ConnectToBlox]: paths.setup.connectBlox,
  [Routes.ConnectToExistingBlox]: paths.setup.connectExisting,
  [Routes.ConnectToWifi]: paths.setup.connectWifi,
  [Routes.CheckConnection]: paths.setup.checkConnection(),
  [Routes.SetupComplete]: paths.setup.complete(),
  [Routes.SetBloxAuthorizer]: paths.setup.setAuthorizer(),

  // Main tabs
  [Routes.BloxTab]: paths.blox,
  [Routes.UsersTab]: paths.users,
  [Routes.HubTab]: DEAD_ROUTE_PATH,
  [Routes.PluginTab]: paths.plugins,
  [Routes.DevicesTab]: paths.devices,
  [Routes.SettingsTab]: paths.settings.root,
  [Routes.DiagnosticsTab]: paths.bloxAi(),

  // Blox Manager
  [Routes.BloxManager]: paths.bloxManage,

  // Settings stack
  [Routes.Settings]: paths.settings.root,
  [Routes.ConnectedDApps]: paths.settings.dapps,
  [Routes.BloxStatusMonitor]: paths.settings.bloxStatusMonitor,
  [Routes.Mode]: paths.settings.mode,
  [Routes.ChainSelection]: paths.settings.chain,
  [Routes.Pools]: paths.settings.pools,
  [Routes.PoolDetails]: ROUTE_PATTERNS.poolDetails,
  [Routes.JoinRequests]: ROUTE_PATTERNS.joinRequests,
  [Routes.About]: paths.settings.about,
  [Routes.ComponentGallery]: paths.gallery,
  [Routes.BloxLogs]: paths.settings.logs,
  // Mobile opens BluetoothCommands inside the InitialSetup stack; on web the Settings menu keeps the AppShell
  // (`/settings/bluetooth`) and the setup flow has its own copy at `/setup/bluetooth` (same screen module).
  [Routes.BluetoothCommands]: paths.settings.bluetooth,
  [Routes.AutoPinPairing]: paths.settings.autopin,

  // Component gallery
  [Routes.Avatars]: gallery(Routes.Avatars),
  [Routes.Buttons]: gallery(Routes.Buttons),
  [Routes.ButtonGroups]: gallery(Routes.ButtonGroups),
  [Routes.Forms]: gallery(Routes.Forms),
  [Routes.Gallery]: gallery(Routes.Gallery),
  [Routes.UsageBar]: gallery(Routes.UsageBar),
  [Routes.ProgressBar]: gallery(Routes.ProgressBar),
  [Routes.Tabs]: gallery(Routes.Tabs),
  [Routes.Toast]: gallery(Routes.Toast),
  [Routes.Table]: gallery(Routes.Table),
  [Routes.Breadcrumbs]: gallery(Routes.Breadcrumbs),
  [Routes.Files]: gallery(Routes.Files),
};

/** `navigate(Routes.X)` compatibility: the URL for a mobile route name (dead routes → `/`). */
export function pathForRoute(route: Routes): string {
  return ROUTE_NAME_TO_PATH[route];
}

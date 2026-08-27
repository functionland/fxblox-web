/**
 * Setup-flow state machine (plan §WS3): a pure reducer over the InitialSetup steps + declarative effects that
 * WS4's SetupShell executes (navigation, polling, AP disable, deep-link consumption). Routes map 1:1 to the
 * mobile `Routes.*`:
 *
 *   Welcome → Requirements (was ConnectToWallet) → LinkPassword → ConnectToBlox → SetBloxAuthorizer →
 *   ConnectToWifi → CheckConnection → SetupComplete → MainTabs
 *   branches: ConnectToExistingBlox (LAN/discovery) → SetBloxAuthorizer(manual) → SetupComplete(manual)
 *             BluetoothCommands (Settings › Bluetooth, reachable from ConnectToBlox)
 */

export type SetupStep =
  | 'welcome'
  | 'requirements'
  | 'linkPassword'
  | 'connectToBlox'
  | 'connectToExistingBlox'
  | 'setBloxAuthorizer'
  | 'connectToWifi'
  | 'checkConnection'
  | 'setupComplete'
  | 'bluetoothCommands'
  | 'done';

export type SetupTransport = 'http' | 'ble' | 'lan';

export interface SetupContext {
  step: SetupStep;
  history: SetupStep[];
  transport: SetupTransport | null;
  /** Existing-Blox / LAN flow: the target reached by ip:port instead of the hotspot. */
  manual: boolean;
  targetIp?: string;
  targetPort?: number;
  targetPeerId?: string;
  /** Set once SetBloxAuthorizer exchanged config. */
  bloxPeerId?: string;
  clusterPeerId?: string;
  ssid?: string;
  walletLinked: boolean;
  authorizerSet: boolean;
  wifiConnected: boolean;
  /** The hotspot dropped right after wifi/connect (the Blox joined Wi-Fi) — proceed, as mobile does. */
  apDropped: boolean;
  /** Stashed deep link (`/autopin-pair?…`, `/connectdapp/…`) to resume after "Home". */
  deepLink?: string;
}

export type SetupEvent =
  | { type: 'START' }
  | { type: 'REQUIREMENTS_OK' }
  | { type: 'PASSWORD_LINKED'; appPeerId?: string }
  | { type: 'SKIP_TO_EXISTING' }
  | { type: 'BLOX_CONNECTED'; transport: 'http' | 'ble' }
  | { type: 'EXISTING_SELECTED'; ip?: string; port?: number; peerId?: string }
  | { type: 'AUTHORIZER_SET'; bloxPeerId: string; clusterPeerId?: string }
  | { type: 'AUTHORIZER_SKIPPED' }
  | { type: 'WIFI_CONNECTED'; ssid: string; apDropped?: boolean }
  | { type: 'WIFI_SKIPPED' }
  | { type: 'CONNECTION_CONFIRMED' }
  | { type: 'HOME' }
  | { type: 'OPEN_BLUETOOTH_COMMANDS' }
  | { type: 'BACK' }
  | { type: 'GO'; step: SetupStep }
  | { type: 'STASH_DEEP_LINK'; url: string }
  | { type: 'RESET' };

export type SetupEffect =
  | { type: 'navigate'; path: string; replace?: boolean }
  | { type: 'pollWifiStatus'; ssid: string }
  | { type: 'stopPolling' }
  | { type: 'disableAp' }
  | { type: 'checkInternet' }
  | { type: 'initFula'; bloxPeerId: string }
  | { type: 'consumeDeepLink'; url: string };

export const SETUP_BASE = '/setup';

export const STEP_ROUTES: Record<SetupStep, string> = {
  welcome: `${SETUP_BASE}/welcome`,
  requirements: `${SETUP_BASE}/requirements`,
  linkPassword: `${SETUP_BASE}/link-password`,
  connectToBlox: `${SETUP_BASE}/connect-blox`,
  connectToExistingBlox: `${SETUP_BASE}/connect-existing`,
  setBloxAuthorizer: `${SETUP_BASE}/set-authorizer`,
  connectToWifi: `${SETUP_BASE}/connect-wifi`,
  checkConnection: `${SETUP_BASE}/check-connection`,
  setupComplete: `${SETUP_BASE}/complete`,
  bluetoothCommands: `${SETUP_BASE}/bluetooth`,
  done: '/blox',
};

/** Progress bar values (mobile: 20/40/60/80/90/100). */
export const STEP_PROGRESS: Record<SetupStep, number> = {
  welcome: 0,
  requirements: 20,
  linkPassword: 20,
  connectToBlox: 40,
  connectToExistingBlox: 40,
  setBloxAuthorizer: 60,
  connectToWifi: 80,
  checkConnection: 90,
  setupComplete: 100,
  bluetoothCommands: 40,
  done: 100,
};

export function initialSetupContext(overrides: Partial<SetupContext> = {}): SetupContext {
  return {
    step: 'welcome',
    history: [],
    transport: null,
    manual: false,
    walletLinked: false,
    authorizerSet: false,
    wifiConnected: false,
    apDropped: false,
    ...overrides,
  };
}

export interface SetupTransition {
  context: SetupContext;
  effects: SetupEffect[];
}

function routeFor(ctx: SetupContext, step: SetupStep): string {
  const base = STEP_ROUTES[step];
  if (step === 'setBloxAuthorizer' && ctx.manual) {
    const q = new URLSearchParams({ manual: '1' });
    if (ctx.targetIp) q.set('ip', ctx.targetIp);
    if (ctx.targetPort) q.set('port', String(ctx.targetPort));
    if (ctx.targetPeerId) q.set('peerId', ctx.targetPeerId);
    return `${base}?${q.toString()}`;
  }
  if (step === 'setupComplete' && ctx.manual) return `${base}?manual=1`;
  if (step === 'checkConnection' && ctx.ssid) return `${base}?ssid=${encodeURIComponent(ctx.ssid)}`;
  return base;
}

function go(ctx: SetupContext, step: SetupStep, extra: SetupEffect[] = [], opts: { replace?: boolean } = {}): SetupTransition {
  const next: SetupContext = { ...ctx, step, history: [...ctx.history, ctx.step] };
  const nav: SetupEffect = { type: 'navigate', path: routeFor(next, step) };
  if (opts.replace) nav.replace = true;
  return { context: next, effects: [nav, ...extra] };
}

/** Which steps a given event may legally fire from (guards against stale UI). */
export function canProceed(ctx: SetupContext, event: SetupEvent): boolean {
  switch (event.type) {
    case 'BLOX_CONNECTED':
      return ctx.walletLinked && (ctx.step === 'connectToBlox' || ctx.step === 'bluetoothCommands');
    case 'AUTHORIZER_SET':
    case 'AUTHORIZER_SKIPPED':
      return ctx.step === 'setBloxAuthorizer';
    case 'WIFI_CONNECTED':
    case 'WIFI_SKIPPED':
      return ctx.step === 'connectToWifi';
    case 'CONNECTION_CONFIRMED':
      return ctx.step === 'checkConnection';
    case 'HOME':
      return ctx.step === 'setupComplete';
    default:
      return true;
  }
}

export function setupReducer(ctx: SetupContext, event: SetupEvent): SetupTransition {
  if (!canProceed(ctx, event)) {
    return { context: ctx, effects: [] };
  }
  switch (event.type) {
    case 'START':
      return go(ctx, 'requirements');

    case 'REQUIREMENTS_OK':
      return go(ctx, 'linkPassword');

    case 'PASSWORD_LINKED':
      return go({ ...ctx, walletLinked: true }, 'connectToBlox');

    case 'SKIP_TO_EXISTING':
      return go(ctx, 'connectToExistingBlox');

    case 'BLOX_CONNECTED':
      return go({ ...ctx, transport: event.transport, manual: false, targetIp: undefined, targetPort: undefined, targetPeerId: undefined }, 'setBloxAuthorizer');

    case 'EXISTING_SELECTED':
      return go({ ...ctx, transport: 'lan', manual: true, targetIp: event.ip, targetPort: event.port, targetPeerId: event.peerId }, 'setBloxAuthorizer');

    case 'AUTHORIZER_SET': {
      const next = { ...ctx, authorizerSet: true, bloxPeerId: event.bloxPeerId, clusterPeerId: event.clusterPeerId };
      if (ctx.manual) {
        // Existing Blox already on the user's network: no Wi-Fi step.
        return go(next, 'setupComplete', [{ type: 'checkInternet' }, { type: 'initFula', bloxPeerId: event.bloxPeerId }]);
      }
      return go(next, 'connectToWifi');
    }

    case 'AUTHORIZER_SKIPPED':
      return go({ ...ctx, authorizerSet: false }, 'connectToWifi');

    case 'WIFI_CONNECTED': {
      const next = { ...ctx, wifiConnected: true, ssid: event.ssid, apDropped: !!event.apDropped };
      // CheckConnection: "rejoin FxBlox" instructions + wifi/status polling; AP is disabled once confirmed.
      return go(next, 'checkConnection', [{ type: 'pollWifiStatus', ssid: event.ssid }]);
    }

    case 'WIFI_SKIPPED':
      return go(ctx, 'setupComplete', completionEffects(ctx));

    case 'CONNECTION_CONFIRMED':
      return go(ctx, 'setupComplete', [{ type: 'stopPolling' }, { type: 'disableAp' }, ...completionEffects(ctx)]);

    case 'HOME': {
      const effects: SetupEffect[] = [];
      if (ctx.deepLink) effects.push({ type: 'consumeDeepLink', url: ctx.deepLink });
      const next: SetupContext = { ...ctx, step: 'done', history: [...ctx.history, ctx.step], deepLink: undefined };
      effects.push({ type: 'navigate', path: ctx.deepLink ?? STEP_ROUTES.done, replace: true });
      return { context: next, effects };
    }

    case 'OPEN_BLUETOOTH_COMMANDS':
      return go(ctx, 'bluetoothCommands');

    case 'BACK': {
      const history = [...ctx.history];
      const prev = history.pop();
      if (!prev) return { context: ctx, effects: [{ type: 'navigate', path: STEP_ROUTES.welcome, replace: true }] };
      const next: SetupContext = { ...ctx, step: prev, history };
      return { context: next, effects: [{ type: 'navigate', path: routeFor(next, prev) }] };
    }

    case 'GO':
      return go(ctx, event.step);

    case 'STASH_DEEP_LINK':
      return { context: { ...ctx, deepLink: event.url }, effects: [] };

    case 'RESET':
      return { context: initialSetupContext({ deepLink: ctx.deepLink }), effects: [{ type: 'navigate', path: STEP_ROUTES.welcome, replace: true }] };

    default:
      return { context: ctx, effects: [] };
  }
}

function completionEffects(ctx: SetupContext): SetupEffect[] {
  const effects: SetupEffect[] = [{ type: 'checkInternet' }];
  if (ctx.bloxPeerId) effects.push({ type: 'initFula', bloxPeerId: ctx.bloxPeerId });
  return effects;
}

/** Map a URL path back to a step (direct loads / refresh inside the setup shell). */
export function stepForPath(pathname: string): SetupStep | null {
  const entry = (Object.entries(STEP_ROUTES) as [SetupStep, string][]).find(([, path]) => path === pathname);
  return entry ? entry[0] : null;
}

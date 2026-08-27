import { describe, expect, test } from 'vitest';
import { initialSetupContext, setupReducer, STEP_PROGRESS, STEP_ROUTES, stepForPath, type SetupContext, type SetupEvent } from '../setupMachine';

function run(events: SetupEvent[], start: SetupContext = initialSetupContext()) {
  let ctx = start;
  const effects = [];
  for (const e of events) {
    const t = setupReducer(ctx, e);
    ctx = t.context;
    effects.push(...t.effects);
  }
  return { ctx, effects };
}

const navs = (effects: { type: string; path?: string }[]) => effects.filter((e) => e.type === 'navigate').map((e) => e.path);

describe('setupMachine — hotspot happy path', () => {
  test('Welcome → Requirements → LinkPassword → ConnectToBlox → SetBloxAuthorizer → ConnectToWifi → CheckConnection → SetupComplete → Home', () => {
    const { ctx, effects } = run([
      { type: 'START' },
      { type: 'REQUIREMENTS_OK' },
      { type: 'PASSWORD_LINKED' },
      { type: 'BLOX_CONNECTED', transport: 'http' },
      { type: 'AUTHORIZER_SET', bloxPeerId: '12D3KooWBlox', clusterPeerId: '12D3KooWCluster' },
      { type: 'WIFI_CONNECTED', ssid: 'HomeNet', apDropped: true },
      { type: 'CONNECTION_CONFIRMED' },
      { type: 'HOME' },
    ]);
    expect(ctx.step).toBe('done');
    expect(ctx).toEqual(expect.objectContaining({ transport: 'http', manual: false, walletLinked: true, authorizerSet: true, wifiConnected: true, apDropped: true, ssid: 'HomeNet', bloxPeerId: '12D3KooWBlox' }));
    expect(navs(effects)).toEqual([
      '/setup/requirements',
      '/setup/link-password',
      '/setup/connect-blox',
      '/setup/set-authorizer',
      '/setup/connect-wifi',
      '/setup/check-connection?ssid=HomeNet',
      '/setup/complete',
      '/blox',
    ]);
    expect(effects).toEqual(expect.arrayContaining([{ type: 'pollWifiStatus', ssid: 'HomeNet' }, { type: 'stopPolling' }, { type: 'disableAp' }, { type: 'checkInternet' }, { type: 'initFula', bloxPeerId: '12D3KooWBlox' }]));
  });

  test('BLE transport is recorded', () => {
    const { ctx } = run([{ type: 'START' }, { type: 'REQUIREMENTS_OK' }, { type: 'PASSWORD_LINKED' }, { type: 'BLOX_CONNECTED', transport: 'ble' }]);
    expect(ctx.transport).toBe('ble');
    expect(ctx.step).toBe('setBloxAuthorizer');
  });

  test('WIFI_SKIPPED goes straight to SetupComplete with the completion effects', () => {
    const { ctx, effects } = run([
      { type: 'START' },
      { type: 'REQUIREMENTS_OK' },
      { type: 'PASSWORD_LINKED' },
      { type: 'BLOX_CONNECTED', transport: 'http' },
      { type: 'AUTHORIZER_SET', bloxPeerId: 'B' },
      { type: 'WIFI_SKIPPED' },
    ]);
    expect(ctx.step).toBe('setupComplete');
    expect(effects.at(-1)).toEqual({ type: 'initFula', bloxPeerId: 'B' });
  });
});

describe('setupMachine — existing Blox (LAN / manual) branch', () => {
  test('SKIP_TO_EXISTING → EXISTING_SELECTED carries ip/port/peerId into the manual authorizer route and skips Wi-Fi', () => {
    const { ctx, effects } = run([
      { type: 'START' },
      { type: 'REQUIREMENTS_OK' },
      { type: 'PASSWORD_LINKED' },
      { type: 'SKIP_TO_EXISTING' },
      { type: 'EXISTING_SELECTED', ip: '192.168.1.20', port: 3500, peerId: '12D3KooWBlox' },
      { type: 'AUTHORIZER_SET', bloxPeerId: '12D3KooWBlox' },
    ]);
    expect(ctx.manual).toBe(true);
    expect(ctx.transport).toBe('lan');
    expect(ctx.step).toBe('setupComplete');
    expect(navs(effects)).toEqual([
      '/setup/requirements',
      '/setup/link-password',
      '/setup/connect-blox',
      '/setup/connect-existing',
      '/setup/set-authorizer?manual=1&ip=192.168.1.20&port=3500&peerId=12D3KooWBlox',
      '/setup/complete?manual=1',
    ]);
    expect(effects).toEqual(expect.arrayContaining([{ type: 'checkInternet' }, { type: 'initFula', bloxPeerId: '12D3KooWBlox' }]));
  });
});

describe('setupMachine — guards, back, deep links', () => {
  test('events fired from the wrong step are ignored', () => {
    const { ctx, effects } = run([{ type: 'WIFI_CONNECTED', ssid: 'x' }, { type: 'AUTHORIZER_SET', bloxPeerId: 'B' }, { type: 'HOME' }]);
    expect(ctx.step).toBe('welcome');
    expect(effects).toEqual([]);
  });

  test('BLOX_CONNECTED requires the wallet to be linked', () => {
    const { ctx } = run([{ type: 'START' }, { type: 'REQUIREMENTS_OK' }, { type: 'GO', step: 'connectToBlox' }, { type: 'BLOX_CONNECTED', transport: 'http' }]);
    expect(ctx.step).toBe('connectToBlox');
  });

  test('BACK pops history; at the root it navigates to welcome', () => {
    const { ctx, effects } = run([{ type: 'START' }, { type: 'REQUIREMENTS_OK' }, { type: 'BACK' }]);
    expect(ctx.step).toBe('requirements');
    expect(navs(effects).at(-1)).toBe('/setup/requirements');
    const root = setupReducer(initialSetupContext(), { type: 'BACK' });
    expect(root.effects).toEqual([{ type: 'navigate', path: '/setup/welcome', replace: true }]);
  });

  test('a stashed deep link is consumed exactly once at HOME', () => {
    const { ctx, effects } = run([
      { type: 'STASH_DEEP_LINK', url: '/autopin-pair?token=t&endpoint=e' },
      { type: 'START' },
      { type: 'REQUIREMENTS_OK' },
      { type: 'PASSWORD_LINKED' },
      { type: 'BLOX_CONNECTED', transport: 'http' },
      { type: 'AUTHORIZER_SET', bloxPeerId: 'B' },
      { type: 'WIFI_SKIPPED' },
      { type: 'HOME' },
    ]);
    expect(ctx.deepLink).toBeUndefined();
    expect(effects).toEqual(expect.arrayContaining([{ type: 'consumeDeepLink', url: '/autopin-pair?token=t&endpoint=e' }, { type: 'navigate', path: '/autopin-pair?token=t&endpoint=e', replace: true }]));
  });

  test('RESET returns to welcome but keeps a stashed deep link', () => {
    const { ctx } = run([{ type: 'STASH_DEEP_LINK', url: '/connectdapp/x' }, { type: 'START' }, { type: 'RESET' }]);
    expect(ctx.step).toBe('welcome');
    expect(ctx.deepLink).toBe('/connectdapp/x');
  });

  test('OPEN_BLUETOOTH_COMMANDS is reachable and BLOX_CONNECTED works from there', () => {
    const { ctx } = run([{ type: 'START' }, { type: 'REQUIREMENTS_OK' }, { type: 'PASSWORD_LINKED' }, { type: 'OPEN_BLUETOOTH_COMMANDS' }, { type: 'BLOX_CONNECTED', transport: 'ble' }]);
    expect(ctx.step).toBe('setBloxAuthorizer');
  });
});

describe('setupMachine — routes + progress', () => {
  test('every step has a route and progress; progress is monotonic along the main path', () => {
    const main = ['welcome', 'requirements', 'linkPassword', 'connectToBlox', 'setBloxAuthorizer', 'connectToWifi', 'checkConnection', 'setupComplete'] as const;
    let last = -1;
    for (const step of main) {
      expect(STEP_ROUTES[step]).toBeTruthy();
      expect(STEP_PROGRESS[step]).toBeGreaterThanOrEqual(last);
      last = STEP_PROGRESS[step];
    }
    expect(STEP_PROGRESS.setupComplete).toBe(100);
    expect(stepForPath('/setup/connect-wifi')).toBe('connectToWifi');
    expect(stepForPath('/nope')).toBeNull();
  });
});

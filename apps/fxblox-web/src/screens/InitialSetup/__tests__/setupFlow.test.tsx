/**
 * Navigation order of the whole setup flow (plan §WS3 state machine), driven through the real screens:
 *   Welcome → Requirements → LinkPassword (existing identity) → ConnectToBlox (hotspot) → SetBloxAuthorizer →
 *   ConnectToWifi → CheckConnection → SetupComplete → Home (/blox)
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/platform/lanHttp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/lanHttp')>();
  return { ...actual, lanFetch: vi.fn(async () => new Response('')) };
});
vi.mock('@/platform/network', () => ({
  isOnline: vi.fn(async () => true),
  onOnlineChange: () => () => undefined,
}));
vi.mock('@/api/bloxHardware', () => ({
  getBloxProperties: vi.fn(),
  getBloxPropertiesAtIp: vi.fn(),
  exchangeConfig: vi.fn(),
  exchangeConfigAtIp: vi.fn(),
  bloxFormatDisk: vi.fn(),
  bloxDeleteFulaConfig: vi.fn(),
}));
vi.mock('@/api/wifi', () => ({
  getWifiList: vi.fn(async () => ({ data: [{ ssid: 'HomeNet' }] })),
  postWifiConnect: vi.fn(async () => ({ data: 'Wifi connected!' })),
  getWifiStatus: vi.fn(async () => ({ data: { status: true } })),
  putApDisable: vi.fn(async () => ({ data: {} })),
}));
vi.mock('@/utils/helper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/helper')>();
  return {
    ...actual,
    getMyDID: () => 'did:key:zFlow',
    getMyDIDKeyPair: () => ({ secretKey: new Uint8Array(64).fill(1), pubKey: new Uint8Array(32) }),
    initFula: vi.fn(async () => 'peer'),
  };
});
vi.mock('@/lib/fula', () => ({
  fula: {},
  blockchain: {},
  identity: {},
  fxblox: {
    getClusterInfo: vi.fn(async () => ({ cluster_peer_id: 'cluster', cluster_peer_name: 'c' })),
  },
}));

import * as api from '@/api/bloxHardware';
import { useBloxsStore } from '@/stores';
import { _setTimingsForTests as setAuthorizerTimings } from '../SetBloxAuthorizer';
import { _setTimingsForTests as setCheckTimings } from '../CheckConnection';
import { _setTimingsForTests as setCompleteTimings } from '../SetupComplete';
import { renderSetupAt, resetStores, TEST_APP_PEER_ID, TEST_BLOX_PEER_ID } from './renderSetup';

describe('setup flow navigation order', () => {
  const restores: Array<() => void> = [];
  beforeEach(() => {
    resetStores({ identity: true, appPeerId: TEST_APP_PEER_ID });
    (api.getBloxProperties as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        hardwareID: 'hw',
        restartNeeded: 'false',
        kubo_peer_id: TEST_BLOX_PEER_ID,
        bloxFreeSpace: { size: 10, avail: 9, used: 1, used_percentage: 10, device_count: 1 },
      },
    });
    (api.exchangeConfig as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { peer_id: TEST_BLOX_PEER_ID },
    });
    restores.push(
      setAuthorizerTimings({ skipButtonMs: 60_000, formatDiskButtonMs: 60_000 }),
      setCheckTimings({ pollMs: 30 }),
      setCompleteTimings({
        internetGraceMs: 10,
        fulaInitDelayMs: 10,
        reachStartDelayMs: 5,
        reachRetryDelayMs: 5,
        internetRetryDelayMs: 5,
        hotspotPollMs: 60_000,
      }),
    );
  });
  afterEach(() => {
    for (const r of restores.splice(0)) r();
  });

  it('walks Welcome → … → Setup complete → Home in the mobile order', async () => {
    const user = userEvent.setup();
    const { router } = await renderSetupAt('/setup/welcome');
    // Wait for the router AND for the lazy screen to be committed (the previous screen's buttons are still in
    // the DOM until then).
    const at = async (path: string, screenId: string) => {
      await waitFor(() => expect(router.state.location.pathname).toBe(path), { timeout: 20_000 });
      await screen.findByTestId(`setup-${screenId}`);
    };
    const visited: string[] = [];
    router.subscribe((state) => {
      const p = state.location.pathname;
      if (visited[visited.length - 1] !== p) visited.push(p);
    });

    await screen.findByTestId('setup-welcome');
    await user.click(screen.getByTestId('setup-continue')); // Welcome
    await at('/setup/requirements', 'requirements');
    await user.click(screen.getByTestId('setup-continue')); // Requirements
    await at('/setup/link-password', 'link-password');
    expect(await screen.findByTestId('did')).toHaveTextContent('did:key:zFlow');
    await user.click(screen.getByTestId('setup-continue')); // LinkPassword (existing identity)
    await at('/setup/connect-blox', 'connect-blox');
    await user.click(screen.getByTestId('hotspot-check')); // ConnectToBlox (hotspot answers)
    await at('/setup/set-authorizer', 'set-authorizer');
    await screen.findByTestId('blox-peer-id-value'); // auto exchange done
    await user.click(screen.getByTestId('setup-continue')); // SetBloxAuthorizer → Wi-Fi
    await at('/setup/connect-wifi', 'connect-wifi');
    // The Blox is now stored and current before the Wi-Fi step (mobile order).
    expect(useBloxsStore.getState().currentBloxPeerId).toBe(TEST_BLOX_PEER_ID);
    await user.click(await screen.findByText('HomeNet')); // ConnectToWifi
    const sheet = await screen.findByTestId('wifi-password-sheet');
    await user.type(within(sheet).getByTestId('wifi-password'), 'pw');
    await user.click(within(sheet).getByTestId('wifi-connect'));
    await at('/setup/check-connection', 'check-connection');
    expect(router.state.location.search).toBe('?ssid=HomeNet');
    await user.click(screen.getByTestId('im-connected')); // CheckConnection
    await at('/setup/complete', 'complete');
    // SetupComplete: initFula + connection check → COMPLETED → Home
    useBloxsStore.setState({
      checkBloxConnection: async () => {
        useBloxsStore.setState((s) => ({
          bloxsConnectionStatus: { ...s.bloxsConnectionStatus, [TEST_BLOX_PEER_ID]: 'CONNECTED' },
        }));
        return true;
      },
    });
    await user.click(await screen.findByTestId('setup-continue'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/blox'));

    expect(visited).toEqual([
      '/setup/welcome',
      '/setup/requirements',
      '/setup/link-password',
      '/setup/connect-blox',
      '/setup/set-authorizer',
      '/setup/connect-wifi',
      '/setup/check-connection',
      '/setup/complete',
      '/blox',
    ]);
    // Home is a `replace`: Back from /blox does not return into the setup flow.
    expect(window.history.state?.idx ?? router.state.location.state?.idx).not.toBe(9);
  });
});

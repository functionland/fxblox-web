import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBleMockState, mockBluetoothModule, resetBleMockState } from './bleMocks';

const ble = vi.hoisted(() => ({ state: null as ReturnType<typeof createBleMockState> | null }));

vi.mock('@/api/bloxHardware', () => ({
  getBloxProperties: vi.fn(),
  getBloxPropertiesAtIp: vi.fn(),
  exchangeConfig: vi.fn(),
  exchangeConfigAtIp: vi.fn(),
  bloxFormatDisk: vi.fn(),
  bloxDeleteFulaConfig: vi.fn(),
}));
vi.mock('@/utils/helper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/helper')>();
  return {
    ...actual,
    initFula: vi.fn(),
    getMyDIDKeyPair: () => ({ secretKey: new Uint8Array(64).fill(7), pubKey: new Uint8Array(32) }),
  };
});
vi.mock('@/platform/bluetooth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/bluetooth')>();
  ble.state ??= createBleMockState();
  return mockBluetoothModule(actual, ble.state);
});

import * as api from '@/api/bloxHardware';
import { BleRegistry } from '@/platform/bluetooth';
import { LanHttpError } from '@/platform/lanHttp';
import { useBloxsStore, useUserProfileStore } from '@/stores';
import * as lanIpCache from '@/utils/lanIpCache';
import { _setTimingsForTests } from '../SetBloxAuthorizer';
import {
  renderSetupAt,
  resetStores,
  TEST_APP_PEER_ID,
  TEST_BLOX_PEER_ID,
  TEST_CLUSTER_PEER_ID,
} from './renderSetup';

const m = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const goodProps = () => ({
  data: {
    hardwareID: 'hw-1',
    restartNeeded: 'false',
    kubo_peer_id: TEST_BLOX_PEER_ID,
    ipfs_cluster_peer_id: TEST_CLUSTER_PEER_ID,
    bloxFreeSpace: {
      size: 1_000_000,
      avail: 900_000,
      used: 100_000,
      used_percentage: 10,
      device_count: 1,
    },
  },
});
const SEED = new Uint8Array(64).fill(7).join(',');

describe('SetBloxAuthorizer', () => {
  let restore: () => void;
  beforeEach(() => {
    resetStores({ identity: true, appPeerId: TEST_APP_PEER_ID });
    for (const fn of Object.values(api)) m(fn).mockReset();
    m(api.bloxDeleteFulaConfig).mockResolvedValue({ data: { status: true } });
    m(api.bloxFormatDisk).mockResolvedValue({ data: { status: true } });
    lanIpCache.clear();
    resetBleMockState(ble.state!);
    BleRegistry._resetForTests();
    restore = _setTimingsForTests({ skipButtonMs: 0, formatDiskButtonMs: 0 });
  });
  afterEach(() => restore());

  it('hotspot path: properties → auto exchange → Next stores the Blox and goes to Connect to Wi-Fi', async () => {
    m(api.getBloxProperties).mockResolvedValue(goodProps());
    m(api.exchangeConfig).mockResolvedValue({ data: { peer_id: `${TEST_BLOX_PEER_ID}\n` } });
    const { router } = await renderSetupAt('/setup/set-authorizer');
    expect(await screen.findByTestId('app-peer-id-value')).toHaveTextContent(TEST_APP_PEER_ID);
    expect(await screen.findByTestId('blox-peer-id-value')).toHaveTextContent(TEST_BLOX_PEER_ID);
    expect(api.exchangeConfig).toHaveBeenCalledWith({ peer_id: TEST_APP_PEER_ID, seed: SEED });
    expect(screen.getByTestId('disk-card')).toHaveTextContent('Hard Disk');
    const name = screen.getByTestId('blox-name') as HTMLInputElement;
    expect(name.value).toBe('Blox Unit #1');
    await userEvent.clear(name);
    await userEvent.type(name, 'Office');
    await userEvent.click(screen.getByTestId('setup-continue'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/connect-wifi'));
    const bloxs = useBloxsStore.getState();
    expect(bloxs.bloxs[TEST_BLOX_PEER_ID]).toEqual({
      peerId: TEST_BLOX_PEER_ID,
      clusterPeerId: TEST_CLUSTER_PEER_ID,
      name: 'Office',
    });
    expect(bloxs.currentBloxPeerId).toBe(TEST_BLOX_PEER_ID);
    expect(bloxs.bloxsPropertyInfo?.[TEST_BLOX_PEER_ID]?.hardwareID).toBe('hw-1');
    expect(bloxs.bloxsSpaceInfo?.[TEST_BLOX_PEER_ID]?.size).toBe(1_000_000);
    expect(useUserProfileStore.getState().appPeerId).toBe(TEST_APP_PEER_ID);
  });

  it('LAN path (?ip&port): exchange at the address, Next → Setup complete, LAN address cached', async () => {
    m(api.getBloxPropertiesAtIp).mockResolvedValue(goodProps());
    m(api.exchangeConfigAtIp).mockResolvedValue({ data: { peer_id: TEST_BLOX_PEER_ID } });
    const { router } = await renderSetupAt('/setup/set-authorizer?ip=10.0.0.2&port=3500');
    expect(await screen.findByTestId('blox-peer-id-value')).toBeInTheDocument();
    expect(api.getBloxPropertiesAtIp).toHaveBeenCalledWith('10.0.0.2', 3500);
    expect(api.exchangeConfigAtIp).toHaveBeenCalledWith('10.0.0.2', 3500, {
      peer_id: TEST_APP_PEER_ID,
      seed: SEED,
    });
    expect(api.exchangeConfig).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('setup-continue'));
    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe('/setup/complete'),
    );
    expect(lanIpCache.findAuthorizedBlox(TEST_BLOX_PEER_ID, TEST_APP_PEER_ID)?.service.host).toBe(
      '10.0.0.2',
    );
  });

  it('manual path (?manual=1): no calls, typed peer id + name → Setup complete (manual)', async () => {
    const { router } = await renderSetupAt('/setup/set-authorizer?manual=1');
    expect(await screen.findByTestId('manual-blox-peer-id')).toBeInTheDocument();
    expect(api.getBloxProperties).not.toHaveBeenCalled();
    await userEvent.type(screen.getByTestId('manual-blox-peer-id'), TEST_BLOX_PEER_ID);
    await waitFor(() => expect(screen.getByTestId('setup-continue')).toBeEnabled());
    await userEvent.click(screen.getByTestId('setup-continue'));
    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        '/setup/complete?manual=1',
      ),
    );
    expect(api.exchangeConfig).not.toHaveBeenCalled();
    expect(useBloxsStore.getState().bloxs[TEST_BLOX_PEER_ID]?.name).toBe('Blox Unit #1');
  });

  it('an invalid peer id from the exchange toasts and deletes the fula config', async () => {
    m(api.getBloxProperties).mockResolvedValue(goodProps());
    m(api.exchangeConfig).mockResolvedValue({ data: { peer_id: 'short' } });
    await renderSetupAt('/setup/set-authorizer');
    expect(await screen.findByText('Blox peerId is invalid!')).toBeInTheDocument();
    await waitFor(() => expect(api.bloxDeleteFulaConfig).toHaveBeenCalled());
    expect(screen.queryByTestId('blox-peer-id-value')).toBeNull();
  });

  it('a network failure shows the hotspot warning and Set Authorizer stays available to retry', async () => {
    m(api.getBloxProperties).mockResolvedValue(goodProps());
    m(api.exchangeConfig).mockRejectedValue(
      new LanHttpError('unreachable', 'http://10.42.0.1:3500/peer/exchange', 'unreachable'),
    );
    await renderSetupAt('/setup/set-authorizer');
    expect(
      await screen.findByText(/make sure the phone is connected to the Blox's Hotspot/),
    ).toBeInTheDocument();
    await waitFor(() => expect(api.bloxDeleteFulaConfig).toHaveBeenCalled());
    const retry = screen.getByTestId('set-authorizer');
    await waitFor(() => expect(retry).toBeEnabled());
    await userEvent.click(retry);
    await waitFor(() => expect(api.exchangeConfig).toHaveBeenCalledTimes(2));
  });

  it('Skip: the support code 1234 opens Connect to Wi-Fi, a wrong code is rejected', async () => {
    m(api.getBloxProperties).mockResolvedValue(goodProps());
    m(api.exchangeConfig).mockImplementation(() => new Promise(() => undefined)); // never answers
    const { router } = await renderSetupAt('/setup/set-authorizer');
    await userEvent.click(await screen.findByTestId('skip'));
    await userEvent.type(await screen.findByTestId('skip-code'), '0000');
    await userEvent.click(screen.getByTestId('skip-confirm'));
    expect(await screen.findByText('Invalid Code')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    await userEvent.clear(screen.getByTestId('skip-code'));
    await userEvent.type(screen.getByTestId('skip-code'), '1234');
    await userEvent.click(screen.getByTestId('skip-confirm'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/connect-wifi'));
  });

  it('no storage: warning, Set Authorizer disabled, Format Disk sends the partition request', async () => {
    const props = goodProps();
    props.data.bloxFreeSpace.size = 0;
    m(api.getBloxProperties).mockResolvedValue(props);
    const { router } = await renderSetupAt('/setup/set-authorizer');
    expect(
      await screen.findByText(
        'To proceed successfully you need to attach an external storage to the Blox!',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('set-authorizer')).toBeDisabled();
    expect(api.exchangeConfig).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByTestId('format-disk'));
    await waitFor(() => expect(api.bloxFormatDisk).toHaveBeenCalled());
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/connect-blox'));
  });
});

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBleMockState,
  fakeSession,
  mockBluetoothModule,
  resetBleMockState,
} from './bleMocks';

const ble = vi.hoisted(() => ({ state: null as ReturnType<typeof createBleMockState> | null }));

vi.mock('@/api/bloxHardware', () => ({ getBloxPropertiesAtIp: vi.fn() }));
vi.mock('@/services/discoveryClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/discoveryClient')>();
  return { ...actual, findBox: vi.fn(async () => []) };
});
vi.mock('@/utils/helper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/helper')>();
  return { ...actual, initFula: vi.fn() };
});
vi.mock('@/platform/bluetooth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/bluetooth')>();
  ble.state ??= createBleMockState();
  return mockBluetoothModule(actual, ble.state);
});

import { API_URL } from '@/api';
import { getBloxPropertiesAtIp } from '@/api/bloxHardware';
import { peekDeepLinkStash, stashDeepLink } from '@/app/deepLinkStash';
import { BleRegistry } from '@/platform/bluetooth';
import { hostOf } from '@/platform/lanHttp';
import { useBloxsStore, useUserProfileStore } from '@/stores';
import * as Helper from '@/utils/helper';
import * as lanIpCache from '@/utils/lanIpCache';
import {
  renderSetupAt,
  resetStores,
  TEST_APP_PEER_ID,
  TEST_BLOX_PEER_ID,
  TEST_CLUSTER_PEER_ID,
} from './renderSetup';

const propsMock = getBloxPropertiesAtIp as unknown as ReturnType<typeof vi.fn>;
const initFulaMock = Helper.initFula as unknown as ReturnType<typeof vi.fn>;
const AP_HOST = hostOf(API_URL);

function bloxProps(authorizer: string, hardwareID = 'hw-1') {
  return {
    data: {
      hardwareID,
      kubo_peer_id: TEST_BLOX_PEER_ID,
      ipfs_cluster_peer_id: TEST_CLUSTER_PEER_ID,
      authorizer,
      bloxFreeSpace: { size: 1, avail: 1, used: 0, used_percentage: 0, device_count: 1 },
    },
  };
}

describe('ConnectToExistingBlox', () => {
  beforeEach(() => {
    resetStores({ identity: true, appPeerId: TEST_APP_PEER_ID });
    propsMock.mockReset();
    initFulaMock.mockReset();
    lanIpCache.clear();
    resetBleMockState(ble.state!);
    BleRegistry._resetForTests();
  });

  it('scans the hotspot host, lists an authorized Blox and "Add selected" adds it and goes home', async () => {
    propsMock.mockImplementation(async (ip: string) =>
      ip === AP_HOST ? bloxProps(TEST_APP_PEER_ID) : Promise.reject(new Error('unreachable')),
    );
    const { router } = await renderSetupAt('/setup/connect-existing');
    expect(await screen.findByTestId('blox-card-hw-1')).toBeInTheDocument();
    expect(screen.getByText('Authorized')).toBeInTheDocument();
    expect(screen.getByTestId('blox-peer-id-value')).toHaveTextContent(TEST_BLOX_PEER_ID);
    expect(screen.getByTestId('blox-cluster-peer-id-value')).toHaveTextContent(
      TEST_CLUSTER_PEER_ID,
    );
    expect(propsMock).toHaveBeenCalledWith(AP_HOST, 3500);
    // The scan feeds the LAN-IP cache (AI transport selector).
    expect(lanIpCache.findAuthorizedBlox(TEST_BLOX_PEER_ID, TEST_APP_PEER_ID)).not.toBeNull();

    const add = screen.getByTestId('add-selected');
    expect(add).toBeDisabled();
    await userEvent.click(screen.getByTestId('blox-select-hw-1'));
    expect(add).toBeEnabled();
    await userEvent.click(add);
    await waitFor(() => expect(router.state.location.pathname).toBe('/blox'));
    const bloxs = useBloxsStore.getState().bloxs;
    expect(bloxs[TEST_BLOX_PEER_ID]).toEqual({
      peerId: TEST_BLOX_PEER_ID,
      clusterPeerId: TEST_CLUSTER_PEER_ID,
      name: 'Blox unit #1',
    });
    expect(useBloxsStore.getState().currentBloxPeerId).toBe(TEST_BLOX_PEER_ID);
  });

  it('"Add selected" consumes a stashed deep link and re-keys a Blox already known under another peer id', async () => {
    stashDeepLink('/autopin-pair?token=abc');
    useBloxsStore.setState({
      bloxs: { OLD_PEER: { peerId: 'OLD_PEER', clusterPeerId: 'OLD_PEER', name: 'Blox unit #1' } },
      bloxsPropertyInfo: { OLD_PEER: { hardwareID: 'hw-1' } as never },
      currentBloxPeerId: 'OLD_PEER',
    });
    propsMock.mockImplementation(async (ip: string) =>
      ip === AP_HOST ? bloxProps(TEST_APP_PEER_ID) : Promise.reject(new Error('unreachable')),
    );
    const { router } = await renderSetupAt('/setup/connect-existing');
    await userEvent.click(await screen.findByTestId('blox-select-hw-1'));
    await userEvent.click(screen.getByTestId('add-selected'));
    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        '/autopin-pair?token=abc',
      ),
    );
    expect(peekDeepLinkStash()).toBeNull();
    const bloxs = useBloxsStore.getState().bloxs;
    expect(bloxs.OLD_PEER).toBeUndefined();
    expect(bloxs[TEST_BLOX_PEER_ID]?.name).toBe('Blox unit #2');
  });

  it('a Blox authorized by another identity is not selectable and links to Bluetooth commands', async () => {
    propsMock.mockImplementation(async (ip: string) =>
      ip === AP_HOST ? bloxProps('12D3KooWSomeoneElse') : Promise.reject(new Error('x')),
    );
    const { router } = await renderSetupAt('/setup/connect-existing');
    expect(await screen.findByText('Not Authorized')).toBeInTheDocument();
    expect(screen.getByTestId('blox-select-hw-1')).toBeDisabled();
    expect(
      screen.getByText('This Blox is authorized by a different identity.'),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Go to Bluetooth Commands (to Reset)' }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/bluetooth'));
  });

  it('an unpaired Blox shows "New Device" and Setup goes to SetBloxAuthorizer with ip/port/peerId', async () => {
    propsMock.mockImplementation(async (ip: string) =>
      ip === AP_HOST ? bloxProps('') : Promise.reject(new Error('x')),
    );
    const { router } = await renderSetupAt('/setup/connect-existing');
    expect(await screen.findByText('New Device')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('blox-setup-hw-1'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/set-authorizer'));
    const q = new URLSearchParams(router.state.location.search);
    expect(q.get('ip')).toBe(AP_HOST);
    expect(q.get('port')).toBe('3500');
    expect(q.get('peerId')).toBe(TEST_BLOX_PEER_ID);
    expect(q.get('manual')).toBeNull();
  });

  it('nothing found → empty state; the manual IP card validates and opens the LAN setup', async () => {
    propsMock.mockRejectedValue(new Error('unreachable'));
    const { router } = await renderSetupAt('/setup/connect-existing');
    expect(await screen.findByTestId('no-devices')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('add-manually'));
    const ip = screen.getByTestId('manual-ip');
    await userEvent.type(ip, '8.8.8.8');
    expect(screen.getByTestId('manual-connect')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('private network address');
    await userEvent.clear(ip);
    await userEvent.type(ip, '192.168.1.50');
    await userEvent.click(screen.getByTestId('manual-connect'));
    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        '/setup/set-authorizer?ip=192.168.1.50&port=3500',
      ),
    );
  });

  it('manual card: a pasted Blox peer id adds the Blox without trying to claim it', async () => {
    // The route for someone moving over from the phone. Their Blox already has an owner, so it no longer
    // answers on the LAN at all — the peer id is what identifies it, and management runs over the relay.
    propsMock.mockRejectedValue(new Error('unreachable'));
    const { router } = await renderSetupAt('/setup/connect-existing');
    expect(await screen.findByTestId('no-devices')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('add-manually'));

    const field = screen.getByTestId('manual-peer-id');
    await userEvent.type(field, 'not-a-peer-id');
    expect(screen.getByTestId('manual-peer-id-add')).toBeDisabled();
    await userEvent.clear(field);
    // Pasted straight out of a circuit multiaddr — the LAST /p2p/ component is the Blox, not the relay.
    await userEvent.type(
      field,
      `/dns/relay.dev.fx.land/tcp/4001/p2p/${TEST_APP_PEER_ID}/p2p-circuit/p2p/${TEST_BLOX_PEER_ID}`,
    );
    await userEvent.click(screen.getByTestId('manual-peer-id-add'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/set-authorizer'));
    const q = new URLSearchParams(router.state.location.search);
    expect(q.get('manual')).toBe('1');
    expect(q.get('peerId')).toBe(TEST_BLOX_PEER_ID);
    // The claim flow is what `?ip` selects. This path must not go near it.
    expect(q.get('ip')).toBeNull();
  });

  it('generates the app peer id when missing, and "Scan via Bluetooth" lists the device read over BLE', async () => {
    resetStores({ identity: true, appPeerId: null });
    initFulaMock.mockResolvedValue(TEST_APP_PEER_ID);
    propsMock.mockRejectedValue(new Error('unreachable'));
    ble.state!.pick.mockResolvedValue(fakeSession());
    ble.state!.responses.properties = bloxProps(TEST_APP_PEER_ID, 'hw-ble').data;
    await renderSetupAt('/setup/connect-existing');
    await waitFor(() => expect(useUserProfileStore.getState().appPeerId).toBe(TEST_APP_PEER_ID));
    expect(initFulaMock).toHaveBeenCalledWith({
      password: 'test-password',
      signiture: '0xsignature',
    });
    await userEvent.click(screen.getByTestId('scan-ble'));
    expect(await screen.findByTestId('blox-card-hw-ble')).toHaveTextContent('via Bluetooth');
    expect(screen.getByText('Authorized')).toBeInTheDocument();
  });
});

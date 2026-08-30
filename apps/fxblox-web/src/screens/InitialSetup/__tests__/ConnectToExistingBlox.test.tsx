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
vi.mock('@/services/lanDiscovery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/lanDiscovery')>();
  return {
    ...actual,
    discoverBloxesOnLan: vi.fn(async () => ({ found: [], failure: 'not-found', lna: 'granted' })),
  };
});
vi.mock('@/platform/bluetooth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/bluetooth')>();
  ble.state ??= createBleMockState();
  return mockBluetoothModule(actual, ble.state);
});

import { API_URL } from '@/api';
import { getBloxPropertiesAtIp } from '@/api/bloxHardware';
import { discoverBloxesOnLan } from '@/services/lanDiscovery';
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
const discoverMock = discoverBloxesOnLan as unknown as ReturnType<typeof vi.fn>;
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

/**
 * The search now runs on arrival. The explicit click here is redundant for the result but harmless, and it
 * keeps these tests reading the way a user behaves when the first pass found nothing.
 */
async function renderAndScan() {
  const rendered = await renderSetupAt('/setup/connect-existing');
  await userEvent.click(await screen.findByTestId('scan-lan'));
  return rendered;
}

describe('ConnectToExistingBlox', () => {
  beforeEach(() => {
    resetStores({ identity: true, appPeerId: TEST_APP_PEER_ID });
    propsMock.mockReset();
    initFulaMock.mockReset();
    discoverMock.mockReset();
    discoverMock.mockResolvedValue({ found: [], failure: 'not-found', lna: 'granted' });
    lanIpCache.clear();
    resetBleMockState(ble.state!);
    BleRegistry._resetForTests();
  });

  it('searches the network on arrival, without being asked', async () => {
    // It used to wait for a tap, for a reason that no longer holds: the search could not find an owned Blox at
    // all, so running it unbidden only burned ~15 s and then blamed the user's network. It finds one now, in
    // about five seconds, on desktop and on Android — so making people ask for it is pure friction.
    propsMock.mockRejectedValue(new Error('nothing on the hotspot'));
    discoverMock.mockResolvedValue({
      found: [{ host: 'fxblox-rk1.local', peerId: TEST_BLOX_PEER_ID }],
      lna: 'granted',
    });
    await renderSetupAt('/setup/connect-existing'); // note: no click
    expect(await screen.findByTestId(`lan-found-${TEST_BLOX_PEER_ID}`)).toBeInTheDocument();
  });

  it('offers a Blox found by its .local name, routing on the peer id alone', async () => {
    // The candidates the `/properties` scan probes are all derived from Bloxs the app ALREADY knows, so on a
    // fresh install it can only come back empty. The name probe is what finds a device never seen before; all
    // it can learn is the peer id, which is exactly what the manual-entry route takes.
    propsMock.mockRejectedValue(new Error('nothing on the hotspot'));
    discoverMock.mockResolvedValue({ found: [{ host: 'fxblox-rk1.local', peerId: TEST_BLOX_PEER_ID }], lna: 'granted' });
    const { router } = await renderAndScan();

    expect(await screen.findByTestId(`lan-found-${TEST_BLOX_PEER_ID}`)).toHaveTextContent(
      'fxblox-rk1.local',
    );
    expect(screen.queryByTestId('no-devices')).toBeNull();

    await userEvent.click(screen.getByTestId(`lan-found-add-${TEST_BLOX_PEER_ID}`));
    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        `/setup/set-authorizer?manual=1&peerId=${TEST_BLOX_PEER_ID}`,
      ),
    );
  });

  it('says the browser blocked the network rather than blaming the Blox', async () => {
    // A refused Local Network Access permission and an absent Blox are different facts, and the app used to
    // report both as "nothing answered on this network" — sending the user to check hardware for what is a
    // browser setting. This is the likely shape of the Android report: on a device that never granted the
    // permission, every probe fails instantly and silently.
    propsMock.mockRejectedValue(new Error('nothing on the hotspot'));
    discoverMock.mockResolvedValue({ found: [], failure: 'blocked', lna: 'denied' });
    await renderAndScan();

    expect(await screen.findByTestId('lan-blocked')).toHaveTextContent(
      /browser is blocking access to this network/i,
    );
    expect(screen.queryByTestId('no-devices')).toBeNull();
  });

  it('marks a Blox it already has instead of claiming nothing answered', async () => {
    // The bug this pins, caught testing the deployed build against real hardware: results were filtered to
    // Bloxs the app lacked, so finding your only Blox — already added — rendered "Nothing answered on this
    // network". It had answered, in 3 seconds.
    propsMock.mockRejectedValue(new Error('nothing on the hotspot'));
    discoverMock.mockResolvedValue({ found: [{ host: 'fxblox-rk1.local', peerId: TEST_BLOX_PEER_ID }], lna: 'granted' });
    useBloxsStore.setState({
      bloxs: { [TEST_BLOX_PEER_ID]: { peerId: TEST_BLOX_PEER_ID, name: 'Blox Unit #1' } },
    });
    await renderAndScan();

    expect(await screen.findByTestId(`lan-found-known-${TEST_BLOX_PEER_ID}`)).toBeInTheDocument();
    expect(screen.queryByTestId('no-devices')).toBeNull();
    // Nothing to add, so no button that would take them round the setup loop again.
    expect(screen.queryByTestId(`lan-found-add-${TEST_BLOX_PEER_ID}`)).toBeNull();
  });

  it('scans the hotspot host, lists an authorized Blox and "Add selected" adds it and goes home', async () => {
    propsMock.mockImplementation(async (ip: string) =>
      ip === AP_HOST ? bloxProps(TEST_APP_PEER_ID) : Promise.reject(new Error('unreachable')),
    );
    const { router } = await renderAndScan();
    expect(await screen.findByTestId('blox-card-hw-1')).toBeInTheDocument();
    expect(screen.getByText('Authorized')).toBeInTheDocument();
    expect(screen.getByTestId('blox-peer-id-value')).toHaveTextContent(TEST_BLOX_PEER_ID);
    expect(screen.getByTestId('blox-cluster-peer-id-value')).toHaveTextContent(
      TEST_CLUSTER_PEER_ID,
    );
    expect(propsMock).toHaveBeenCalledWith(AP_HOST, 3500, expect.objectContaining({ timeoutMs: expect.any(Number) }));
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
    const { router } = await renderAndScan();
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
    const { router } = await renderAndScan();
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
    const { router } = await renderAndScan();
    expect(await screen.findByText('New Device')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('blox-setup-hw-1'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/set-authorizer'));
    const q = new URLSearchParams(router.state.location.search);
    expect(q.get('ip')).toBe(AP_HOST);
    expect(q.get('port')).toBe('3500');
    expect(q.get('peerId')).toBe(TEST_BLOX_PEER_ID);
    expect(q.get('manual')).toBeNull();
  });

  it('nothing found → empty state, and manual entry asks for a peer id, never an address', async () => {
    propsMock.mockRejectedValue(new Error('unreachable'));
    await renderAndScan();
    expect(await screen.findByTestId('no-devices')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('add-manually'));
    expect(screen.getByTestId('manual-peer-id')).toBeInTheDocument();
    // This screen adds a Blox you already own, and such a Blox serves nothing on the LAN — an address field
    // here could only ever fail. Claiming a not-yet-set-up Blox by address belongs to ConnectToBlox.
    expect(screen.queryByTestId('manual-ip')).toBeNull();
  });

  it('manual card: a pasted Blox peer id adds the Blox without trying to claim it', async () => {
    // The route for someone moving over from the phone. Their Blox already has an owner, so it no longer
    // answers on the LAN at all — the peer id is what identifies it, and management runs over the relay.
    propsMock.mockRejectedValue(new Error('unreachable'));
    const { router } = await renderAndScan();
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
    await renderAndScan();
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

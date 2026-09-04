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

vi.mock('@/platform/lanHttp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/lanHttp')>();
  return { ...actual, lanFetch: vi.fn() };
});
vi.mock('@/platform/bluetooth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/bluetooth')>();
  ble.state ??= createBleMockState();
  return mockBluetoothModule(actual, ble.state);
});
vi.mock('@/services/setupDiscovery', () => ({
  discoverUnownedBloxes: vi.fn(),
}));
// The last test here navigates on to Set authorizer, which calls `initFula` on mount to mint the app peer id.
// Left real, that boots an actual libp2p node inside jsdom, and its `it-queue` timers outlive the test: one of
// them then dispatches an Event from Node's realm into a torn-down jsdom EventTarget, which Vitest reports as
// an unhandled error and fails the run — roughly one full-suite run in three, on CI and on `main`. Every
// sibling setup test already stubs this; this file was the one that did not.
vi.mock('@/utils/helper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/helper')>();
  return { ...actual, initFula: vi.fn(async () => '12D3KooWAppPeer'.padEnd(52, 'A')) };
});

import { API_URL } from '@/api';
import { BleRegistry } from '@/platform/bluetooth';
import { lanFetch, LanHttpError } from '@/platform/lanHttp';
import { discoverUnownedBloxes } from '@/services/setupDiscovery';
import { renderSetupAt, resetStores } from './renderSetup';

const lanFetchMock = lanFetch as unknown as ReturnType<typeof vi.fn>;
const discoverMock = discoverUnownedBloxes as unknown as ReturnType<typeof vi.fn>;
const bleState = () => ble.state!;

/** Nothing on the network — the outcome an old firmware or an unplugged cable produces. */
const nothingFound = { found: [], failure: 'not-found' as const, lna: 'granted' as const };

/**
 * The ladder is LAN → Bluetooth → hotspot, easiest first. A cable needs nothing typed and costs the browser
 * no internet, so it leads; these helpers walk to the later stages the way a real user reaches them.
 */
async function reachBluetoothStage() {
  await userEvent.click(await screen.findByTestId('lan-skip'));
  return screen.findByTestId('connect-ble');
}

async function reachHotspotStage() {
  bleState().supported = false;
  await userEvent.click(await reachBluetoothStage());
  return screen.findByTestId('hotspot-check');
}

/** Run a search that comes up empty, which is what reveals the manual-address field. */
async function revealManualAddress() {
  discoverMock.mockResolvedValue(nothingFound);
  await userEvent.click(await screen.findByTestId('lan-search'));
  return screen.findByTestId('lan-ip-input');
}

describe('ConnectToBlox', () => {
  beforeEach(() => {
    resetStores({ identity: true });
    lanFetchMock.mockReset();
    discoverMock.mockReset();
    discoverMock.mockResolvedValue(nothingFound);
    resetBleMockState(ble.state!);
    BleRegistry._resetForTests();
  });

  it('opens on the cable step, with Bluetooth one tap away rather than in front', async () => {
    await renderSetupAt('/setup/connect-blox');
    expect(await screen.findByRole('heading', { name: 'Connect to Blox' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect(await screen.findByTestId('lan-step')).toBeInTheDocument();
    expect(screen.getByTestId('lan-search')).toBeInTheDocument();
    // Showing both routes at once is the menu-of-choices this ladder exists to avoid.
    expect(screen.queryByTestId('connect-ble')).toBeNull();
    expect(screen.queryByTestId('hotspot-check')).toBeNull();
    // The address field is the second thing to try, so it waits until a search has come up empty.
    expect(screen.queryByTestId('lan-ip-input')).toBeNull();
    // Nothing is probed on arrival: Chrome's local-network prompt needs a gesture, so the scan waits for its
    // own button press.
    expect(discoverMock).not.toHaveBeenCalled();
    expect(lanFetchMock).not.toHaveBeenCalled();
  });

  it('search finds a Blox awaiting setup and carries its address to Set authorizer', async () => {
    discoverMock.mockResolvedValue({ found: [{ host: '192.168.2.159' }], lna: 'granted' });
    const { router } = await renderSetupAt('/setup/connect-blox');
    await userEvent.click(await screen.findByTestId('lan-search'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/set-authorizer'));
    expect(router.state.location.search).toContain('192.168.2.159');
  });

  it('a `.local` name is carried through as-is, which is what desktop Chrome finds', async () => {
    // Desktop resolves the name and hides its own address; Android does the opposite. Both feed `apiUrlFor`.
    discoverMock.mockResolvedValue({ found: [{ host: 'fxblox-rk1.local' }], lna: 'granted' });
    const { router } = await renderSetupAt('/setup/connect-blox');
    await userEvent.click(await screen.findByTestId('lan-search'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/set-authorizer'));
    expect(router.state.location.search).toContain('fxblox-rk1.local');
  });

  it('an empty search offers Bluetooth and reveals the address field, without shouting', async () => {
    await renderSetupAt('/setup/connect-blox');
    await userEvent.click(await screen.findByTestId('lan-search'));
    expect(await screen.findByTestId('lan-search-failed')).toBeInTheDocument();
    // Not an error card: no cable and old firmware both look exactly like this, and neither is a fault.
    expect(screen.queryByTestId('lan-error-unreachable')).toBeNull();
    expect(screen.getByTestId('lan-ip-input')).toBeInTheDocument();
    expect(screen.getByTestId('lan-skip')).toHaveTextContent('Connect via Bluetooth instead');
  });

  it('a browser that refused local-network access is not reported as an absent Blox', async () => {
    discoverMock.mockResolvedValue({ found: [], failure: 'blocked', lna: 'denied' });
    await renderSetupAt('/setup/connect-blox');
    await userEvent.click(await screen.findByTestId('lan-search'));
    // Saying "no Blox found" here sends the user after a cable fault they do not have.
    expect(await screen.findByTestId('lan-error-lna-denied')).toHaveTextContent(
      'Local network access is blocked',
    );
    expect(screen.queryByTestId('lan-search-failed')).toBeNull();
  });

  it('"I don\'t have an adapter" goes to Bluetooth, not to the hotspot', async () => {
    await renderSetupAt('/setup/connect-blox');
    expect(await screen.findByTestId('lan-skip')).toHaveTextContent("I don't have an adapter");
    await userEvent.click(screen.getByTestId('lan-skip'));
    expect(await screen.findByTestId('connect-ble')).toBeInTheDocument();
    expect(screen.queryByTestId('lan-step')).toBeNull();
    // The hotspot costs the user their internet, so it stays last.
    expect(screen.queryByTestId('hotspot-instructions')).toBeNull();
    expect(screen.queryByTestId('hotspot-check')).toBeNull();
  });

  it('Bluetooth: chooser → properties over BLE → Set authorizer, session registered for the next steps', async () => {
    bleState().pick.mockResolvedValue(fakeSession());
    bleState().responses.properties = { hardwareID: 'hw-1' };
    const { router } = await renderSetupAt('/setup/connect-blox');
    await userEvent.click(await reachBluetoothStage());
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/set-authorizer'));
    // `written` is a session-wide log and SetBloxAuthorizer fetches the real properties over the same session
    // as soon as it mounts (api/bloxHardware.ts), so asserting an exact length here races the next screen.
    expect(bleState().written[0]).toBe('properties');
    expect(bleState().written.every((cmd) => cmd === 'properties')).toBe(true);
    expect(BleRegistry.connectedPeripherals().map((p) => p.id)).toEqual(['ble-device-1']);
    expect(lanFetchMock).not.toHaveBeenCalled();
  });

  it('Bluetooth: closing the chooser is not an error', async () => {
    const cancelled = new Error('User cancelled the requestDevice() chooser.');
    cancelled.name = 'NotFoundError';
    bleState().pick.mockRejectedValue(cancelled);
    await renderSetupAt('/setup/connect-blox');
    await userEvent.click(await reachBluetoothStage());
    await waitFor(() =>
      expect(screen.getByTestId('connection-status')).toHaveTextContent('Not Connected'),
    );
    expect(screen.queryByText('Connection failed')).toBeNull();
  });

  it('Bluetooth unavailable → the hotspot, since the cable step already had its turn', async () => {
    bleState().supported = false;
    await renderSetupAt('/setup/connect-blox');
    const connect = await reachBluetoothStage();
    // One hint per stage, about the button in front of the user.
    expect(screen.getByText(/device chooser opens/)).toBeInTheDocument();
    await userEvent.click(connect);
    expect(await screen.findByTestId('hotspot-instructions')).toBeInTheDocument();
    expect(screen.queryByTestId('lan-step')).toBeNull();
    // The status says what happened, not that something is under way.
    expect(screen.getByTestId('connection-status')).toHaveTextContent(
      "Bluetooth didn't work — let's try another way",
    );
    expect(
      await screen.findByText('Web Bluetooth is not available in this browser.'),
    ).toBeInTheDocument();
    // Nothing is probed on entering the step: the Bluetooth chooser may have consumed the user activation
    // Chrome's local-network prompt needs, so the hotspot check must wait for its own button press.
    expect(lanFetchMock).not.toHaveBeenCalled();
  });

  it('LAN step: a typed address that answers goes straight to Set authorizer', async () => {
    lanFetchMock.mockResolvedValue(new Response(''));
    const { router } = await renderSetupAt('/setup/connect-blox');
    await userEvent.type(await revealManualAddress(), '192.168.1.50');
    await userEvent.click(screen.getByTestId('lan-connect'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/set-authorizer'));
    expect(String(lanFetchMock.mock.calls[0]![0])).toBe('http://192.168.1.50:3500/properties');
    expect(router.state.location.search).toContain('192.168.1.50');
  });

  it('LAN step: an address outside the home network is refused without a request', async () => {
    await renderSetupAt('/setup/connect-blox');
    await userEvent.type(await revealManualAddress(), '8.8.8.8');
    await userEvent.click(screen.getByTestId('lan-connect'));

    // The hard backstop: setup traffic — including the call that CLAIMS the box — never leaves the LAN.
    expect(await screen.findByTestId('lan-ip-rejected')).toBeInTheDocument();
    expect(lanFetchMock).not.toHaveBeenCalled();
  });

  it('LAN step: no answer reads as "not found here", not as an error card', async () => {
    lanFetchMock.mockRejectedValue(
      new LanHttpError('unreachable', 'http://192.168.1.50:3500/properties', 'unreachable'),
    );
    await renderSetupAt('/setup/connect-blox');
    await userEvent.type(await revealManualAddress(), '192.168.1.50');
    await userEvent.click(screen.getByTestId('lan-connect'));

    expect(await screen.findByTestId('lan-not-found')).toBeInTheDocument();
    expect(screen.queryByTestId('lan-error-unreachable')).toBeNull();
    expect(screen.getByTestId('connection-status')).toHaveTextContent('No Blox found at that address');

    // Moving on drops the previous step's verdict rather than carrying it into a step the user has not
    // attempted: arriving at Bluetooth already told they failed is how a person gives up.
    await userEvent.click(screen.getByTestId('lan-skip'));
    expect(await screen.findByTestId('connect-ble')).toBeInTheDocument();
    expect(screen.getByTestId('connection-status')).toHaveTextContent('Not Connected');
    expect(screen.queryByTestId('lan-not-found')).toBeNull();
  });

  it('hotspot check: HEAD /properties answers → Set authorizer', async () => {
    lanFetchMock.mockResolvedValue(new Response(''));
    const { router } = await renderSetupAt('/setup/connect-blox');
    expect(await screen.findByRole('heading', { name: 'Connect to Blox' })).toBeInTheDocument();
    expect(screen.getByTestId('led-guide')).toBeInTheDocument();
    await userEvent.click(await reachHotspotStage());
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/set-authorizer'));
    expect(String(lanFetchMock.mock.calls[0]![0])).toBe(`${API_URL}/properties`);
    expect((lanFetchMock.mock.calls[0]![1] as { method: string }).method).toBe('HEAD');
  });

  // What varies by failure kind is which help card it selects; the hotspot instructions are simply the content
  // of the stage, so they are on screen for all of them.
  it.each([
    ['lna-denied', 'Local network access is blocked'],
    ['cors', 'Blox firmware needs an update for browser access'],
    ['unreachable', 'The hotspot did not answer'],
    ['timeout', 'The Blox did not answer in time'],
  ] as const)('hotspot check failure %s shows its help card', async (kind, title) => {
    lanFetchMock.mockRejectedValue(new LanHttpError(kind, `${API_URL}/properties`, kind));
    const { router } = await renderSetupAt('/setup/connect-blox');
    await userEvent.click(await reachHotspotStage());
    expect(await screen.findByTestId(`lan-error-${kind}`)).toHaveTextContent(title);
    expect(screen.getByTestId('connection-status')).toHaveTextContent(
      'Unable to connect to Hotspot',
    );
    expect(await screen.findByText('Connection error')).toBeInTheDocument();
    expect(screen.getByTestId('hotspot-instructions')).toHaveTextContent(/FxBlox/);
    if (kind === 'lna-denied') {
      expect(screen.getByText('chrome://settings/content/localNetworkAccess')).toBeInTheDocument();
    }
    expect(router.state.location.pathname).toBe('/setup/connect-blox');
  });

  it('after a failed check the background poll succeeding offers Continue instead of navigating', async () => {
    // Route by URL and by an explicit gate rather than by call order. The explicit check (HEAD /properties)
    // and the background poll (GET /readiness) share this mock, and the screen CLEARS the error card the
    // moment the poll reports reachable — so a poll that wins the race would delete the very card this test
    // asserts. Keep readiness failing until the card has been observed, then let it succeed.
    let readinessOk = false;
    let propertiesCalls = 0;
    lanFetchMock.mockImplementation(async (url: unknown) => {
      const target = String(url);
      if (target.endsWith('/properties')) {
        propertiesCalls += 1;
        if (propertiesCalls === 1) {
          throw new LanHttpError('unreachable', `${API_URL}/properties`, 'unreachable');
        }
        return new Response('');
      }
      if (!readinessOk) throw new LanHttpError('unreachable', target, 'unreachable');
      return new Response('{"status":"ready"}');
    });
    const { router } = await renderSetupAt('/setup/connect-blox');
    await userEvent.click(await reachHotspotStage());
    expect(await screen.findByTestId('lan-error-unreachable')).toBeInTheDocument();
    // Now the Blox comes up: useHotspotReachable polls GET /readiness every 3 s and the next tick succeeds.
    readinessOk = true;
    const cont = await screen.findByTestId('setup-continue', undefined, { timeout: 8000 });
    expect(router.state.location.pathname).toBe('/setup/connect-blox');
    expect(screen.getByText('Now you are connected to Blox. Please wait...')).toBeInTheDocument();
    await userEvent.click(cont);
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/set-authorizer'));
  });
});

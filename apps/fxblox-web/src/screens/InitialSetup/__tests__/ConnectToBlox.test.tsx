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

import { API_URL } from '@/api';
import { BleRegistry } from '@/platform/bluetooth';
import { lanFetch, LanHttpError } from '@/platform/lanHttp';
import { renderSetupAt, resetStores } from './renderSetup';

const lanFetchMock = lanFetch as unknown as ReturnType<typeof vi.fn>;
const bleState = () => ble.state!;

/**
 * The hotspot is now the LAST resort, not a peer option: Bluetooth is tried first, and the LAN step is offered
 * before it. These tests are about the hotspot check, so they walk the user to that stage the way a real user
 * reaches it — Bluetooth fails, then "I don't know the address".
 */
async function reachHotspotStage() {
  bleState().supported = false;
  await userEvent.click(await screen.findByTestId('connect-ble'));
  await userEvent.click(await screen.findByTestId('lan-skip'));
  return screen.findByTestId('hotspot-check');
}
describe('ConnectToBlox', () => {
  beforeEach(() => {
    resetStores({ identity: true });
    lanFetchMock.mockReset();
    resetBleMockState(ble.state!);
    BleRegistry._resetForTests();
  });

  it('hotspot check: HEAD /properties answers → Set authorizer', async () => {
    lanFetchMock.mockResolvedValue(new Response(''));
    const { router } = await renderSetupAt('/setup/connect-blox');
    expect(await screen.findByRole('heading', { name: 'Connect to Blox' })).toBeInTheDocument();
    expect(screen.getByTestId('led-guide')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    await userEvent.click(await reachHotspotStage());
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/set-authorizer'));
    expect(String(lanFetchMock.mock.calls[0]![0])).toBe(`${API_URL}/properties`);
    expect((lanFetchMock.mock.calls[0]![1] as { method: string }).method).toBe('HEAD');
  });

  // The `instructions` column is gone: the hotspot instructions are now simply the content of the hotspot
  // stage, so they are on screen for every failure kind once the user has got that far. What still varies —
  // and what this table is actually about — is which help card the failure selects.
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
    // The user is on the hotspot stage, so the join instructions stay on screen behind the help card.
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

  it('Bluetooth: chooser → properties over BLE → Set authorizer, session registered for the next steps', async () => {
    bleState().pick.mockResolvedValue(fakeSession());
    bleState().responses.properties = { hardwareID: 'hw-1' };
    const { router } = await renderSetupAt('/setup/connect-blox');
    await userEvent.click(await screen.findByTestId('connect-ble'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/set-authorizer'));
    // `written` is a session-wide log and SetBloxAuthorizer fetches the real properties over the same session
    // as soon as it mounts (api/bloxHardware.ts), so asserting an exact length here races the next screen.
    // What this test owns is that the connect step probed over BLE and sent nothing else.
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
    await userEvent.click(await screen.findByTestId('connect-ble'));
    await waitFor(() =>
      expect(screen.getByTestId('connection-status')).toHaveTextContent('Not Connected'),
    );
    expect(screen.queryByText('Connection failed')).toBeNull();
  });

  it('Bluetooth unavailable → offers the LAN step, NOT the hotspot, and fires no HTTP check', async () => {
    bleState().supported = false;
    await renderSetupAt('/setup/connect-blox');
    // One hint per stage, about the button in front of the user. On arrival that is the device chooser; the
    // local-network explainer would describe a permission nothing is about to ask for.
    expect(screen.getByText(/device chooser opens/)).toBeInTheDocument();
    expect(screen.queryByText(/access devices on your local network/)).toBeNull();
    await userEvent.click(await screen.findByTestId('connect-ble'));
    expect(await screen.findByText(/access devices on your local network/)).toBeInTheDocument();
    expect(screen.queryByText(/device chooser opens/)).toBeNull();
    // The order is Bluetooth → LAN → hotspot. The hotspot costs the user their internet, so it stays last.
    expect(await screen.findByTestId('lan-step')).toBeInTheDocument();
    expect(screen.queryByTestId('hotspot-instructions')).toBeNull();
    expect(screen.queryByTestId('hotspot-check')).toBeNull();
    expect(screen.getByTestId('connection-status')).toHaveTextContent(
      'Unable to connect via Bluetooth, trying WiFi...',
    );
    expect(
      await screen.findByText('Web Bluetooth is not available in this browser.'),
    ).toBeInTheDocument();
    // Nothing is probed on entering the step: the Bluetooth chooser may have consumed the user activation
    // Chrome's local-network prompt needs, so the LAN probe must wait for its own button press.
    expect(lanFetchMock).not.toHaveBeenCalled();
  });

  it('LAN step: a typed address that answers goes straight to Set authorizer', async () => {
    bleState().supported = false;
    lanFetchMock.mockResolvedValue(new Response(''));
    const { router } = await renderSetupAt('/setup/connect-blox');
    await userEvent.click(await screen.findByTestId('connect-ble'));
    await userEvent.type(await screen.findByTestId('lan-ip-input'), '192.168.1.50');
    await userEvent.click(screen.getByTestId('lan-connect'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/set-authorizer'));
    // Probed the typed Blox, not the hotspot address, and carried the ip to the next step.
    expect(String(lanFetchMock.mock.calls[0]![0])).toBe('http://192.168.1.50:3500/properties');
    expect(router.state.location.search).toContain('192.168.1.50');
  });

  it('LAN step: an address outside the home network is refused without a request', async () => {
    bleState().supported = false;
    await renderSetupAt('/setup/connect-blox');
    await userEvent.click(await screen.findByTestId('connect-ble'));
    await userEvent.type(await screen.findByTestId('lan-ip-input'), '8.8.8.8');
    await userEvent.click(screen.getByTestId('lan-connect'));

    // The hard backstop: setup traffic — including the call that CLAIMS the box — never leaves the LAN.
    expect(await screen.findByTestId('lan-ip-rejected')).toBeInTheDocument();
    expect(lanFetchMock).not.toHaveBeenCalled();
  });

  it('LAN step: no answer reads as "not found here", not as an error card', async () => {
    bleState().supported = false;
    lanFetchMock.mockRejectedValue(
      new LanHttpError('unreachable', 'http://192.168.1.50:3500/properties', 'unreachable'),
    );
    await renderSetupAt('/setup/connect-blox');
    await userEvent.click(await screen.findByTestId('connect-ble'));
    await userEvent.type(await screen.findByTestId('lan-ip-input'), '192.168.1.50');
    await userEvent.click(screen.getByTestId('lan-connect'));

    // Silence is the expected outcome on firmware without the LAN setup listener, and on a Blox that simply
    // is not on this network — so it must not shout. The user can still fall through to the hotspot.
    expect(await screen.findByTestId('lan-not-found')).toBeInTheDocument();
    expect(screen.queryByTestId('lan-error-unreachable')).toBeNull();
    expect(screen.getByTestId('lan-skip')).toBeInTheDocument();
  });

  it('LAN step: "I don\'t know the address" advances to the hotspot instructions', async () => {
    bleState().supported = false;
    await renderSetupAt('/setup/connect-blox');
    await userEvent.click(await screen.findByTestId('connect-ble'));
    await userEvent.click(await screen.findByTestId('lan-skip'));

    expect(await screen.findByTestId('hotspot-instructions')).toBeInTheDocument();
    expect(screen.getByTestId('hotspot-check')).toBeInTheDocument();
    expect(screen.queryByTestId('lan-step')).toBeNull();
  });
});

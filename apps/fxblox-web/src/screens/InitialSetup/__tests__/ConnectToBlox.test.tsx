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
    await userEvent.click(screen.getByTestId('hotspot-check'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/set-authorizer'));
    expect(String(lanFetchMock.mock.calls[0]![0])).toBe(`${API_URL}/properties`);
    expect((lanFetchMock.mock.calls[0]![1] as { method: string }).method).toBe('HEAD');
  });

  it.each([
    ['lna-denied', 'Local network access is blocked', false],
    ['cors', 'Blox firmware needs an update for browser access', false],
    ['unreachable', 'The hotspot did not answer', true],
    ['timeout', 'The Blox did not answer in time', true],
  ] as const)('hotspot check failure %s shows its help card', async (kind, title, instructions) => {
    lanFetchMock.mockRejectedValue(new LanHttpError(kind, `${API_URL}/properties`, kind));
    const { router } = await renderSetupAt('/setup/connect-blox');
    await userEvent.click(await screen.findByTestId('hotspot-check'));
    expect(await screen.findByTestId(`lan-error-${kind}`)).toHaveTextContent(title);
    expect(screen.getByTestId('connection-status')).toHaveTextContent(
      'Unable to connect to Hotspot',
    );
    expect(await screen.findByText('Connection error')).toBeInTheDocument();
    if (instructions) {
      expect(screen.getByTestId('hotspot-instructions')).toHaveTextContent(/FxBlox/);
    } else {
      expect(screen.queryByTestId('hotspot-instructions')).toBeNull();
    }
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
    await userEvent.click(await screen.findByTestId('hotspot-check'));
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

  it('Bluetooth unavailable → BLE failed status, hotspot instructions and no auto HTTP check', async () => {
    bleState().supported = false;
    await renderSetupAt('/setup/connect-blox');
    await userEvent.click(await screen.findByTestId('connect-ble'));
    expect(await screen.findByTestId('hotspot-instructions')).toBeInTheDocument();
    expect(screen.getByTestId('connection-status')).toHaveTextContent(
      'Unable to connect via Bluetooth, trying WiFi...',
    );
    expect(
      await screen.findByText('Web Bluetooth is not available in this browser.'),
    ).toBeInTheDocument();
    expect(lanFetchMock).not.toHaveBeenCalled();
  });
});

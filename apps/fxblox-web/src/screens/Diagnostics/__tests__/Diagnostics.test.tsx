import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/fula', () => import('@/components/main/__tests__/fulaMock'));
vi.mock('@/components/main/useEnsureFulaClient', () => ({ useEnsureFulaClient: () => undefined }));
const probeInternetMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock('@/platform/network', async (orig) => ({
  ...(await orig<typeof import('@/platform/network')>()),
  probeInternet: probeInternetMock,
}));
type Listing = {
  relays: Array<{ dnsName: string; peerId: string; addr: string; multiaddr: string }>;
  source: 'live' | 'cache' | 'none';
  fetchedAt?: number;
};
const listRelaysMock = vi.hoisted(() =>
  vi.fn<() => Promise<Listing>>(async () => ({
    relays: [{ dnsName: 'relay.test.fx.land', peerId: 'p', addr: '', multiaddr: '' }],
    source: 'live',
    fetchedAt: Date.now(),
  })),
);
vi.mock('@/services/discoveryClient', async (orig) => ({
  ...(await orig<typeof import('@/services/discoveryClient')>()),
  listRelays: listRelaysMock,
}));
vi.mock('@/utils/ble', async (orig) => ({
  ...(await orig<typeof import('@/utils/ble')>()),
  safeGetConnectedPeripherals: async () => [],
}));
vi.mock('@/platform/bluetooth', async (orig) => ({
  ...(await orig<typeof import('@/platform/bluetooth')>()),
  isWebBluetoothSupported: () => false,
}));

import Diagnostics from '@/screens/Diagnostics/Diagnostics';
import { usePluginsStore } from '@/stores';
import { renderRoute, resetStores, setPairedStores, TEST_BLOX_PEER_ID } from '@/components/main/__tests__/testUtils';

function renderDiagnostics(entry = '/blox-ai') {
  return renderRoute(<Diagnostics />, { path: '/blox-ai', initialEntry: entry });
}

describe('Diagnostics (Blox AI)', () => {
  beforeEach(() => {
    resetStores();
    setPairedStores({ status: 'DISCONNECTED' });
    probeInternetMock.mockResolvedValue(true);
  });

  it('consumes ?scenario once (URL stripped) and keeps the prefilled scenario for the session', async () => {
    usePluginsStore.setState({
      activePluginsByBlox: { [TEST_BLOX_PEER_ID]: ['blox-ai'] },
      activePluginsStatusByBlox: { [TEST_BLOX_PEER_ID]: 'loaded' },
    });
    const { router } = renderDiagnostics('/blox-ai?scenario=disconnected');
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(router.state.location.pathname).toBe('/blox-ai');
    expect(screen.getByTestId('diagnostics-prefill').querySelector('[data-param="prefillScenario"]')).toHaveTextContent('disconnected');
    expect(await screen.findByTestId('blox-ai-session')).toBeInTheDocument();
    expect(screen.getByTestId('quickstart-disconnected')).toHaveAttribute('data-prefilled', 'true');
    expect(screen.getByTestId('quickstart-not-earning')).toHaveAttribute('data-prefilled', 'false');
  });

  it('plugin presence: checking while the per-blox fetch is idle/loading (no raw card yet)', () => {
    usePluginsStore.setState({ activePluginsStatusByBlox: { [TEST_BLOX_PEER_ID]: 'loading' } });
    renderDiagnostics();
    expect(screen.getByTestId('diag-plugin-card')).toHaveAttribute('data-presence', 'checking');
    expect(screen.getByText('Checking plugin status…')).toBeInTheDocument();
    expect(screen.queryByTestId('raw-diagnostics-card')).toBeNull();
    expect(screen.queryByTestId('blox-ai-session')).toBeNull();
  });

  it('plugin presence: installed → session block + raw diagnostics enabled', async () => {
    usePluginsStore.setState({
      activePluginsByBlox: { [TEST_BLOX_PEER_ID]: ['streamr-node', 'blox-ai'] },
      activePluginsStatusByBlox: { [TEST_BLOX_PEER_ID]: 'loaded' },
    });
    renderDiagnostics();
    expect(screen.getByTestId('diag-plugin-card')).toHaveAttribute('data-presence', 'installed');
    expect(screen.getByText('Blox AI is installed on your Blox')).toBeInTheDocument();
    expect(await screen.findByTestId('blox-ai-session')).toBeInTheDocument();
    expect(screen.getByTestId('raw-diag-fetch')).toBeEnabled();
    expect(screen.getByTestId('manual-ip-card')).toBeInTheDocument();
  });

  it('plugin presence: loaded without blox-ai (or an error) → not installed / unavailable, raw diagnostics disabled', async () => {
    usePluginsStore.setState({
      activePluginsByBlox: { [TEST_BLOX_PEER_ID]: ['streamr-node'] },
      activePluginsStatusByBlox: { [TEST_BLOX_PEER_ID]: 'loaded' },
    });
    renderDiagnostics();
    expect(screen.getByTestId('diag-plugin-card')).toHaveAttribute('data-presence', 'notInstalledOrUnavailable');
    expect(screen.getByText('Blox AI not detected')).toBeInTheDocument();
    expect(screen.getByTestId('raw-diag-unavailable')).toBeDisabled();
    expect(screen.queryByTestId('blox-ai-session')).toBeNull();

    usePluginsStore.setState({ activePluginsStatusByBlox: { [TEST_BLOX_PEER_ID]: 'error' } });
    await waitFor(() => expect(screen.getByTestId('diag-plugin-card')).toHaveAttribute('data-presence', 'notInstalledOrUnavailable'));
  });

  it('probes: internet ok, discovery live, relays listed as "can\'t be tested from a browser", Bluetooth unsupported', async () => {
    usePluginsStore.setState({ activePluginsStatusByBlox: { [TEST_BLOX_PEER_ID]: 'loaded' } });
    renderDiagnostics();
    await waitFor(() => expect(screen.getByTestId('diag-internet')).toHaveAttribute('data-status', 'ok'));
    await waitFor(() => expect(screen.getByTestId('diag-discovery')).toHaveAttribute('data-status', 'ok'));
    const relays = await screen.findByTestId('diag-relays');
    expect(relays).toHaveTextContent('relay.test.fx.land');
    expect(relays).toHaveTextContent("Can't be tested from a browser");
    expect(relays.querySelector('[data-relay-status]')).toHaveAttribute('data-relay-status', 'unsupported');
    expect(screen.getByTestId('diag-relays-source')).toHaveAttribute('data-source', 'live');
    expect(screen.getByTestId('diag-bluetooth-card')).toHaveAttribute('data-ble-status', 'unsupported');
    expect(screen.queryByTestId('diag-connect-bluetooth')).toBeNull();
    expect(screen.getByTestId('diag-lan-notice')).toHaveTextContent(/local network/);
  });

  it('probes: an unreachable discovery service falls back to the hardcoded relay and reports the failure', async () => {
    listRelaysMock.mockResolvedValueOnce({ relays: [], source: 'none' });
    probeInternetMock.mockResolvedValueOnce(false);
    usePluginsStore.setState({ activePluginsStatusByBlox: { [TEST_BLOX_PEER_ID]: 'loaded' } });
    renderDiagnostics();
    await waitFor(() => expect(screen.getByTestId('diag-internet')).toHaveAttribute('data-status', 'failed'));
    await waitFor(() => expect(screen.getByTestId('diag-discovery')).toHaveAttribute('data-status', 'failed'));
    expect(await screen.findByTestId('diag-relays')).toHaveTextContent('relay.dev.fx.land');
    expect(screen.getByTestId('diag-relays-source')).toHaveAttribute('data-source', 'hardcoded');
  });
});

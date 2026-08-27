import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/fula', () => import('@/components/main/__tests__/fulaMock'));
vi.mock('@/components/main/useEnsureFulaClient', () => ({ useEnsureFulaClient: () => undefined }));

import PluginCatalogue from '@/screens/Plugins/PluginCatalogue';
import { usePluginsStore } from '@/stores';
import { jsonFetch, renderRoute, resetStores, setPairedStores, TEST_BLOX_PEER_ID } from '@/components/main/__tests__/testUtils';

const CATALOGUE = [
  { name: 'blox-ai', 'icon-path': 'M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z' },
  { name: 'streamr-node', 'icon-file': 'https://raw.githubusercontent.com/functionland/fula-ota/main/x/icon.svg' },
  { name: 'loyal-agent' },
];

const originalFetch = globalThis.fetch;

describe('PluginCatalogue', () => {
  beforeEach(() => {
    resetStores();
    // DISCONNECTED so useRefetchActivePluginsOnConnect does not overwrite the seeded list.
    setPairedStores({ status: 'DISCONNECTED' });
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('renders the catalogue grid with the "Installed" tag from the blox-keyed store and opens a plugin', async () => {
    globalThis.fetch = jsonFetch({ 'plugins/info.json': CATALOGUE }) as typeof fetch;
    usePluginsStore.setState({
      activePluginsByBlox: { [TEST_BLOX_PEER_ID]: ['blox-ai'] },
      activePluginsStatusByBlox: { [TEST_BLOX_PEER_ID]: 'loaded' },
    });
    const { router } = renderRoute(<PluginCatalogue />, {
      path: '/plugins',
      extraRoutes: [{ path: '/plugins/:name', element: <div data-testid="plugin-page" /> }],
    });

    expect(screen.getByTestId('plugins-loading')).toBeInTheDocument();
    const grid = await screen.findByTestId('plugins-grid');
    expect(grid.querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByTestId('plugin-blox-ai-installed')).toHaveTextContent('Installed');
    expect(screen.queryByTestId('plugin-streamr-node-installed')).toBeNull();
    expect(screen.getByTestId('plugin-streamr-node').querySelector('img')).toHaveAttribute('src', CATALOGUE[1]!['icon-file']);
    expect(screen.queryByTestId('plugins-installed-checking')).toBeNull();

    fireEvent.click(screen.getByTestId('plugin-blox-ai'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/plugins/blox-ai'));
  });

  it('shows the three installed-state notices (checking / unreachable) and recovers from a catalogue failure', async () => {
    let fail = true;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (fail) throw new TypeError('Failed to fetch');
      return jsonFetch({ 'plugins/info.json': CATALOGUE })(input, init);
    }) as typeof fetch;
    usePluginsStore.setState({ activePluginsStatusByBlox: { [TEST_BLOX_PEER_ID]: 'idle' } });
    renderRoute(<PluginCatalogue />, { path: '/plugins' });

    expect(screen.getByTestId('plugins-installed-checking')).toHaveTextContent('Checking installed plugins');
    expect(await screen.findByTestId('plugins-error')).toHaveTextContent("Couldn't load the plugin catalogue.");

    usePluginsStore.setState({ activePluginsStatusByBlox: { [TEST_BLOX_PEER_ID]: 'error' } });
    expect(await screen.findByTestId('plugins-installed-error')).toHaveTextContent("Couldn't reach this blox");

    fail = false;
    fireEvent.click(screen.getByTestId('plugins-retry'));
    expect(await screen.findByTestId('plugins-grid')).toBeInTheDocument();
  });
});

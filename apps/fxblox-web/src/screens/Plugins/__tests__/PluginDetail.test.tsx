import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/fula', () => import('@/components/main/__tests__/fulaMock'));
vi.mock('@/components/main/useEnsureFulaClient', () => ({ useEnsureFulaClient: () => undefined }));

import PluginDetail from '@/screens/Plugins/PluginDetail';
import { usePluginsStore } from '@/stores';
import { fxblox, resetFulaMock } from '@/components/main/__tests__/fulaMock';
import { jsonFetch, renderRoute, resetStores, setPairedStores, TEST_BLOX_PEER_ID } from '@/components/main/__tests__/testUtils';

const INFO = {
  name: 'Blox AI',
  description: 'On-device troubleshooting.',
  version: '1.2.3',
  usage: { storage: '1 GB', compute: 'low', bandwidth: 'low', ram: '512 MB', gpu: 'none' },
  rewards: [{ type: 'Mining', currency: 'FULA', link: '' }],
  socials: [{ telegram: 'https://t.me/fula', twitter: '' }],
  instructions: [
    { order: 2, description: 'Second step', paramId: 1 },
    { order: 1, description: 'First step', url: 'https://fx.land' },
  ],
  requiredInputs: [{ name: 'token', instructions: 'Paste your token', type: 'text', default: '' }],
  outputs: [{ name: 'API_KEY', id: 1 }],
  approved: true,
};

const originalFetch = globalThis.fetch;

function renderDetail() {
  return renderRoute(<PluginDetail />, {
    path: '/plugins/:name',
    initialEntry: '/plugins/blox-ai',
    extraRoutes: [{ path: '/plugins', element: <div data-testid="plugins-page" /> }],
  });
}

describe('PluginDetail', () => {
  beforeEach(() => {
    resetStores();
    resetFulaMock();
    setPairedStores({ status: 'DISCONNECTED' });
    usePluginsStore.setState({
      activePluginsByBlox: { [TEST_BLOX_PEER_ID]: [] },
      activePluginsStatusByBlox: { [TEST_BLOX_PEER_ID]: 'loaded' },
    });
    globalThis.fetch = jsonFetch({ 'plugins/blox-ai/info.json': INFO }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('loads info.json, validates the required inputs and starts the install', async () => {
    renderDetail();
    expect(screen.getByTestId('plugin-loading')).toBeInTheDocument();
    expect(await screen.findByText('Version: 1.2.3')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('On-device troubleshooting.')).toBeInTheDocument();
    // Instructions are sorted by order.
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('1. First step');
    expect(items[1]).toHaveTextContent('2. Second step');
    expect(screen.getByText('telegram')).toBeInTheDocument();

    // Missing required input → error toast, no install call.
    fireEvent.click(screen.getByTestId('plugin-install-toggle'));
    expect(await screen.findByText('Installation Error')).toBeInTheDocument();
    expect(fxblox.installPlugin).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('plugin-input-token'), { target: { value: 'abc' } });
    // The Blox reports the install in progress on the next status poll (otherwise "No Status" resets it).
    fxblox.getInstallStatus.mockResolvedValue({ status: true, msg: 'Installing' });
    fireEvent.click(screen.getByTestId('plugin-install-toggle'));
    await waitFor(() => expect(fxblox.installPlugin).toHaveBeenCalledWith('blox-ai', 'token====abc'));
    // (the success toast is queued behind the error toast still on screen — the status line is the observable)
    await waitFor(() => expect(screen.getByTestId('plugin-install-status')).toHaveTextContent('Status: Installing'));
    expect(screen.getByTestId('plugin-install-toggle')).toBeDisabled();
  });

  it('an installed plugin offers Update (confirm) and Uninstall; a failed uninstall toasts the Blox message', async () => {
    usePluginsStore.setState({ activePluginsByBlox: { [TEST_BLOX_PEER_ID]: ['blox-ai'] } });
    // The status refetch after an (un)install re-lists the active plugins — keep blox-ai installed.
    fxblox.listActivePlugins.mockResolvedValue({ status: true, msg: ['blox-ai'] });
    fxblox.getInstallOutput.mockResolvedValue({ status: true, msg: { API_KEY: 'secret-value' } });
    fxblox.uninstallPlugin.mockResolvedValueOnce({ status: false, msg: 'plugin busy' });
    renderDetail();
    expect(await screen.findByText('Version: 1.2.3')).toBeInTheDocument();
    // Required inputs are hidden once installed; the masked output row shows up after the output fetch.
    expect(screen.queryByTestId('plugin-input-token')).toBeNull();
    const output = await screen.findByTestId('plugin-output-API_KEY');
    expect(output).toHaveTextContent('API_KEY: ••••••••••••');
    expect(output).not.toHaveTextContent('secret-value');

    fireEvent.click(screen.getByTestId('plugin-install-toggle'));
    await waitFor(() => expect(fxblox.uninstallPlugin).toHaveBeenCalledWith('blox-ai'));
    expect(await screen.findByText('plugin busy')).toBeInTheDocument();

    // The Blox reports the update on the next status poll (otherwise "No Status" clears the status line).
    fxblox.getInstallStatus.mockResolvedValue({ status: true, msg: 'Updating' });
    fireEvent.click(screen.getByTestId('plugin-update'));
    const confirm = await screen.findByTestId('fx-confirm');
    expect(confirm).toHaveTextContent('update the blox-ai plugin');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(fxblox.updatePlugin).toHaveBeenCalledWith('blox-ai'));
    await waitFor(() => expect(screen.getByTestId('plugin-install-status')).toHaveTextContent('Status: Updating'));
  });

  it('a failed info.json fetch shows the error toast and stays on the loading state', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    renderDetail();
    expect(await screen.findByText('Failed to fetch plugin information')).toBeInTheDocument();
    expect(screen.getByTestId('plugin-loading')).toBeInTheDocument();
  });
});

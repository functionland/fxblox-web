import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const wallet = vi.hoisted(() => ({
  connected: false,
  account: undefined as string | undefined,
  connecting: false,
  provider: undefined as unknown,
  connectWallet: vi.fn(async () => undefined),
  disconnectWallet: vi.fn(async () => undefined),
  ensureCorrectNetworkConnection: vi.fn(async () => ({ success: true })),
  isOnCorrectNetwork: true,
}));

vi.mock('@/hooks/useWalletConnection', () => ({
  useWalletConnection: () => ({
    connected: wallet.connected,
    account: wallet.account,
    connecting: wallet.connecting,
    error: null,
    connectWallet: wallet.connectWallet,
    disconnectWallet: wallet.disconnectWallet,
  }),
}));
vi.mock('@/hooks/useContractIntegration', () => ({
  useContractIntegration: () => ({ isInitializing: false, switchChain: vi.fn() }),
}));
vi.mock('@/hooks/useWalletNetwork', () => ({
  useWalletNetwork: () => ({
    isOnCorrectNetwork: wallet.isOnCorrectNetwork,
    isSwitchingNetwork: false,
    ensureCorrectNetworkConnection: wallet.ensureCorrectNetworkConnection,
    targetNetworkName: 'SKALE Europa Hub',
    selectedChain: 'skale',
    withCorrectNetwork: async <T,>(op: () => Promise<T>) => op(),
  }),
}));
vi.mock('@/wallet/useWallet', () => ({
  useWallet: () => ({
    account: wallet.account,
    connected: wallet.connected,
    connecting: wallet.connecting,
    provider: wallet.provider,
  }),
}));

const guard = vi.hoisted(() => ({
  check: vi.fn(async (): Promise<ChainSwitchCheck> => ({ ok: true })),
}));
vi.mock('@/services/chainSwitchGuard', () => ({ checkChainSwitchAllowed: guard.check }));

import type { ChainSwitchCheck } from '@/services/chainSwitchGuard';
import ChainSelection from '@/screens/Settings/ChainSelection';
import { useSettingsStore, useUserProfileStore } from '@/stores';
import { confirmDialog, renderRoute, resetSettingsStores } from './testUtils';

const routes = [{ path: '/settings/chain', element: <ChainSelection /> }];

describe('ChainSelection', () => {
  beforeEach(() => {
    resetSettingsStores();
    wallet.connected = false;
    wallet.account = undefined;
    wallet.provider = undefined;
    vi.clearAllMocks();
    guard.check.mockResolvedValue({ ok: true });
  });

  it('Base is selectable without any code once the pool check passes', async () => {
    useUserProfileStore.setState({ manualSignatureWalletAddress: '0x1234567890abcdef1234567890abcdef12345678' });
    renderRoute(routes, '/settings/chain');
    expect(screen.getByRole('radio', { name: 'SKALE Europa Hub' })).toBeChecked();
    expect(screen.getByTestId('chain-current')).toHaveTextContent('SKALE Europa Hub');
    expect(screen.queryByText(/authorization/i)).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Base Network' }));
    await waitFor(() => expect(useSettingsStore.getState().selectedChain).toBe('base'));
    expect(guard.check).toHaveBeenCalledWith(
      'skale',
      'base',
      expect.objectContaining({ account: '0x1234567890abcdef1234567890abcdef12345678' }),
    );
    expect(await screen.findByText('Chain Updated')).toBeInTheDocument();
    expect(screen.getByText(/Switched to Base Network\. Connect your wallet/)).toBeInTheDocument();
    expect(screen.getByTestId('chain-current')).toHaveTextContent('Base Network');
  });

  it('a Blox in a pool on the current chain blocks the switch (Base → SKALE is checked too)', async () => {
    useSettingsStore.setState({ selectedChain: 'base' });
    guard.check.mockResolvedValueOnce({
      ok: false,
      reason: 'member',
      poolId: '1',
      poolName: 'Global-B1',
      bloxName: 'My Blox',
    });
    renderRoute(routes, '/settings/chain');
    fireEvent.click(screen.getByRole('radio', { name: 'SKALE Europa Hub' }));
    expect(await screen.findByText("Can't Switch Network")).toBeInTheDocument();
    expect(
      screen.getByText('My Blox is in pool Global-B1 on Base Network. Leave the pool before switching networks.'),
    ).toBeInTheDocument();
    expect(guard.check).toHaveBeenCalledWith('base', 'skale', expect.anything());
    expect(useSettingsStore.getState().selectedChain).toBe('base');
    expect(screen.getByRole('radio', { name: 'Base Network' })).toBeChecked();
  });

  it('a pending join request blocks the switch', async () => {
    guard.check.mockResolvedValueOnce({
      ok: false,
      reason: 'pending',
      poolId: '1',
      poolName: 'Global-S1',
      bloxName: 'My Blox',
    });
    renderRoute(routes, '/settings/chain');
    fireEvent.click(screen.getByRole('radio', { name: 'Base Network' }));
    expect(
      await screen.findByText(
        'My Blox has a pending request to join pool Global-S1 on SKALE Europa Hub. Cancel the request before switching networks.',
      ),
    ).toBeInTheDocument();
    expect(useSettingsStore.getState().selectedChain).toBe('skale');
  });

  it('an unverifiable check asks first: Cancel keeps the chain, Switch Anyway switches', async () => {
    guard.check.mockResolvedValue({ ok: false, reason: 'unverified', bloxName: 'My Blox', detail: 'timed out' });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderRoute(routes, '/settings/chain');

    fireEvent.click(screen.getByRole('radio', { name: 'Base Network' }));
    let dialog = await screen.findByTestId('fx-confirm');
    expect(dialog).toHaveTextContent("Couldn't verify the pool status of My Blox on SKALE Europa Hub");
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(confirmDialog()).toBeNull());
    expect(useSettingsStore.getState().selectedChain).toBe('skale');

    fireEvent.click(screen.getByRole('radio', { name: 'Base Network' }));
    dialog = await screen.findByTestId('fx-confirm');
    fireEvent.click(screen.getByRole('button', { name: 'Switch Anyway' }));
    await waitFor(() => expect(useSettingsStore.getState().selectedChain).toBe('base'));
    expect(await screen.findByText('Chain Updated')).toBeInTheDocument();
  });

  it('while checking, the radios are disabled and a second tap does not start another check', async () => {
    let release: (value: ChainSwitchCheck) => void = () => undefined;
    guard.check.mockImplementationOnce(() => new Promise<ChainSwitchCheck>((resolve) => (release = resolve)));
    renderRoute(routes, '/settings/chain');
    fireEvent.click(screen.getByRole('radio', { name: 'Base Network' }));
    expect(await screen.findByTestId('chain-checking')).toHaveTextContent('Checking pool status…');
    expect(screen.getByRole('radio', { name: 'Base Network' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Base Network' }));
    expect(guard.check).toHaveBeenCalledTimes(1);

    await act(async () => release({ ok: true }));
    await waitFor(() => expect(useSettingsStore.getState().selectedChain).toBe('base'));
    expect(screen.queryByTestId('chain-checking')).toBeNull();
  });

  it('manual wallet address: invalid input keeps Save disabled, a 0x address is stored (middle-truncated)', async () => {
    renderRoute(routes, '/settings/chain');
    expect(screen.getByTestId('chain-connect-wallet')).toBeInTheDocument();
    expect(screen.getByText(/No wallet connected/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('chain-edit-address'));
    const input = screen.getByTestId('chain-address-input');
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(screen.getByTestId('chain-save-address')).toBeDisabled();

    const address = '0x1234567890abcdef1234567890abcdef12345678';
    fireEvent.change(input, { target: { value: address } });
    fireEvent.click(screen.getByTestId('chain-save-address'));
    expect(useUserProfileStore.getState().manualSignatureWalletAddress).toBe(address);
    expect(await screen.findByText('Wallet Address Saved')).toBeInTheDocument();
    expect(screen.getByTestId('chain-manual-address')).toHaveTextContent('0x12345678…12345678');
    expect(screen.getByTestId('chain-manual-address')).toHaveAttribute('title', address);
    expect(screen.getByText('Manual wallet stored')).toBeInTheDocument();
  });

  it('connected wallet: shows Disconnect + the account, and the network notice offers a switch', async () => {
    wallet.connected = true;
    wallet.account = '0xABCDEF0123456789ABCDEF0123456789ABCDEF01';
    wallet.provider = {};
    wallet.isOnCorrectNetwork = false;
    renderRoute(routes, '/settings/chain');
    expect(screen.getByTestId('chain-disconnect-wallet')).toBeInTheDocument();
    expect(screen.getByTestId('chain-connected-address')).toHaveTextContent('0xABCDEF01…ABCDEF01');
    expect(screen.queryByTestId('chain-edit-address')).toBeNull();

    // The compact WalletNotification waits 1.5 s after loading states settle (mobile anti-flicker).
    const notice = await screen.findByTestId('wallet-notification-network', undefined, {
      timeout: 4000,
    });
    expect(notice).toHaveTextContent('Switch to SKALE Europa Hub');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to SKALE Europa Hub' }));
    await waitFor(() => expect(wallet.ensureCorrectNetworkConnection).toHaveBeenCalledTimes(1));

    await act(async () => {
      fireEvent.click(screen.getByTestId('chain-disconnect-wallet'));
    });
    expect(wallet.disconnectWallet).toHaveBeenCalledTimes(1);
    wallet.isOnCorrectNetwork = true;
  });
});

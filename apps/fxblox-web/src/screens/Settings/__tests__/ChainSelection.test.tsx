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
  });

  it('Base is gated by the authorization code: wrong code → error toast, 9870 → authorized + selected', async () => {
    renderRoute(routes, '/settings/chain');
    expect(screen.getByRole('radio', { name: 'SKALE Europa Hub' })).toBeChecked();
    expect(screen.getByTestId('chain-current')).toHaveTextContent('SKALE Europa Hub');

    fireEvent.click(screen.getByRole('radio', { name: 'Base Network' }));
    // Not authorized → the code box appears and the selection is unchanged.
    expect(await screen.findByTestId('chain-auth-box')).toBeInTheDocument();
    expect(useSettingsStore.getState().selectedChain).toBe('skale');

    fireEvent.change(screen.getByTestId('chain-auth-input'), { target: { value: '0000' } });
    fireEvent.click(screen.getByTestId('chain-authorize'));
    expect(await screen.findByText('Invalid Authorization Code')).toBeInTheDocument();
    expect(useSettingsStore.getState().baseAuthorized).toBe(false);
    expect(useSettingsStore.getState().selectedChain).toBe('skale');
  });

  it('the right code (9870) authorizes and selects Base; Reset Base Authorization reverts to SKALE', async () => {
    renderRoute(routes, '/settings/chain');
    fireEvent.click(screen.getByRole('radio', { name: 'Base Network' }));
    fireEvent.change(await screen.findByTestId('chain-auth-input'), { target: { value: '9870' } });
    fireEvent.click(screen.getByTestId('chain-authorize'));
    await waitFor(() => expect(useSettingsStore.getState().baseAuthorized).toBe(true));
    expect(useSettingsStore.getState().selectedChain).toBe('base');
    expect(await screen.findByText('Chain Updated')).toBeInTheDocument();
    expect(screen.getByText(/Switched to Base Network\. Connect your wallet/)).toBeInTheDocument();
    expect(screen.queryByTestId('chain-auth-box')).toBeNull();
    expect(screen.getByTestId('chain-current')).toHaveTextContent('Base Network');
    expect(screen.getByTestId('chain-option-base')).toHaveTextContent('Authorized ✓');
  });

  it('Reset Base Authorization → destructive confirm → back to SKALE', async () => {
    useSettingsStore.setState({ baseAuthorized: true, selectedChain: 'base' });
    renderRoute(routes, '/settings/chain');
    expect(screen.getByRole('radio', { name: 'Base Network' })).toBeChecked();
    fireEvent.click(screen.getByTestId('chain-reset-base'));
    const dialog = await screen.findByTestId('fx-confirm');
    expect(dialog).toHaveTextContent('Reset Base Authorization');
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(useSettingsStore.getState().baseAuthorized).toBe(false));
    expect(useSettingsStore.getState().selectedChain).toBe('skale');
    expect(await screen.findByText('Authorization Reset')).toBeInTheDocument();
    await waitFor(() => expect(confirmDialog()).toBeNull());
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

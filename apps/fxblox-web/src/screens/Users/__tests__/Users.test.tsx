import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@reown/appkit/react', () => import('@/components/main/__tests__/appkitReactMock'));
vi.mock('@/lib/fula', () => import('@/components/main/__tests__/fulaMock'));
vi.mock('@/utils/helper', () => ({ getMyDID: () => 'did:key:zTestDid' }));
vi.mock('@/hooks/useContractIntegration', () => ({
  useContractIntegration: () => ({ isInitialized: false, isInitializing: false, error: null, contractService: null, connectedAccount: null, isReady: false }),
}));
const loadWalletMock = vi.hoisted(() => vi.fn());
vi.mock('@/app/bootstrap', () => ({
  bootstrapDataLayer: vi.fn(async () => ({})),
  loadWallet: loadWalletMock,
  loadContracts: vi.fn(),
  loadFulaClient: vi.fn(),
  loadDiagnostics: vi.fn(),
}));

import Users from '@/screens/Users/Users';
import { useUserProfileStore } from '@/stores';
import { resetAppkitMock } from '@/components/main/__tests__/appkitReactMock';
import { _resetWalletGateForTests } from '@/components/main/WalletGate';
import { renderRoute, resetStores, setPairedStores, TEST_APP_PEER_ID, TEST_BLOX_PEER_ID } from '@/components/main/__tests__/testUtils';

describe('Users', () => {
  beforeEach(() => {
    resetStores();
    resetAppkitMock();
    _resetWalletGateForTests();
    setPairedStores({ name: 'Office Blox' });
    useUserProfileStore.setState({ checkFulaReadiness: vi.fn(async () => undefined) });
  });

  it('shows the mock user, the DID / App PeerId copy rows and the Bloxs\' peer ids', async () => {
    loadWalletMock.mockResolvedValue({ initAppKit: () => ({}), setAppKitTheme: () => undefined });
    renderRoute(<Users />, { path: '/users' });

    expect(screen.getByTestId('users-screen')).toHaveAttribute('data-screen', 'users');
    expect(screen.getByTestId('users-condensed-header')).toHaveAttribute('data-condensed', 'false');
    expect(screen.getByText('@testUser')).toBeInTheDocument();

    const appPeer = await screen.findByTestId('wallet-details-app-peer-id');
    expect(appPeer.querySelector('[data-value]')).toHaveAttribute('data-value', TEST_APP_PEER_ID);
    const did = await screen.findByTestId('wallet-details-did');
    expect(did.querySelector('[data-value]')).toHaveAttribute('data-value', 'did:key:zTestDid');
    const bloxIds = screen.getByTestId('wallet-details-blox-peer-ids');
    expect(bloxIds).toHaveTextContent('Office Blox');
    expect(bloxIds.querySelector('[data-value]')).toHaveAttribute('data-value', TEST_BLOX_PEER_ID);
    // The Users screen hides the network block (mobile `showNetwork={false}`).
    expect(screen.queryByTestId('wallet-details-network')).toBeNull();
  });

  it('when the wallet chunk fails to load the gate shows an error with a retry', async () => {
    loadWalletMock.mockRejectedValueOnce(new Error('chunk failed'));
    renderRoute(<Users />, { path: '/users' });
    const error = await screen.findByTestId('wallet-gate-error');
    expect(error).toHaveTextContent('Wallet features could not be loaded.');

    loadWalletMock.mockResolvedValueOnce({ initAppKit: () => ({}), setAppKitTheme: () => undefined });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByTestId('wallet-details')).toBeInTheDocument());
  });
});

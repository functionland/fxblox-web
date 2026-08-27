import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@reown/appkit/react', () => import('@/components/main/__tests__/appkitReactMock'));
vi.mock('@/hooks/useFulaBalance', () => ({
  useFulaBalance: () => ({ refreshBalance: vi.fn() }),
  useFormattedFulaBalance: () => ({ formattedBalance: '12.50', loading: false, tokenSymbol: 'FULA', error: null }),
}));
const claimable = vi.hoisted(() => ({
  totalUnclaimed: '3',
  timeSinceLastClaim: 0,
  loading: false,
  error: null as string | null,
  formattedTotalUnclaimed: '3.00',
  formattedUnclaimedMining: '2.00',
  formattedUnclaimedStorage: '1.00',
  formattedTimeSinceLastClaim: '2 days ago',
  fetchClaimableTokens: vi.fn(),
}));
vi.mock('@/hooks/useClaimableTokens', () => ({ useClaimableTokens: () => claimable }));

import { TestProviders } from '@/test/helpers/renderWithProviders';
import { EarningCard, buildClaimUrl, buildWalletDappLink, STALE_THRESHOLD_SECS } from '@/components/Cards/EarningCard';
import { appkitState, resetAppkitMock } from '@/components/main/__tests__/appkitReactMock';
import { resetStores, setPairedStores, TEST_CLUSTER_PEER_ID } from '@/components/main/__tests__/testUtils';
import { useUserProfileStore } from '@/stores';

describe('EarningCard', () => {
  const originalOpen = window.open;
  beforeEach(() => {
    resetStores();
    resetAppkitMock();
    setPairedStores();
    claimable.totalUnclaimed = '3';
    claimable.timeSinceLastClaim = 0;
    window.open = vi.fn(() => ({}) as Window);
  });
  afterEach(() => {
    window.open = originalOpen;
  });

  it('shows the balances and, on a non-mobile UA, "Open claim portal" opens claim-web in a new tab', () => {
    useUserProfileStore.setState({ manualSignatureWalletAddress: '0x1234567890abcdef1234567890abcdef12345678' });
    render(
      <TestProviders>
        <EarningCard data={{ totalFula: '0' }} />
      </TestProviders>,
    );
    expect(screen.getByTestId('earning-card-balance')).toHaveTextContent('12.50');
    expect(screen.getByTestId('earning-card-claimable')).toHaveTextContent('3.00 FULA');
    expect(screen.getByTestId('earning-card-wallet')).toHaveTextContent('0x1234...5678');
    expect(screen.queryByTestId('earning-card-claim')).toBeNull();

    fireEvent.click(screen.getByTestId('earning-card-open-portal'));
    expect(window.open).toHaveBeenCalledWith(
      `https://claim-web.fula.network?network=skale&peerId=${TEST_CLUSTER_PEER_ID}&wallet=0x1234567890abcdef1234567890abcdef12345678`,
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('"Copy Claim Link" copies the URL and explains the wallet-browser flow in an alert', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(
      <TestProviders>
        <EarningCard data={{ totalFula: '0' }} />
      </TestProviders>,
    );
    fireEvent.click(screen.getByTestId('earning-card-copy-link'));
    const alert = await screen.findByTestId('fx-confirm');
    expect(alert).toHaveTextContent('Link Copied');
    expect(writeText).toHaveBeenCalledWith(buildClaimUrl({ chain: 'skale', clusterPeerId: TEST_CLUSTER_PEER_ID, walletAddress: '' }));
    fireEvent.click(within(alert).getByRole('button', { name: 'Got It' }));
  });

  it('flags a stale claim window and wallet deep links only exist for known wallets', () => {
    claimable.totalUnclaimed = '0';
    claimable.timeSinceLastClaim = STALE_THRESHOLD_SECS + 1;
    appkitState.isConnected = true;
    appkitState.address = '0xabc';
    appkitState.walletInfo = { name: 'MetaMask' };
    render(
      <TestProviders>
        <EarningCard data={{ totalFula: '0' }} />
      </TestProviders>,
    );
    expect(screen.getByTestId('earning-card-stale')).toBeInTheDocument();
    // Not an Android UA → no in-wallet button even with MetaMask connected.
    expect(screen.queryByTestId('earning-card-claim')).toBeNull();
    expect(buildWalletDappLink('MetaMask', 'https://claim-web.fula.network?x=1')).toBe('https://metamask.app.link/dapp/claim-web.fula.network?x=1');
    expect(buildWalletDappLink('Trust Wallet', 'https://a')).toContain('link.trustwallet.com');
    expect(buildWalletDappLink('Rainbow', 'https://a')).toBeNull();
  });
});

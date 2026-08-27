import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@reown/appkit/react', () => import('@/components/main/__tests__/appkitReactMock'));
vi.mock('@/hooks/useContractIntegration', () => ({
  useContractIntegration: () => ({ isInitialized: false, isInitializing: false, error: null, contractService: null, connectedAccount: null, isReady: false }),
}));

import { TestProviders } from '@/test/helpers/renderWithProviders';
import { WalletNotification, WALLET_NOTIFICATION_DELAY_MS } from '@/components/WalletNotification';
import { appkitState, open, resetAppkitMock } from '@/components/main/__tests__/appkitReactMock';
import { useSettingsStore, useUserProfileStore } from '@/stores';

describe('WalletNotification', () => {
  beforeEach(() => {
    resetAppkitMock();
    useUserProfileStore.setState({ manualSignatureWalletAddress: undefined });
    useSettingsStore.setState({ selectedChain: 'skale' });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits 1.5 s before showing "Connect Your Wallet" (anti-flicker) and connects on tap', () => {
    render(
      <TestProviders>
        <WalletNotification compact />
      </TestProviders>,
    );
    expect(screen.queryByTestId('wallet-notification')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(WALLET_NOTIFICATION_DELAY_MS - 1);
    });
    expect(screen.queryByTestId('wallet-notification')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    const banner = screen.getByTestId('wallet-notification');
    expect(banner).toHaveAttribute('data-notification', 'connect');
    expect(banner).toHaveTextContent('Connect Your Wallet');
    act(() => {
      screen.getByTestId('wallet-notification-action').click();
    });
    expect(open).toHaveBeenCalledWith({ view: 'Connect' });
  });

  it('a wallet on the wrong network shows the switch notification immediately; the right one hides it', () => {
    appkitState.isConnected = true;
    appkitState.address = '0xabc';
    appkitState.chainId = 1;
    const { rerender } = render(
      <TestProviders>
        <WalletNotification />
      </TestProviders>,
    );
    const banner = screen.getByTestId('wallet-notification');
    expect(banner).toHaveAttribute('data-notification', 'network');
    expect(banner).toHaveTextContent('Switch to SKALE Europa Hub');

    appkitState.chainId = 2046399126;
    rerender(
      <TestProviders>
        <WalletNotification />
      </TestProviders>,
    );
    expect(screen.queryByTestId('wallet-notification')).toBeNull();
  });

  it('a manual-signature address suppresses the connect notification', () => {
    useUserProfileStore.setState({ manualSignatureWalletAddress: '0xmanual' });
    render(
      <TestProviders>
        <WalletNotification compact />
      </TestProviders>,
    );
    act(() => {
      vi.advanceTimersByTime(WALLET_NOTIFICATION_DELAY_MS * 2);
    });
    expect(screen.queryByTestId('wallet-notification')).toBeNull();
  });
});

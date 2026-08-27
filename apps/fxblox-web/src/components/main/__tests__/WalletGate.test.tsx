import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadWalletMock = vi.hoisted(() => vi.fn());
vi.mock('@/app/bootstrap', () => ({
  bootstrapDataLayer: vi.fn(async () => ({})),
  loadWallet: loadWalletMock,
  loadContracts: vi.fn(),
  loadFulaClient: vi.fn(),
  loadDiagnostics: vi.fn(),
}));

import { TestProviders } from '@/test/helpers/renderWithProviders';
import { WalletGate, _resetWalletGateForTests, ensureWalletReady, walletReadyState } from '@/components/main/WalletGate';
import { useSettingsStore } from '@/stores';

describe('WalletGate', () => {
  beforeEach(() => {
    _resetWalletGateForTests();
    loadWalletMock.mockReset();
    useSettingsStore.setState({ isAuto: false, colorScheme: 'dark' });
  });

  it('initialises AppKit once (idempotent) and then renders its children', async () => {
    const initAppKit = vi.fn(() => ({}));
    const setAppKitTheme = vi.fn();
    loadWalletMock.mockResolvedValue({ initAppKit, setAppKitTheme });
    render(
      <TestProviders>
        <WalletGate>
          <div data-testid="child" />
        </WalletGate>
        <WalletGate>
          <div data-testid="child-2" />
        </WalletGate>
      </TestProviders>,
    );
    expect(screen.getAllByTestId('wallet-gate-loading')).toHaveLength(2);
    expect(await screen.findByTestId('child')).toBeInTheDocument();
    expect(screen.getByTestId('child-2')).toBeInTheDocument();
    expect(initAppKit).toHaveBeenCalledTimes(1);
    expect(initAppKit).toHaveBeenCalledWith({ themeMode: 'dark' });
    await waitFor(() => expect(setAppKitTheme).toHaveBeenCalledWith('dark'));
    await ensureWalletReady('light');
    expect(initAppKit).toHaveBeenCalledTimes(1);
    expect(walletReadyState()).toBe('ready');
  });

  it('a failed chunk shows the error (or nothing when silent) and retry recovers', async () => {
    loadWalletMock.mockRejectedValueOnce(new Error('offline'));
    render(
      <TestProviders>
        <WalletGate>
          <div data-testid="child" />
        </WalletGate>
        <WalletGate silent>
          <div data-testid="silent-child" />
        </WalletGate>
      </TestProviders>,
    );
    expect(await screen.findByTestId('wallet-gate-error')).toBeInTheDocument();
    expect(screen.queryByTestId('silent-child')).toBeNull();
    expect(walletReadyState()).toBe('error');

    loadWalletMock.mockResolvedValue({ initAppKit: () => ({}), setAppKitTheme: () => undefined });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('child')).toBeInTheDocument();
    expect(screen.getByTestId('silent-child')).toBeInTheDocument();
  });
});

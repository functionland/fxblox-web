import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@reown/appkit/react', () => import('@/components/main/__tests__/appkitReactMock'));
vi.mock('@/lib/fula', () => import('@/components/main/__tests__/fulaMock'));
vi.mock('@/app/shells/AppShell', () => import('@/components/main/__tests__/appShellMock'));
vi.mock('@/components/main/useEnsureFulaClient', () => ({ useEnsureFulaClient: () => undefined }));
vi.mock('@/hooks/useTasksLogic', () => ({
  useTasksLogic: () => ({
    tasks: [{ id: 'connect-wallet', title: 'Connect Wallet', isCompleted: false }],
    completedTasks: [],
    loading: false,
    refreshing: false,
    handleTaskPress: () => undefined,
    refreshTasks: () => undefined,
  }),
}));
vi.mock('@/hooks/useFulaBalance', () => ({
  useFulaBalance: () => ({ refreshBalance: () => undefined }),
  useFormattedFulaBalance: () => ({ formattedBalance: '0.00', loading: false, tokenSymbol: 'FULA', error: null }),
}));
vi.mock('@/hooks/useClaimableTokens', () => ({
  useClaimableTokens: () => ({
    totalUnclaimed: '0',
    timeSinceLastClaim: 0,
    loading: false,
    error: null,
    formattedTotalUnclaimed: '0',
    formattedUnclaimedMining: '0',
    formattedUnclaimedStorage: '0',
    formattedTimeSinceLastClaim: 'Never',
    fetchClaimableTokens: () => undefined,
  }),
}));
vi.mock('@/hooks/useContractIntegration', () => ({
  useContractIntegration: () => ({
    isInitialized: false,
    isInitializing: false,
    error: null,
    contractService: null,
    connectedAccount: null,
    retryCount: 0,
    canRetry: true,
    isReady: false,
    initializeContracts: async () => undefined,
  }),
}));
const loadWalletMock = vi.hoisted(() => vi.fn());
vi.mock('@/app/bootstrap', () => ({
  bootstrapDataLayer: vi.fn(async () => ({})),
  loadWallet: loadWalletMock,
  loadContracts: vi.fn(),
  loadFulaClient: vi.fn(),
  loadDiagnostics: vi.fn(),
}));
const lanFetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/platform/lanHttp', async (orig) => ({
  ...(await orig<typeof import('@/platform/lanHttp')>()),
  lanFetch: lanFetchMock,
}));

import Blox from '@/screens/Blox/Blox';
import { LanHttpError } from '@/platform/lanHttp';
import { useBloxsStore } from '@/stores';
import { fxblox } from '@/components/main/__tests__/fulaMock';
import { resetAppkitMock } from '@/components/main/__tests__/appkitReactMock';
import { _resetWalletGateForTests } from '@/components/main/WalletGate';
import { renderRoute, resetStores, setPairedStores, TEST_BLOX_PEER_ID } from '@/components/main/__tests__/testUtils';

const originalMatchMedia = window.matchMedia;
function setViewport(desktop: boolean) {
  window.matchMedia = ((query: string) =>
    ({
      matches: desktop && query.includes('900'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

function renderBlox() {
  return renderRoute(<Blox />, {
    path: '/blox',
    extraRoutes: [
      { path: '/blox-ai', element: <div data-testid="blox-ai-page" /> },
      { path: '/setup/connect-blox', element: <div data-testid="connect-blox-page" /> },
      { path: '/blox/manage', element: <div data-testid="manage-page" /> },
    ],
  });
}

describe('Blox dashboard', () => {
  beforeEach(() => {
    resetStores();
    resetAppkitMock();
    _resetWalletGateForTests();
    loadWalletMock.mockResolvedValue({ initAppKit: () => ({}), setAppKitTheme: () => undefined });
    lanFetchMock.mockReset();
    setViewport(false);
  });
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('renders the hero, runs the sequential load once the client is ready for the selected Blox, and the CTA opens Blox AI', async () => {
    setPairedStores({ name: 'Office Blox', status: 'CONNECTED', fulaIsReady: true });
    const checkBloxConnection = vi.fn(async () => true);
    const getBloxSpace = vi.fn(async () => ({ size: 1000, avail: 700, used: 300, used_percentage: 30, device_count: 1 }));
    const getFolderSize = vi.fn(async () => ({ fula: '10', chain: '20', fulaCount: '3', userOwnData: '30' }));
    useBloxsStore.setState({
      checkBloxConnection,
      getBloxSpace,
      getFolderSize,
      bloxsSpaceInfo: { [TEST_BLOX_PEER_ID]: { size: 1000, avail: 700, used: 300, used_percentage: 30, device_count: 1 } },
    });

    const { router } = renderBlox();

    expect(screen.getByTestId('blox-hero-name')).toHaveTextContent('Office Blox');
    expect(screen.getByTestId('blox-hero-status-label')).toHaveTextContent('CONNECTED');
    expect(screen.getByTestId('blox-screen')).toHaveAttribute('data-screen', 'blox');
    await waitFor(() => expect(checkBloxConnection).toHaveBeenCalled());
    await waitFor(() => expect(getBloxSpace).toHaveBeenCalled());
    expect(screen.getByTestId('usage-bar')).toHaveAttribute('data-percent', '30');
    // Phone layout: no desktop grid, the wallet section renders after the gate resolves.
    expect(screen.queryByTestId('blox-desktop-grid')).toBeNull();
    expect(await screen.findByTestId('earning-card')).toBeInTheDocument();
    expect(screen.getByTestId('tasks-card')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('blox-screen-diagnose-cta'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/blox-ai'));
    expect(router.state.location.search).toBe('?scenario=disconnected');
  });

  it('desktop (≥ 900px) uses the banner + hero card + two-column grid', async () => {
    setViewport(true);
    setPairedStores({ name: 'Office Blox', status: 'CONNECTED' });
    renderBlox();
    expect(screen.getByTestId('blox-desktop-grid')).toBeInTheDocument();
    expect(screen.getByTestId('blox-hero-card')).toBeInTheDocument();
    expect(await screen.findByTestId('earning-card')).toBeInTheDocument();
  });

  it('reboot: confirm → fxblox.reboot() failure surfaces the Blox error in a toast', async () => {
    setPairedStores({ name: 'Office Blox', status: 'CONNECTED' });
    fxblox.reboot.mockResolvedValueOnce({ status: false, msg: 'firmware too old' });
    renderBlox();

    fireEvent.click(screen.getByTestId('blox-hero-tower'));
    fireEvent.click(await screen.findByTestId('blox-info-reboot'));
    const dialog = await screen.findByTestId('fx-confirm');
    expect(dialog).toHaveTextContent('Reboot blox!');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes' }));

    await waitFor(() => expect(fxblox.reboot).toHaveBeenCalled());
    expect(await screen.findByText('firmware too old')).toBeInTheDocument();
  });

  it('remove: the last Blox cannot be removed (alert), a second one can after confirming', async () => {
    setPairedStores({ name: 'Office Blox', status: 'CONNECTED' });
    const removeBlox = vi.fn();
    useBloxsStore.setState({ removeBlox });
    renderBlox();

    fireEvent.click(screen.getByTestId('blox-hero-tower'));
    fireEvent.click(await screen.findByTestId('blox-info-remove'));
    const alert = await screen.findByTestId('fx-confirm');
    expect(alert).toHaveTextContent('You cannot remove the last Blox!');
    fireEvent.click(within(alert).getByRole('button', { name: 'OK' }));
    expect(removeBlox).not.toHaveBeenCalled();

    await act(async () => {
      useBloxsStore.setState((s) => ({ bloxs: { ...s.bloxs, p2: { peerId: 'p2', name: 'Second' } } }));
    });
    fireEvent.click(screen.getByTestId('blox-info-remove'));
    const confirm = await screen.findByTestId('fx-confirm');
    expect(confirm).toHaveTextContent("remove 'Office Blox'");
    fireEvent.click(within(confirm).getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(removeBlox).toHaveBeenCalledWith(TEST_BLOX_PEER_ID));
  });

  it('connect-to-wifi: an LNA-denied hotspot probe explains the Chrome setting and still opens the setup step', async () => {
    setPairedStores({ name: 'Office Blox', status: 'DISCONNECTED' });
    lanFetchMock.mockRejectedValueOnce(new LanHttpError('lna-denied', 'http://10.42.0.1:3500/properties', 'blocked'));
    const { router } = renderBlox();

    fireEvent.click(screen.getByTestId('blox-hero-status'));
    fireEvent.click(await screen.findByTestId('connection-option-wifi'));

    await waitFor(() => expect(lanFetchMock).toHaveBeenCalled());
    expect(await screen.findByText(/blocking local network access/)).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/connect-blox'));
  });
});

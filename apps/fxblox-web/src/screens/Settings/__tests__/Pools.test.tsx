import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface TestPool {
  poolId: string;
  poolID: string;
  name: string;
  region: string;
  parent: string;
  participants: string[];
  replicationFactor: number;
  requested: boolean;
  joined: boolean;
  numVotes: number;
  numVoters: number;
}

const hook = vi.hoisted(() => ({
  state: {
    pools: [] as TestPool[],
    loading: false,
    error: null as string | null,
    enableInteraction: true,
    leavePool: vi.fn(async (): Promise<void | null> => undefined),
    cancelJoinRequest: vi.fn(async (): Promise<void | null> => undefined),
    loadPools: vi.fn(async () => undefined),
    isReady: true,
    connectedAccount: '0xACC0000000000000000000000000000000000001' as string | undefined,
    currentClusterPeerId: 'cluster1' as string | undefined,
    userMemberPools: [] as string[],
    userActiveRequests: [] as string[],
  },
}));
vi.mock('@/hooks/usePoolsWithFallback', () => ({ usePoolsWithFallback: () => hook.state }));
vi.mock('@/hooks/useWalletNetwork', () => ({
  useWalletNetwork: () => ({ withCorrectNetwork: async <T,>(op: () => Promise<T>) => op() }),
}));
vi.mock('@/hooks/useAccountWithFallback', () => ({
  useAccountWithFallback: () => hook.state.connectedAccount ?? null,
}));
vi.mock('@/wallet/useWallet', () => ({
  useWallet: () => ({
    account: hook.state.connectedAccount,
    connected: !!hook.state.connectedAccount,
    connecting: false,
    provider: {},
  }),
}));

const fulaMock = vi.hoisted(() => ({
  isReady: vi.fn(async () => true),
  joinPoolWithChain: vi.fn(async () => ({ account: 'a', poolID: 1 })),
  leavePoolWithChain: vi.fn(async () => ({ account: '', poolID: 1 })),
}));
vi.mock('@/lib/fula', () => ({
  fula: { isReady: fulaMock.isReady },
  blockchain: {
    joinPoolWithChain: fulaMock.joinPoolWithChain,
    leavePoolWithChain: fulaMock.leavePoolWithChain,
  },
  fxblox: {},
}));

interface JoinResponse {
  status: string;
  msg: string;
  transactionHash?: string;
}
const api = vi.hoisted(() => ({
  joinPool: vi.fn(async (): Promise<{ status: string; msg: string; transactionHash?: string }> => ({
    status: 'ok',
    msg: 'ok',
    transactionHash: '0x1234567890abcdef',
  })),
}));
vi.mock('@/services/poolApiService', () => ({ PoolApiService: { joinPool: api.joinPool } }));

const linking = vi.hoisted(() => ({ openUrl: vi.fn(), assign: vi.fn() }));
vi.mock('@/platform/linking', () => ({
  openUrl: linking.openUrl,
  assign: linking.assign,
  canOpenUrl: (u: string) => {
    try {
      new URL(u);
      return true;
    } catch {
      return false;
    }
  },
}));

import Pools from '@/screens/Settings/Pools/Pools';
import { kvStore } from '@/platform/kvStore';
import { useSettingsStore } from '@/stores';
import { confirmDialog, renderRoute, resetSettingsStores, seedBlox } from './testUtils';

const pool = (id: string, name: string, extra: Partial<TestPool> = {}): TestPool => ({
  poolId: id,
  poolID: id,
  name,
  region: 'EU',
  parent: '',
  participants: [],
  replicationFactor: 1,
  requested: false,
  joined: false,
  numVotes: 0,
  numVoters: 0,
  ...extra,
});

const routes = [
  { path: '/settings/pools', element: <Pools /> },
  { path: '/settings/pools/:poolId', element: <p>pool detail page</p> },
  { path: '/users', element: <p>users page</p> },
];

describe('Pools', () => {
  beforeEach(async () => {
    resetSettingsStores();
    seedBlox();
    await kvStore.clear();
    hook.state.pools = [pool('1', 'Alpha'), pool('2', 'Beta')];
    hook.state.error = null;
    hook.state.userMemberPools = [];
    hook.state.userActiveRequests = [];
    hook.state.currentClusterPeerId = 'cluster1';
    vi.clearAllMocks();
    const ok: JoinResponse = { status: 'ok', msg: 'ok', transactionHash: '0x1234567890abcdef' };
    api.joinPool.mockResolvedValue(ok);
    fulaMock.joinPoolWithChain.mockResolvedValue({ account: 'a', poolID: 1 });
    fulaMock.leavePoolWithChain.mockResolvedValue({ account: '', poolID: 1 });
    hook.state.leavePool.mockResolvedValue(undefined);
    hook.state.cancelJoinRequest.mockResolvedValue(undefined);
  });

  it('loads the list (skeleton → cards), searches, refreshes and opens the details route', async () => {
    const { router } = renderRoute(routes, '/settings/pools');
    expect(screen.getByTestId('content-loader')).toBeInTheDocument();
    expect(await screen.findByTestId('pool-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('pool-card-2')).toBeInTheDocument();
    expect(hook.state.loadPools).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('pools-network-status')).toHaveTextContent('SKALE Europa Hub');
    expect(screen.getByTestId('pools-network-status')).toHaveTextContent('Account: 0xACC0...0001');
    expect(screen.getByTestId('current-blox-indicator')).toHaveTextContent('My Blox');

    fireEvent.change(screen.getByTestId('pools-search'), { target: { value: 'bet' } });
    expect(screen.queryByTestId('pool-card-1')).toBeNull();
    expect(screen.getByTestId('pool-card-2')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('pools-refresh'));
    await waitFor(() => expect(hook.state.loadPools).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('pool-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('pools-search')).toHaveValue('');

    fireEvent.click(within(screen.getByTestId('pool-card-2')).getByTestId('pool-2-details'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/pools/2'));
  });

  it('join happy path: confirm → Blox joinPool → join server → success toast, join state cleared', async () => {
    renderRoute(routes, '/settings/pools');
    const card = await screen.findByTestId('pool-card-1');
    const join = within(card).getByTestId('pool-1-primary');
    expect(join).toHaveTextContent('Join');
    fireEvent.click(join);

    const dialog = await screen.findByTestId('fx-confirm');
    expect(dialog).toHaveTextContent('Join Pool');
    expect(dialog).toHaveTextContent('join pool: Alpha on skale for Blox: p1');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Join' }));

    await waitFor(() => expect(fulaMock.joinPoolWithChain).toHaveBeenCalledWith(1, 'skale'));
    await waitFor(() =>
      expect(api.joinPool).toHaveBeenCalledWith({
        peerId: 'cluster1',
        kuboPeerId: 'p1',
        account: '0xACC0000000000000000000000000000000000001',
        chain: 'skale',
        poolId: 1,
      }),
    );
    expect(await screen.findByText('Pool Joined Successfully')).toBeInTheDocument();
    expect(screen.getByText('Transaction: 0x12345678...')).toBeInTheDocument();
    await waitFor(async () => expect(await kvStore.getItem('joinState_1_p1')).toBeNull());
    await waitFor(() => expect(confirmDialog()).toBeNull());
  });

  it('join on Base sends "base" to the Blox and the join server, ignoring SKALE progress for the same pool id', async () => {
    // Left over from a SKALE join of pool 1 (legacy key) — must not make the Base pool 1 skip step 1.
    await kvStore.setItem('joinState_1_p1', JSON.stringify({ step1Complete: true, step2Complete: true }));
    useSettingsStore.setState({ selectedChain: 'base' });
    renderRoute(routes, '/settings/pools');
    const card = await screen.findByTestId('pool-card-1');
    const join = within(card).getByTestId('pool-1-primary');
    await waitFor(() => expect(join).toHaveTextContent('Join'));
    fireEvent.click(join);
    const dialog = await screen.findByTestId('fx-confirm');
    expect(dialog).toHaveTextContent('join pool: Alpha on base for Blox: p1');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Join' }));

    await waitFor(() => expect(fulaMock.joinPoolWithChain).toHaveBeenCalledWith(1, 'base'));
    await waitFor(() =>
      expect(api.joinPool).toHaveBeenCalledWith(expect.objectContaining({ chain: 'base', poolId: 1 })),
    );
    expect(await screen.findByText('Pool Joined Successfully')).toBeInTheDocument();
    // SKALE's legacy entry is untouched; the Base entry was cleared after success.
    expect(await kvStore.getItem('joinState_1_p1')).not.toBeNull();
    await waitFor(async () => expect(await kvStore.getItem('joinState_base_1_p1')).toBeNull());
  });

  it('force rejoin re-sends the pool to the Blox with the selected chain', async () => {
    hook.state.pools = [pool('1', 'Alpha', { joined: true, numVotes: 2, numVoters: 3 })];
    hook.state.userMemberPools = ['1'];
    useSettingsStore.setState({ selectedChain: 'base' });
    renderRoute(routes, '/settings/pools');
    const card = await screen.findByTestId('pool-card-1');
    fireEvent.click(within(card).getByTestId('pool-1-force-rejoin'));
    await waitFor(() => expect(fulaMock.joinPoolWithChain).toHaveBeenCalledWith(1, 'base'));
    expect(api.joinPool).not.toHaveBeenCalled();
  });

  it('join failure with 401 → the 3-way "Blox Not Registered" dialog; "Register Blox" opens the Users tab', async () => {
    fulaMock.joinPoolWithChain.mockRejectedValueOnce(new Error('blox offline'));
    api.joinPool.mockResolvedValueOnce({
      status: 'err',
      msg: '401 Unauthorized: blox not registered',
    });
    const { router } = renderRoute(routes, '/settings/pools');
    const card = await screen.findByTestId('pool-card-1');
    fireEvent.click(within(card).getByTestId('pool-1-primary'));
    fireEvent.click(
      within(await screen.findByTestId('fx-confirm')).getByRole('button', { name: 'Join' }),
    );

    const dialog = await screen.findByText('Blox Not Registered');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open a GitHub Issue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Register Blox' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/users'));
    const stored = JSON.parse((await kvStore.getItem('joinState_1_p1')) ?? '{}');
    expect(stored.step1Error).toBe('blox offline');
    expect(stored.step2Error).toContain('401');
  });

  it('leave sends the Blox cluster peer id on-chain (chain + gas confirm on Base), then tells the Blox', async () => {
    hook.state.pools = [pool('1', 'Alpha', { joined: true, numVotes: 2, numVoters: 3 })];
    hook.state.userMemberPools = ['1'];
    useSettingsStore.setState({ selectedChain: 'base' });
    await kvStore.setItem('joinState_base_1_p1', JSON.stringify({ step1Complete: true, step2Complete: true }));
    renderRoute(routes, '/settings/pools');
    const card = await screen.findByTestId('pool-card-1');
    expect(card).toHaveTextContent('Joined');
    expect(card).toHaveTextContent('2/3');
    fireEvent.click(within(card).getByTestId('pool-1-leave'));

    const dialog = await screen.findByTestId('fx-confirm');
    expect(dialog).toHaveTextContent('Leave pool "Alpha" on Base Network');
    expect(dialog).toHaveTextContent('Base charges gas fees');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Leave' }));
    // The cluster peer id — never the wallet address — is what joins register on-chain.
    await waitFor(() => expect(hook.state.leavePool).toHaveBeenCalledWith('1', 'cluster1'));
    await waitFor(() => expect(fulaMock.leavePoolWithChain).toHaveBeenCalledWith(1, 'base'));
    await waitFor(async () => expect(await kvStore.getItem('joinState_base_1_p1')).toBeNull());
    // Mobile order: the "Leaving Pool" info toast (3 s) shows first; the success toast is queued behind it.
    expect(await screen.findByText('Leaving Pool')).toBeInTheDocument();
    expect(
      await screen.findByText('Left Pool Successfully', {}, { timeout: 6000 }),
    ).toBeInTheDocument();
  }, 10_000);

  it('a failed leave keeps the join progress, does not tell the Blox and shows no misleading toast', async () => {
    hook.state.pools = [pool('1', 'Alpha', { joined: true })];
    hook.state.userMemberPools = ['1'];
    hook.state.leavePool.mockResolvedValueOnce(null); // executeContractCall already toasted the reason
    await kvStore.setItem('joinState_1_p1', JSON.stringify({ step1Complete: true, step2Complete: true }));
    renderRoute(routes, '/settings/pools');
    fireEvent.click(within(await screen.findByTestId('pool-card-1')).getByTestId('pool-1-leave'));
    fireEvent.click(within(await screen.findByTestId('fx-confirm')).getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(hook.state.leavePool).toHaveBeenCalledWith('1', 'cluster1'));
    await waitFor(() => expect(confirmDialog()).toBeNull());
    expect(await kvStore.getItem('joinState_1_p1')).not.toBeNull();
    expect(fulaMock.leavePoolWithChain).not.toHaveBeenCalled();
    expect(screen.queryByText('Left Pool Successfully')).toBeNull();
    expect(screen.queryByText('Transaction Cancelled')).toBeNull();
  });

  it('refuses to leave when the Blox cluster peer id is unknown', async () => {
    hook.state.pools = [pool('1', 'Alpha', { joined: true })];
    hook.state.userMemberPools = ['1'];
    hook.state.currentClusterPeerId = undefined;
    renderRoute(routes, '/settings/pools');
    fireEvent.click(within(await screen.findByTestId('pool-card-1')).getByTestId('pool-1-leave'));
    expect(await screen.findByText('Blox Not Ready')).toBeInTheDocument();
    expect(confirmDialog()).toBeNull();
    expect(hook.state.leavePool).not.toHaveBeenCalled();
  });

  it('when the Blox cannot be told, the on-chain leave still succeeds and an info toast explains it', async () => {
    hook.state.pools = [pool('1', 'Alpha', { joined: true })];
    hook.state.userMemberPools = ['1'];
    fulaMock.leavePoolWithChain.mockRejectedValueOnce(new Error('blox offline'));
    renderRoute(routes, '/settings/pools');
    fireEvent.click(within(await screen.findByTestId('pool-card-1')).getByTestId('pool-1-leave'));
    fireEvent.click(within(await screen.findByTestId('fx-confirm')).getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(fulaMock.leavePoolWithChain).toHaveBeenCalledWith(1, 'skale'));
    expect(
      await screen.findByText('Blox Not Updated Yet', {}, { timeout: 8000 }),
    ).toBeInTheDocument();
  }, 12_000);

  it('cancel request sends the cluster peer id with a confirm, then tells the Blox; the card shows the vote count', async () => {
    hook.state.pools = [pool('1', 'Alpha', { requested: true, numVotes: 1, numVoters: 3 })];
    renderRoute(routes, '/settings/pools');
    const card = await screen.findByTestId('pool-card-1');
    expect(card).toHaveTextContent('Requested (votes: 1/3)');
    fireEvent.click(within(card).getByTestId('pool-1-cancel-request'));
    const dialog = await screen.findByTestId('fx-confirm');
    expect(dialog).toHaveTextContent('Cancel your join request for "Alpha" on SKALE Europa Hub');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel request' }));
    await waitFor(() => expect(hook.state.cancelJoinRequest).toHaveBeenCalledWith('1', 'cluster1'));
    expect(await screen.findByText('Join Request Cancelled')).toBeInTheDocument();
    await waitFor(() => expect(fulaMock.leavePoolWithChain).toHaveBeenCalledWith(1, 'skale'));
  });

  it('shows the error state with Retry when the list failed to load', async () => {
    hook.state.pools = [];
    hook.state.error = 'RPC unreachable';
    renderRoute(routes, '/settings/pools');
    expect(await screen.findByText('Error loading pools!')).toBeInTheDocument();
    expect(screen.getByText('RPC unreachable')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pools-retry'));
    await waitFor(() => expect(hook.state.loadPools).toHaveBeenCalledTimes(2));
  });
});

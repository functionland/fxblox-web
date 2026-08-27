import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hook = vi.hoisted(() => ({
  state: {
    pools: [
      {
        poolId: '1',
        poolID: '1',
        name: 'Alpha',
        region: 'EU',
        parent: '',
        participants: ['0xfeed000000000000000000000000000000000001'],
        replicationFactor: 1,
        maxMembers: 12,
        requiredTokens: '100',
      },
    ],
    loading: false,
    contractService: null as null | { getPoolMembers: (id: string) => Promise<string[]> },
    isReady: false,
    connectedAccount: '0xAAA0000000000000000000000000000000000001',
    userMemberPools: [] as string[],
    leavePool: vi.fn(async () => undefined as void | null),
    joinPoolViaAPI: vi.fn(async () => ({ success: true, message: 'Join request queued' })),
  },
}));
vi.mock('@/hooks/usePoolsWithFallback', () => ({ usePoolsWithFallback: () => hook.state }));
vi.mock('@/hooks/useWalletNetwork', () => ({
  useWalletNetwork: () => ({ withCorrectNetwork: async <T,>(op: () => Promise<T>) => op() }),
}));
vi.mock('@/lib/fula', () => ({
  fula: { isReady: vi.fn(async () => true) },
  blockchain: { joinPoolWithChain: vi.fn(async () => ({ account: 'a', poolID: 1 })) },
  fxblox: {},
}));

import PoolDetails from '@/screens/Settings/Pools/PoolDetails';
import { useSettingsStore } from '@/stores';
import { confirmDialog, renderRoute, resetSettingsStores, seedBlox } from './testUtils';

const routes = [
  { path: '/settings/pools', element: <p>pools list</p> },
  { path: '/settings/pools/:poolId', element: <PoolDetails /> },
  { path: '/settings/pools/:poolId/join-requests', element: <p>join requests page</p> },
];

describe('PoolDetails', () => {
  beforeEach(() => {
    resetSettingsStores();
    seedBlox();
    hook.state.userMemberPools = [];
    hook.state.contractService = null;
    hook.state.isReady = false;
    vi.clearAllMocks();
  });

  it('renders the pool rows, members (contract service) and leaves through the contract with a confirm', async () => {
    hook.state.userMemberPools = ['1'];
    hook.state.isReady = true;
    hook.state.contractService = {
      getPoolMembers: vi.fn(async () => [
        '0xAAA0000000000000000000000000000000000001',
        '0xBBB0000000000000000000000000000000000002',
      ]),
    };
    useSettingsStore.setState({ selectedChain: 'base', baseAuthorized: true });
    const { router } = renderRoute(routes, '/settings/pools/1');

    expect(screen.getByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByTestId('pool-details-card')).toHaveTextContent('EU');
    expect(screen.getByTestId('pool-details-card')).toHaveTextContent('Base Network');
    expect(screen.getByTestId('pool-details-card')).toHaveTextContent('12');
    expect(screen.getByTestId('pool-details-card')).toHaveTextContent('100 FULA');
    expect(await screen.findByText('Members (2)')).toBeInTheDocument();
    expect(screen.getByText('0xAAA0...0001 (You)')).toBeInTheDocument();
    expect(screen.getByText('0xBBB0...0002')).toBeInTheDocument();
    expect(screen.getByTestId('pool-details-join-requests-card')).toHaveTextContent('coming soon');

    fireEvent.click(screen.getByTestId('pool-details-leave'));
    const dialog = await screen.findByTestId('fx-confirm');
    expect(dialog).toHaveTextContent('Leave Pool Confirmation');
    expect(dialog).toHaveTextContent('Base Network');
    expect(dialog).toHaveTextContent('Base charges gas fees');
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(hook.state.leavePool).toHaveBeenCalledWith('1'));
    expect(await screen.findByText('Left Pool')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/pools'));
    await waitFor(() => expect(confirmDialog()).toBeNull());
  });

  it('non-member: members fall back to the RPC participants, Join goes through the join server; a failed join toasts', async () => {
    renderRoute(routes, '/settings/pools/1');
    expect(await screen.findByText('Members (1)')).toBeInTheDocument();
    expect(screen.getByText('0xfeed...0001')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('pool-details-join'));
    expect(await screen.findByTestId('fx-confirm')).toHaveTextContent('Join Pool Confirmation');
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(hook.state.joinPoolViaAPI).toHaveBeenCalledWith('1', 'Alpha'));
    expect(await screen.findByText('Join Request Sent')).toBeInTheDocument();
  });

  it('a rejected join-server request toasts the server message', async () => {
    hook.state.joinPoolViaAPI.mockResolvedValueOnce({
      success: false,
      message: 'Blox not registered',
    });
    renderRoute(routes, '/settings/pools/1');
    fireEvent.click(screen.getByTestId('pool-details-join'));
    fireEvent.click(await screen.findByRole('button', { name: 'Join' }));
    expect(await screen.findByText('Join Failed')).toBeInTheDocument();
    expect(screen.getByText('Blox not registered')).toBeInTheDocument();
  });

  it('unknown pool id → "Pool not found" once the list is loaded', () => {
    renderRoute(routes, '/settings/pools/99');
    expect(screen.getByTestId('pool-not-found')).toHaveTextContent('Pool not found');
  });
});

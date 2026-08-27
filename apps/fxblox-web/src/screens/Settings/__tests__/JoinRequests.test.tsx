import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hook = vi.hoisted(() => ({
  state: {
    pools: [
      { poolId: '1', poolID: '1', name: 'Alpha', region: 'EU', parent: '', participants: [] },
    ],
    contractService: { getPoolMembers: vi.fn(async () => []) },
    isReady: true,
    connectedAccount: '0xabc',
    userMemberPools: [] as string[],
    voteJoinRequest: vi.fn(async () => undefined),
  },
}));
vi.mock('@/hooks/usePoolsWithFallback', () => ({ usePoolsWithFallback: () => hook.state }));

import JoinRequests from '@/screens/Settings/Pools/JoinRequests';
import { renderRoute, resetSettingsStores, seedBlox } from './testUtils';

const routes = [{ path: '/settings/pools/:poolId/join-requests', element: <JoinRequests /> }];

describe('JoinRequests', () => {
  beforeEach(() => {
    resetSettingsStores();
    seedBlox();
  });

  it('denies access to non-members', () => {
    hook.state.userMemberPools = [];
    renderRoute(routes, '/settings/pools/1/join-requests');
    expect(screen.getByTestId('join-requests-denied')).toHaveTextContent('Access Denied');
    expect(screen.getByText(/must be a member of this pool/)).toBeInTheDocument();
  });

  it('members see the header, the empty placeholder and the development note', async () => {
    hook.state.userMemberPools = ['1'];
    renderRoute(routes, '/settings/pools/1/join-requests');
    expect(screen.getByRole('heading', { name: 'Join Requests for Alpha' })).toBeInTheDocument();
    expect(screen.getByText('Pool ID: 1 • Network: SKALE Europa Hub')).toBeInTheDocument();
    expect(await screen.findByTestId('join-requests-empty')).toHaveTextContent('No Join Requests');
    expect(screen.getByText(/currently in development/)).toBeInTheDocument();
    expect(screen.getByTestId('join-requests-refresh')).toBeInTheDocument();
  });

  it('shows "Pool not found" for a member of an unknown pool', () => {
    hook.state.userMemberPools = ['99'];
    renderRoute(routes, '/settings/pools/99/join-requests');
    expect(screen.getByTestId('join-requests-not-found')).toHaveTextContent('Pool not found');
  });
});

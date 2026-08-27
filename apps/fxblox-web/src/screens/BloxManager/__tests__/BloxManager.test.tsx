import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/fula', () => import('@/components/main/__tests__/fulaMock'));
vi.mock('@/components/main/useEnsureFulaClient', () => ({ useEnsureFulaClient: () => undefined }));

import BloxManager from '@/screens/BloxManager/BloxManager';
import { useBloxsStore } from '@/stores';
import { renderRoute, resetStores, setPairedStores, TEST_BLOX_PEER_ID } from '@/components/main/__tests__/testUtils';

function renderManager() {
  return renderRoute(<BloxManager />, {
    path: '/blox/manage',
    extraRoutes: [{ path: '/blox', element: <div data-testid="blox-page" /> }],
  });
}

describe('BloxManager', () => {
  beforeEach(() => {
    resetStores();
    setPairedStores({
      name: 'Office',
      status: 'CONNECTED',
      extraBloxs: [{ peerId: 'p2', name: 'Garage', status: 'DISCONNECTED' }],
    });
  });

  it('lists every Blox with its status; Open switches to the other Blox and returns to the dashboard', async () => {
    const switchToBlox = vi.fn(async () => undefined);
    const checkBloxConnection = vi.fn(async () => true);
    useBloxsStore.setState({ switchToBlox, checkBloxConnection });
    const { router } = renderManager();

    const grid = screen.getByTestId('blox-manager-grid');
    expect(within(grid).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByTestId(`blox-card-${TEST_BLOX_PEER_ID}`)).toHaveTextContent('CONNECTED');
    expect(screen.getByTestId('blox-card-p2')).toHaveTextContent('DISCONNECTED');
    expect(screen.getByTestId(`blox-card-${TEST_BLOX_PEER_ID}-open`)).toBeDisabled();
    expect(screen.getByTestId(`blox-card-${TEST_BLOX_PEER_ID}-open`)).toHaveTextContent('Current');
    expect(screen.getByTestId('blox-manager-note')).toHaveTextContent(/keep it in the foreground/);

    fireEvent.click(screen.getByTestId(`blox-card-${TEST_BLOX_PEER_ID}-status`));
    expect(checkBloxConnection).toHaveBeenCalledWith(1, 5);

    fireEvent.click(screen.getByTestId('blox-card-p2-status'));
    expect(switchToBlox).toHaveBeenCalledWith('p2');

    fireEvent.click(screen.getByTestId('blox-card-p2-open'));
    expect(switchToBlox).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(router.state.location.pathname).toBe('/blox'));
  });

  it('"Check All" runs the sweep and is disabled while any check is in flight', async () => {
    const checkAllBloxStatus = vi.fn(async () => undefined);
    useBloxsStore.setState({ checkAllBloxStatus });
    renderManager();

    const button = screen.getByTestId('blox-manager-check-all');
    expect(button).toHaveTextContent('Check All');
    fireEvent.click(button);
    await waitFor(() => expect(checkAllBloxStatus).toHaveBeenCalledTimes(1));

    useBloxsStore.setState({ _isCheckingAllStatus: true });
    await waitFor(() => expect(screen.getByTestId('blox-manager-check-all')).toBeDisabled());
    expect(screen.getByTestId('blox-manager-check-all')).toHaveTextContent('Checking...');
    fireEvent.click(screen.getByTestId('blox-manager-check-all'));
    expect(checkAllBloxStatus).toHaveBeenCalledTimes(1);

    // A single Blox in CHECKING also disables it (mobile `anyBloxBusy`).
    useBloxsStore.setState({ _isCheckingAllStatus: false, bloxsConnectionStatus: { p2: 'CHECKING' } });
    await waitFor(() => expect(screen.getByTestId('blox-manager-check-all')).toBeDisabled());
    expect(screen.getByTestId('blox-card-p2-status')).toBeDisabled();
  });
});

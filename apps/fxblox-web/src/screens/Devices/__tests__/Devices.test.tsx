import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/fula', () => import('@/components/main/__tests__/fulaMock'));
vi.mock('@/components/main/useEnsureFulaClient', () => ({ useEnsureFulaClient: () => undefined }));

import Devices from '@/screens/Devices/Devices';
import { useBloxsStore } from '@/stores';
import { renderRoute, resetStores, setPairedStores, TEST_BLOX_PEER_ID } from '@/components/main/__tests__/testUtils';

describe('Devices', () => {
  beforeEach(() => {
    resetStores();
  });

  it('renders the disk card from the current Blox space info and refreshes it', async () => {
    setPairedStores({ fulaIsReady: true });
    const getBloxSpace = vi.fn(async () => ({ size: 2_000_000_000, avail: 1, used: 1, used_percentage: 50, device_count: 1 }));
    const getFolderSize = vi.fn(async () => ({ fula: '1000', chain: '2000', fulaCount: '4', userOwnData: '3000' }));
    useBloxsStore.setState({
      getBloxSpace,
      getFolderSize,
      bloxsSpaceInfo: { [TEST_BLOX_PEER_ID]: { size: 2_000_000_000, avail: 1, used: 1, used_percentage: 50, device_count: 1 } },
      folderSizeInfo: { [TEST_BLOX_PEER_ID]: { fula: '1000', chain: '2000', fulaCount: '4', userOwnData: '3000' } },
    });
    renderRoute(<Devices />, { path: '/devices' });

    expect(screen.getByTestId('devices-screen')).toHaveAttribute('data-screen', 'devices');
    expect(screen.getByRole('heading', { name: 'Connected Devices' })).toBeInTheDocument();
    const card = screen.getByTestId('device-card');
    expect(card).toHaveTextContent('Hard Disk');
    expect(card).toHaveTextContent('2.00 GB');
    expect(card).toHaveTextContent('1.00 KB (4)');
    expect(screen.getByTestId('device-card-status')).toHaveTextContent('In use');

    fireEvent.click(screen.getByTestId('device-card-refresh'));
    await waitFor(() => expect(getBloxSpace).toHaveBeenCalled());
    await waitFor(() => expect(getFolderSize).toHaveBeenCalled());
  });

  it('without space info the disk is "Not available" and a refresh before the client is ready is a no-op', async () => {
    setPairedStores({ fulaIsReady: false });
    const getBloxSpace = vi.fn(async () => ({ size: 0, avail: 0, used: 0, used_percentage: 0, device_count: 0 }));
    useBloxsStore.setState({ getBloxSpace });
    renderRoute(<Devices />, { path: '/devices' });
    expect(screen.getByTestId('device-card-status')).toHaveTextContent('Not available');
    expect(screen.getByTestId('device-card')).toHaveTextContent('— (—)');
    fireEvent.click(screen.getByTestId('device-card-refresh'));
    await waitFor(() => expect(screen.getByTestId('device-card-refresh')).toBeInTheDocument());
    expect(getBloxSpace).not.toHaveBeenCalled();
  });
});

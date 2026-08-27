import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/fula', () => import('@/components/main/__tests__/fulaMock'));

import { TestProviders } from '@/test/helpers/renderWithProviders';
import { DeviceCard } from '@/components/Cards/DeviceCard';
import { EDeviceStatus } from '@/models';
import { fxblox, resetFulaMock } from '@/components/main/__tests__/fulaMock';

const data = {
  name: 'Hard Disks',
  capacity: 1_000_000_000_000,
  folderInfo: { fula: '5000000', chain: '2000000', fulaCount: '12', userOwnData: '7000000' },
  status: EDeviceStatus.InUse,
  associatedDevices: ['Blox Set Up'],
};

describe('DeviceCard', () => {
  beforeEach(() => resetFulaMock());

  it('renders the rows and the kebab opens the actions sheet with the LED sequence; Format runs after confirm', async () => {
    const onRefresh = vi.fn();
    render(
      <TestProviders>
        <DeviceCard data={data} onRefreshPress={onRefresh} />
      </TestProviders>,
    );
    const card = screen.getByTestId('device-card');
    expect(card).toHaveTextContent('1.00 TB');
    expect(card).toHaveTextContent('5.00 MB (12)');
    expect(card).toHaveTextContent('2.00 MB');
    expect(card).toHaveTextContent('7.00 MB');
    expect(screen.getByTestId('device-card-status')).toHaveTextContent('In use');
    expect(screen.getByText('Blox Set Up')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('device-card-refresh'));
    expect(onRefresh).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Device actions' }));
    const sheet = await screen.findByTestId('device-card-actions-sheet');
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(5);
    expect(sheet).toHaveTextContent('turns purple for 2 minutes');

    fireEvent.click(screen.getByTestId('device-card-format'));
    const confirm = await screen.findByTestId('fx-confirm');
    expect(confirm).toHaveTextContent('Format All Blox Partitions!');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(fxblox.partition).toHaveBeenCalled());
    expect(await screen.findByText('Request Sent')).toBeInTheDocument();
  });

  it('cancelling the format confirm does not send the partition command; a failure toasts the error', async () => {
    render(
      <TestProviders>
        <DeviceCard data={{ ...data, status: EDeviceStatus.NotAvailable }} />
      </TestProviders>,
    );
    expect(screen.getByTestId('device-card-status')).toHaveTextContent('Not available');
    fireEvent.click(screen.getByRole('button', { name: 'Device actions' }));
    fireEvent.click(await screen.findByTestId('device-card-format'));
    const confirm = await screen.findByTestId('fx-confirm');
    fireEvent.click(within(confirm).getByRole('button', { name: 'No' }));
    await waitFor(() => expect(screen.queryByTestId('fx-confirm')).toBeNull());
    expect(fxblox.partition).not.toHaveBeenCalled();

    fxblox.partition.mockRejectedValueOnce(new Error('BLE write failed'));
    fireEvent.click(screen.getByTestId('device-card-format'));
    const confirm2 = await screen.findByTestId('fx-confirm');
    fireEvent.click(within(confirm2).getByRole('button', { name: 'Yes' }));
    expect(await screen.findByText('BLE write failed')).toBeInTheDocument();
  });
});

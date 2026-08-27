import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/wifi', () => ({
  getWifiList: vi.fn(),
  postWifiConnect: vi.fn(),
  getWifiStatus: vi.fn(),
  putApDisable: vi.fn(),
}));

import { getWifiStatus, putApDisable } from '@/api/wifi';
import { _setTimingsForTests, statusFromWifiStatus, NetworkStatus } from '../CheckConnection';
import { renderSetupAt, resetStores } from './renderSetup';

const statusMock = getWifiStatus as unknown as ReturnType<typeof vi.fn>;
const apDisableMock = putApDisable as unknown as ReturnType<typeof vi.fn>;

describe('CheckConnection', () => {
  let restore: () => void;
  beforeEach(() => {
    resetStores({ identity: true });
    statusMock.mockReset();
    apDisableMock.mockReset();
    restore = _setTimingsForTests({ pollMs: 30 });
  });
  afterEach(() => restore());

  it('maps the firmware wifi/status shapes', () => {
    expect(statusFromWifiStatus(true)).toBe(NetworkStatus.Connected);
    expect(statusFromWifiStatus('connected')).toBe(NetworkStatus.Connected);
    expect(statusFromWifiStatus(false)).toBe(NetworkStatus.Connecting);
    expect(statusFromWifiStatus('failed-connection')).toBe(NetworkStatus.FailedConnection);
  });

  it('"I\'m connected" polls wifi/status every 5 s; connected → ap/disable → Setup complete', async () => {
    statusMock
      .mockResolvedValueOnce({ data: { status: false } })
      .mockResolvedValueOnce({ data: { status: false } })
      .mockResolvedValue({ data: { status: true } });
    apDisableMock.mockRejectedValue(new Error('hotspot gone')); // expected once the AP drops
    const { router } = await renderSetupAt('/setup/check-connection?ssid=HomeNet');
    expect(await screen.findByText('Verifying connection with HomeNet')).toBeInTheDocument();
    expect(screen.getByText(/Your Blox is joining "HomeNet"/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '90');
    expect(statusMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('im-connected'));
    await waitFor(() => expect(statusMock.mock.calls.length).toBeGreaterThanOrEqual(3));
    await waitFor(() => expect(apDisableMock).toHaveBeenCalled());
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/complete'));
    expect(await screen.findByText(/All done/)).toBeInTheDocument();
  });

  it('a failing status call shows the retry copy and keeps polling until stopped', async () => {
    statusMock.mockRejectedValue(new Error('unreachable'));
    await renderSetupAt('/setup/check-connection?ssid=HomeNet');
    await userEvent.click(await screen.findByTestId('im-connected'));
    expect(await screen.findByTestId('connection-status')).toHaveTextContent(
      "Couldn't connect with HomeNet. Please try again.",
    );
    await waitFor(() => expect(statusMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    await userEvent.click(screen.getByRole('button', { name: 'Stop checking' }));
    const calls = statusMock.mock.calls.length;
    await new Promise((r) => setTimeout(r, 120));
    expect(statusMock.mock.calls.length).toBe(calls);
    expect(screen.getByRole('button', { name: "I'm connected" })).toBeInTheDocument();
  });

  it('"Skip this check" goes to Setup complete without polling', async () => {
    const { router } = await renderSetupAt('/setup/check-connection?ssid=HomeNet');
    await userEvent.click(await screen.findByTestId('skip-check'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/complete'));
    expect(statusMock).not.toHaveBeenCalled();
  });
});

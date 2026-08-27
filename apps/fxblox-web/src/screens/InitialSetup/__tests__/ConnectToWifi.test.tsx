import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/wifi', () => ({
  getWifiList: vi.fn(),
  postWifiConnect: vi.fn(),
  getWifiStatus: vi.fn(),
  putApDisable: vi.fn(),
}));

import { getWifiList, postWifiConnect } from '@/api/wifi';
import { LanHttpError } from '@/platform/lanHttp';
import { renderSetupAt, resetStores } from './renderSetup';

const listMock = getWifiList as unknown as ReturnType<typeof vi.fn>;
const connectMock = postWifiConnect as unknown as ReturnType<typeof vi.fn>;

const NETWORKS = [
  { ssid: 'HomeNet', rssi: -45 },
  { ssid: '"CoffeeShop"', rssi: -70 },
  { essid: 'HomeNet', rssi: -50 }, // duplicate (essid form)
  { ssid: '', rssi: -90 },
];

async function connectTo(ssid: string, password = 'hunter2', country = 'DE') {
  await userEvent.click(await screen.findByText(ssid));
  const sheet = await screen.findByTestId('wifi-password-sheet');
  expect(sheet).toHaveTextContent(`Enter password for "${ssid}"`);
  const countryInput = within(sheet).getByTestId('wifi-country') as HTMLInputElement;
  expect(countryInput.value).toMatch(/^[A-Z]{2}$/); // locale.country() default (navigator region → CA)
  await userEvent.clear(countryInput);
  await userEvent.type(countryInput, country);
  await userEvent.type(within(sheet).getByTestId('wifi-password'), password);
  await userEvent.click(within(sheet).getByTestId('wifi-connect'));
}

describe('ConnectToWifi', () => {
  beforeEach(() => {
    resetStores({ identity: true });
    listMock.mockReset();
    connectMock.mockReset();
    localStorage.removeItem('fx.countryCode');
  });

  it('lists the networks the Blox sees (deduped, sorted), connects and goes to Check connection', async () => {
    listMock.mockResolvedValue({ data: NETWORKS });
    connectMock.mockResolvedValue({ data: 'Wifi connected!' });
    const { router } = await renderSetupAt('/setup/connect-wifi');
    const list = await screen.findByTestId('wifi-list');
    await waitFor(() => expect(within(list).getAllByRole('button')).toHaveLength(2));
    expect(
      within(list)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['CoffeeShop', 'HomeNet']);
    expect(screen.getByTestId('setup-continue')).toBeDisabled();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '80');

    await connectTo('HomeNet');
    expect(connectMock).toHaveBeenCalledWith({
      ssid: 'HomeNet',
      password: 'hunter2',
      countryCode: 'DE',
    });
    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        '/setup/check-connection?ssid=HomeNet',
      ),
    );
    expect(localStorage.getItem('fx.countryCode')).toBe('DE');
  });

  it('proceeds when the hotspot drops after wifi/connect (the Blox joined the network)', async () => {
    listMock.mockResolvedValue({ data: NETWORKS });
    connectMock.mockRejectedValue(
      new LanHttpError('unreachable', 'http://10.42.0.1:3500/wifi/connect', 'gone'),
    );
    const { router } = await renderSetupAt('/setup/connect-wifi');
    await connectTo('HomeNet');
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/check-connection'));
  });

  it('a definite failure (HTTP error) toasts and stays on the screen', async () => {
    listMock.mockResolvedValue({ data: NETWORKS });
    connectMock.mockRejectedValue(
      new LanHttpError('http', 'http://10.42.0.1:3500/wifi/connect', 'HTTP 400', { status: 400 }),
    );
    const { router } = await renderSetupAt('/setup/connect-wifi');
    await connectTo('HomeNet');
    expect(await screen.findByText('Unable to connect to wifi')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/setup/connect-wifi');
  });

  it('hidden network: manual SSID entry opens the password sheet for that name', async () => {
    listMock.mockResolvedValue({ data: [] });
    connectMock.mockResolvedValue({ data: 'Wifi connected!' });
    const { router } = await renderSetupAt('/setup/connect-wifi');
    expect(await screen.findByText(/We could not find the available WiFi/)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('toggle-hidden-network'));
    await userEvent.type(screen.getByTestId('hidden-ssid'), 'Secret Net');
    await userEvent.click(screen.getByTestId('enter-password-for'));
    const sheet = await screen.findByTestId('wifi-password-sheet');
    expect(sheet).toHaveTextContent('Enter password for "Secret Net"');
    await userEvent.type(within(sheet).getByTestId('wifi-password'), 'pw');
    await userEvent.click(within(sheet).getByTestId('wifi-connect'));
    await waitFor(() => expect(router.state.location.search).toBe('?ssid=Secret+Net'));
  });

  it('"Use Wired LAN" confirms and goes straight to Setup complete', async () => {
    listMock.mockResolvedValue({ data: NETWORKS });
    const { router } = await renderSetupAt('/setup/connect-wifi');
    await userEvent.click(await screen.findByTestId('use-lan'));
    expect(await screen.findByTestId('fx-confirm')).toHaveTextContent('Connect via Wired LAN');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe('/setup/complete'),
    );
  });

  it('a failed list shows the error and Refresh retries', async () => {
    listMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ data: NETWORKS });
    await renderSetupAt('/setup/connect-wifi');
    expect(
      await screen.findByText('Could not read the Wi-Fi list from the Blox.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('refresh-wifi'));
    expect(await screen.findByText('HomeNet')).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledTimes(2);
  });
});

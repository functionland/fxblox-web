import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  nasCredentials: vi.fn(),
  osName: vi.fn(() => 'windows'),
  openUrl: vi.fn(() => true),
  findAuthorizedBlox: vi.fn(() => null),
  rememberedLanIp: vi.fn(async () => null as { ip: string } | null),
  loadManualBloxIp: vi.fn(async () => null as string | null),
}));
vi.mock('@/lib/fula', () => ({ fula: {}, blockchain: { nasCredentials: h.nasCredentials }, fxblox: {} }));
vi.mock('@/platform/deviceInfo', async (orig) => ({
  ...(await orig<typeof import('@/platform/deviceInfo')>()),
  osName: h.osName,
}));
vi.mock('@/platform/linking', async (orig) => ({
  ...(await orig<typeof import('@/platform/linking')>()),
  openUrl: h.openUrl,
}));
vi.mock('@/utils/lanIpCache', async (orig) => ({
  ...(await orig<typeof import('@/utils/lanIpCache')>()),
  findAuthorizedBlox: h.findAuthorizedBlox,
  rememberedLanIp: h.rememberedLanIp,
}));
vi.mock('@/utils/manualBloxIp', async (orig) => ({
  ...(await orig<typeof import('@/utils/manualBloxIp')>()),
  loadManualBloxIp: h.loadManualBloxIp,
}));

import NetworkDrive from '@/screens/Settings/NetworkDrive/NetworkDrive';
import { useBloxsStore, useUserProfileStore } from '@/stores';
import { renderRoute, resetSettingsStores, seedBlox } from './testUtils';

const PASSWORD = 'k3g5j-428r9-q57th-j9w5h';
const CREDS = { status: 'ok', username: 'fxnas', password: PASSWORD, share: 'SharedFolder', hostname: 'fxblox-rk1' };
const routes = [{ path: '/settings/network-drive', element: <NetworkDrive /> }];
const fulaErr = (code: string, status?: number) =>
  Object.assign(new Error('x'), { name: 'FulaWebError', code, ...(status !== undefined ? { status } : {}) });

function ready(peerId = 'p1') {
  useUserProfileStore.setState({ fulaIsReady: true, fulaReadyForPeerId: peerId });
}
const render = () => renderRoute(routes, '/settings/network-drive');

describe('NetworkDrive', () => {
  beforeEach(() => {
    resetSettingsStores();
    useUserProfileStore.setState({ fulaReadyForPeerId: undefined });
    seedBlox({ fulaIsReady: true });
    ready();
    vi.clearAllMocks();
    h.nasCredentials.mockResolvedValue(CREDS);
    h.osName.mockReturnValue('windows');
    h.findAuthorizedBlox.mockReturnValue(null);
    h.rememberedLanIp.mockResolvedValue(null);
    h.loadManualBloxIp.mockResolvedValue(null);
  });
  afterEach(() => {
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
  });

  it('waits for the Blox connection before asking for anything', () => {
    useUserProfileStore.setState({ fulaIsReady: false, fulaReadyForPeerId: undefined });
    render();
    expect(screen.getByText('Connecting to your Blox…')).toBeInTheDocument();
    expect(h.nasCredentials).not.toHaveBeenCalled();
  });

  it('without a Blox shows how to start', () => {
    useBloxsStore.setState({ bloxs: {}, currentBloxPeerId: undefined });
    render();
    expect(screen.getByText('Add or choose a Blox first.')).toBeInTheDocument();
    expect(h.nasCredentials).not.toHaveBeenCalled();
  });

  // fireEvent, not userEvent: userEvent.setup() installs its own clipboard stub over navigator.clipboard.
  it('Windows: shows the sign-in details with the password hidden until "Show password"', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { container } = render();
    expect(await screen.findByTestId('nas-details')).toBeInTheDocument();
    expect(h.nasCredentials).toHaveBeenCalledTimes(1);
    expect(h.nasCredentials).toHaveBeenCalledWith('p1');

    expect(screen.getByRole('tab', { name: 'Windows' })).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByTestId('nas-address')).getByText('\\\\FXBLOX-RK1\\SharedFolder')).toBeInTheDocument();
    expect(within(screen.getByTestId('nas-username')).getByText('fxnas')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain(PASSWORD);

    fireEvent.click(screen.getByRole('button', { name: 'Copy password' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(PASSWORD));
    expect(container.innerHTML).not.toContain(PASSWORD);
    expect(screen.getAllByRole('button', { name: 'Copy address' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Copy user name' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByText(PASSWORD)).toBeInTheDocument();
    expect(screen.getByTestId('nas-steps-windows')).toHaveTextContent('Windows key + R');
  });

  it('two Blox and a known IP: Windows uses the IP address', async () => {
    useBloxsStore.setState({
      bloxs: { p1: { peerId: 'p1', name: 'One' }, p2: { peerId: 'p2', name: 'Two' } },
    });
    h.rememberedLanIp.mockResolvedValue({ ip: '192.168.1.50' });
    render();
    const address = await screen.findByTestId('nas-address');
    await waitFor(() => expect(address).toHaveTextContent('\\\\192.168.1.50\\SharedFolder'));
  });

  it('Mac: smb:// with the IP and an "Open in Finder" button', async () => {
    const user = userEvent.setup();
    h.osName.mockReturnValue('macos');
    h.rememberedLanIp.mockResolvedValue({ ip: '192.168.1.50' });
    render();
    expect(await screen.findByRole('tab', { name: 'Mac' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getByTestId('nas-address')).toHaveTextContent('smb://192.168.1.50/SharedFolder'));
    await user.click(screen.getByTestId('nas-open-finder'));
    expect(h.openUrl).toHaveBeenCalledWith('smb://192.168.1.50/SharedFolder');
  });

  it('iPad (Mac user agent + touch) opens the iPhone/iPad guide and has no Finder button', async () => {
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    h.osName.mockReturnValue('macos');
    render();
    expect(await screen.findByRole('tab', { name: 'iPhone/iPad' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('nas-open-finder')).toBeNull();
    expect(screen.getByTestId('nas-steps-ios')).toHaveTextContent('Connect to Server');
  });

  it('IP unknown on Mac: the name form plus a gentle hint, and "Can\'t connect?" explains how to find the IP', async () => {
    const user = userEvent.setup();
    h.osName.mockReturnValue('macos');
    render();
    expect(await screen.findByTestId('nas-address')).toHaveTextContent('smb://fxblox-rk1/SharedFolder');
    expect(screen.getByTestId('nas-no-ip-hint')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "Can't connect?" }));
    expect(screen.getByText(/look for a device called/)).toBeInTheDocument();
  });

  it('Android: server and folder are shown separately', async () => {
    h.osName.mockReturnValue('android');
    h.rememberedLanIp.mockResolvedValue({ ip: '192.168.1.50' });
    render();
    expect(await screen.findByRole('tab', { name: 'Android' })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(screen.getByTestId('nas-server')).toHaveTextContent('192.168.1.50'));
    expect(screen.getByTestId('nas-share')).toHaveTextContent('SharedFolder');
    expect(screen.getByText(/Android doesn't have this built in/)).toBeInTheDocument();
    // apps that want one address get the full smb:// form in step 3
    expect(screen.getByTestId('nas-steps-android')).toHaveTextContent('smb://192.168.1.50/SharedFolder');
  });

  it.each([
    [fulaErr('HTTP_ERROR', 404), 'Almost ready', 'Check again'],
    [fulaErr('HTTP_ERROR', 400), "Let's try that again", 'Try again'],
    [fulaErr('HTTP_ERROR', 503), 'Your Blox is busy', 'Try again'],
    [fulaErr('HTTP_ERROR', 500), 'Something went wrong', 'Try again'],
    [fulaErr('NOT_AUTHORIZED', 401), 'Update needed', 'Check again'],
    [fulaErr('DIAL_TIMEOUT'), "Can't reach your Blox", 'Try again'],
    [new Error('boom'), 'Something went wrong', 'Try again'],
  ])('error %#: shows "%s" with a "%s" button that asks again', async (err, title, button) => {
    const user = userEvent.setup();
    h.nasCredentials.mockRejectedValueOnce(err);
    render();
    expect(await screen.findByText(title)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: button }));
    await waitFor(() => expect(h.nasCredentials).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('nas-details')).toBeInTheDocument();
  });

  it('401 with a known owner who is someone else: owner-only, no retry', async () => {
    useBloxsStore.setState({ bloxsPropertyInfo: { p1: { authorizer: 'someone-else' } } as never });
    h.nasCredentials.mockRejectedValueOnce(fulaErr('NOT_AUTHORIZED', 401));
    render();
    expect(await screen.findByText('Only the Blox owner can see this')).toBeInTheDocument();
    expect(screen.queryByTestId('nas-retry')).toBeNull();
  });

  it('switching Blox clears the old details and ignores a late answer for the old Blox', async () => {
    let resolveP1: (v: typeof CREDS) => void = () => undefined;
    h.nasCredentials.mockImplementationOnce(() => new Promise((r) => (resolveP1 = r)));
    h.nasCredentials.mockImplementationOnce(async () => ({ ...CREDS, username: 'fxnas2', hostname: 'blox-two' }));
    useBloxsStore.setState({
      bloxs: { p1: { peerId: 'p1', name: 'One' }, p2: { peerId: 'p2', name: 'Two' } },
    });
    render();
    await waitFor(() => expect(h.nasCredentials).toHaveBeenCalledWith('p1'));

    act(() => {
      useBloxsStore.setState({ currentBloxPeerId: 'p2' });
      ready('p2');
    });
    await waitFor(() => expect(h.nasCredentials).toHaveBeenCalledWith('p2'));
    await act(async () => resolveP1(CREDS));
    expect(await screen.findByText('fxnas2')).toBeInTheDocument();
    expect(screen.queryByText('fxnas')).toBeNull();
  });

  it('never writes the password to the console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m));
    const user = userEvent.setup();
    render();
    await screen.findByTestId('nas-details');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    await user.click(screen.getByRole('button', { name: 'Copy password' }));
    for (const spy of spies) {
      for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain(PASSWORD);
      spy.mockRestore();
    }
  });
});

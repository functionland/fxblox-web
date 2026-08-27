import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fulaMock = vi.hoisted(() => ({
  isReady: vi.fn(async () => true),
  autoPinPair: vi.fn(async () => ({
    status: 'paired',
    pairing_secret: 'SECRET/1',
    hardware_id: 'HW-1',
  })),
}));
vi.mock('@/lib/fula', () => ({
  fula: { isReady: fulaMock.isReady },
  blockchain: { autoPinPair: fulaMock.autoPinPair },
  fxblox: {},
}));
const linking = vi.hoisted(() => ({ assign: vi.fn() }));
vi.mock('@/platform/linking', () => ({
  assign: linking.assign,
  openUrl: vi.fn(),
  canOpenUrl: () => true,
}));
const qr = vi.hoisted(() => ({ scanImageFile: vi.fn(async (): Promise<string | null> => null) }));
vi.mock('@/platform/qrScanner', () => ({
  isCameraSupported: () => false,
  createCameraScanner: () => ({ start: async () => undefined, stop: () => undefined }),
  scanImageFile: qr.scanImageFile,
}));
const clipboard = vi.hoisted(() => ({ copyToClipboard: vi.fn(async () => true) }));
vi.mock('@/platform/clipboard', () => ({
  copyToClipboard: clipboard.copyToClipboard,
  readFromClipboard: async () => '',
}));

import AutoPinPairing from '@/screens/Settings/AutoPinPairing/AutoPinPairing';
import { useDAppsStore } from '@/stores';
import { renderRoute, resetSettingsStores, seedBlox } from './testUtils';

const routes = [
  { path: '/autopin-pair', element: <AutoPinPairing /> },
  { path: '/settings/autopin', element: <AutoPinPairing /> },
];
const TEMPLATE =
  'https://files.fx.land/autopin-complete#secret=$secret&hardwareId=$hardwareId&bloxPeerId=$bloxPeerId&bloxName=$bloxName';
const enc = encodeURIComponent;

describe('AutoPinPairing', () => {
  beforeEach(() => {
    resetSettingsStores();
    seedBlox({ name: 'My Blox' });
    vi.clearAllMocks();
    fulaMock.autoPinPair.mockResolvedValue({
      status: 'paired',
      pairing_secret: 'SECRET/1',
      hardware_id: 'HW-1',
    });
  });

  it('deep link: fragment wins over the query, the URL is stripped, pairing registers the dApp and returns to FxFiles', async () => {
    const entry = `/autopin-pair?token=OLD&endpoint=${enc('https://old.example')}#token=NEW&endpoint=${enc('https://api.cloud.fx.land')}&returnUrl=${enc(TEMPLATE)}`;
    const { router } = renderRoute(routes, entry);
    expect(screen.getByText(/FxFiles wants to enable auto-pinning/)).toBeInTheDocument();
    expect(screen.getByText('My Blox')).toBeInTheDocument();
    expect(document.querySelector('[data-autopin-source="fragment"]')).not.toBeNull();
    await waitFor(() => expect(router.state.location.hash).toBe(''));
    expect(router.state.location.search).toBe('');
    expect(router.state.location.pathname).toBe('/autopin-pair');

    fireEvent.click(screen.getByTestId('autopin-enable'));
    await waitFor(() =>
      expect(fulaMock.autoPinPair).toHaveBeenCalledWith('NEW', 'https://api.cloud.fx.land'),
    );
    expect(fulaMock.isReady).toHaveBeenCalledWith(false);

    const dialog = await screen.findByTestId('fx-confirm');
    expect(dialog).toHaveTextContent('Pairing Successful');
    expect(dialog).toHaveTextContent('Auto-pinning is now enabled on My Blox. Return to FxFiles?');
    fireEvent.click(screen.getByRole('button', { name: 'Open FxFiles' }));
    const expected =
      'https://files.fx.land/autopin-complete#secret=SECRET%2F1&hardwareId=HW-1&bloxPeerId=p1&bloxName=My%20Blox';
    await waitFor(() => expect(linking.assign).toHaveBeenCalledWith(expected));

    expect(await screen.findByText(/Auto-pinning is enabled!/)).toBeInTheDocument();
    expect(screen.getByTestId('autopin-open-fxfiles')).toBeInTheDocument();
    expect(useDAppsStore.getState().connectedDApps.p1?.[0]).toMatchObject({
      name: 'FxFiles Auto-Pin',
      bundleId: 'land.fx.files',
      bloxPeerId: 'p1',
      authorized: true,
    });
  });

  it('deep link: query fallback (v1) and the already-paired alert without a returnUrl', async () => {
    fulaMock.autoPinPair.mockResolvedValueOnce({
      status: 'already_paired',
      pairing_secret: 'S',
      hardware_id: 'H',
    });
    renderRoute(routes, `/autopin-pair?token=Q&endpoint=${enc('https://api.cloud.fx.land')}`);
    expect(document.querySelector('[data-autopin-source="query"]')).not.toBeNull();
    fireEvent.click(screen.getByTestId('autopin-enable'));
    await waitFor(() =>
      expect(fulaMock.autoPinPair).toHaveBeenCalledWith('Q', 'https://api.cloud.fx.land'),
    );
    const dialog = await screen.findByTestId('fx-confirm');
    expect(dialog).toHaveTextContent('Already Paired');
    expect(dialog).toHaveTextContent('Auto-pinning was already enabled on My Blox.');
    expect(dialog).not.toHaveTextContent('Return to FxFiles?');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByText(/Auto-pinning is enabled!/)).toBeInTheDocument();
    expect(screen.queryByTestId('autopin-open-fxfiles')).toBeNull();
    expect(linking.assign).not.toHaveBeenCalled();
  });

  it('deep link: invalid params are rejected before acting; a Blox error is shown', async () => {
    const { unmount } = renderRoute(
      routes,
      `/autopin-pair#token=abc&endpoint=${enc('http://insecure')}`,
    );
    expect(screen.getByTestId('autopin-param-error')).toHaveTextContent(
      'endpoint must be an https:// URL',
    );
    expect(screen.getByTestId('autopin-enable')).toBeDisabled();
    unmount();

    const bad = renderRoute(routes, '/autopin-pair');
    expect(screen.getByTestId('autopin-param-error')).toHaveTextContent(
      'Missing pairing parameters',
    );
    bad.unmount();

    const badTemplate = renderRoute(
      routes,
      `/autopin-pair#token=abc&endpoint=${enc('https://api.cloud.fx.land')}&returnUrl=${enc('https://files.fx.land/x#secret=$secret')}`,
    );
    expect(screen.getByTestId('autopin-param-error')).toHaveTextContent('$hardwareId');
    badTemplate.unmount();

    fulaMock.autoPinPair.mockRejectedValueOnce(new Error('Blox unreachable'));
    renderRoute(routes, `/autopin-pair#token=abc&endpoint=${enc('https://api.cloud.fx.land')}`);
    fireEvent.click(screen.getByTestId('autopin-enable'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Blox unreachable');
    expect(screen.queryByText(/Auto-pinning is enabled!/)).toBeNull();
    expect(useDAppsStore.getState().connectedDApps.p1 ?? []).toHaveLength(0);
  });

  it('manual mode: API key + endpoint → secret shown and copyable; a failure shows the error', async () => {
    renderRoute(routes, '/settings/autopin');
    expect(screen.getByText(/Scan a QR code or enter the API key/)).toBeInTheDocument();
    expect(screen.getByTestId('autopin-get-secret')).toBeDisabled();
    fireEvent.change(screen.getByTestId('autopin-token'), { target: { value: 'KEY' } });
    fireEvent.change(screen.getByTestId('autopin-endpoint'), {
      target: { value: 'https://api.cloud.fx.land' },
    });
    fireEvent.click(screen.getByTestId('autopin-get-secret'));
    await waitFor(() =>
      expect(fulaMock.autoPinPair).toHaveBeenCalledWith('KEY', 'https://api.cloud.fx.land'),
    );
    const secret = await screen.findByTestId('autopin-secret');
    expect(secret).toHaveTextContent('SECRET/1');
    fireEvent.click(secret);
    await waitFor(() => expect(clipboard.copyToClipboard).toHaveBeenCalledWith('SECRET/1'));
    expect(await screen.findByText('Copied!')).toBeInTheDocument();
  });

  it('manual mode failure + QR image upload fills the fields', async () => {
    fulaMock.autoPinPair.mockRejectedValueOnce(new Error('bad key'));
    renderRoute(routes, '/settings/autopin');
    fireEvent.change(screen.getByTestId('autopin-token'), { target: { value: 'K' } });
    fireEvent.change(screen.getByTestId('autopin-endpoint'), { target: { value: 'https://e' } });
    fireEvent.click(screen.getByTestId('autopin-get-secret'));
    expect(await screen.findByRole('alert')).toHaveTextContent('bad key');

    fireEvent.click(screen.getByTestId('autopin-scan-qr'));
    expect(await screen.findByTestId('qr-scanner-dialog')).toBeInTheDocument();
    expect(screen.getByText(/Camera is not available/)).toBeInTheDocument();

    qr.scanImageFile.mockResolvedValueOnce('nope');
    const file = new File(['x'], 'qr.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('qr-scanner-file'), { target: { files: [file] } });
    expect(await screen.findByText(/Invalid QR code format/)).toBeInTheDocument();

    qr.scanImageFile.mockResolvedValueOnce(
      JSON.stringify({ api: 'FROMQR', endpoint: 'https://qr.example' }),
    );
    fireEvent.change(screen.getByTestId('qr-scanner-file'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('autopin-token')).toHaveValue('FROMQR'));
    expect(screen.getByTestId('autopin-endpoint')).toHaveValue('https://qr.example');
    await waitFor(() => expect(screen.queryByTestId('qr-scanner-dialog')).toBeNull());
  });
});

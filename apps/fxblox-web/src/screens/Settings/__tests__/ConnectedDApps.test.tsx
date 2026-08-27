import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fulaMock = vi.hoisted(() => ({
  accountFund: vi.fn(async () => ({ from: 'a', to: 'b', amount: '1' })),
}));
vi.mock('@/lib/fula', () => ({
  fula: {},
  blockchain: { accountFund: fulaMock.accountFund },
  fxblox: {},
}));
const linking = vi.hoisted(() => ({ assign: vi.fn() }));
vi.mock('@/platform/linking', () => ({
  assign: linking.assign,
  openUrl: vi.fn(),
  canOpenUrl: (u: string) => {
    try {
      new URL(u);
      return true;
    } catch {
      return false;
    }
  },
}));

import ConnectedDApps, { buildReturnLink } from '@/screens/Settings/ConnectedDApps/ConnectedDApps';
import { useDAppsStore } from '@/stores';
import { renderRoute, resetSettingsStores, seedBlox } from './testUtils';

const routes = [
  { path: '/settings/dapps', element: <ConnectedDApps /> },
  {
    path: '/connectdapp/:appName/:bundleId/:peerId/:returnDeepLink/:accountId',
    element: <ConnectedDApps />,
  },
];
const RETURN = 'fxfiles://connect?blox=$bloxName&peer=$bloxPeerId';
const deepLink = `/connectdapp/FxFiles/land.fx.files/12D3KooWdapp/${encodeURIComponent(RETURN)}/acct1`;

describe('ConnectedDApps', () => {
  beforeEach(() => {
    resetSettingsStores();
    seedBlox({ name: 'My Blox' });
    vi.clearAllMocks();
    fulaMock.accountFund.mockResolvedValue({ from: 'a', to: 'b', amount: '1' });
  });

  it('deep link pre-fills the Add sheet; authorize funds the account, records the dApp and offers the return link', async () => {
    renderRoute(routes, deepLink);
    expect(await screen.findByTestId('add-dapp-name')).toHaveValue('FxFiles');
    expect(screen.getByTestId('add-dapp-bundle')).toHaveValue('land.fx.files');
    expect(screen.getByTestId('add-dapp-peer')).toHaveValue('12D3KooWdapp');
    expect(screen.getByTestId('add-dapp-account')).toHaveValue('acct1');
    const submit = screen.getByTestId('add-dapp-submit');
    expect(submit).toHaveTextContent('Add and Authorize');
    fireEvent.click(submit);

    await waitFor(() => expect(fulaMock.accountFund).toHaveBeenCalledWith('acct1'));
    await waitFor(() =>
      expect(useDAppsStore.getState().connectedDApps.p1?.[0]).toMatchObject({
        name: 'FxFiles',
        bundleId: 'land.fx.files',
        peerId: '12D3KooWdapp',
        bloxPeerId: 'p1',
        accountId: 'acct1',
        authorized: true,
      }),
    );
    const dialog = await screen.findByTestId('fx-confirm');
    expect(dialog).toHaveTextContent('Authorized!');
    expect(dialog).toHaveTextContent('Now you navigate to the FxFiles');
    fireEvent.click(screen.getByRole('button', { name: 'Ok' }));

    const open = await screen.findByTestId('dapp-open-return');
    expect(open).toHaveTextContent('Open FxFiles');
    fireEvent.click(open);
    expect(linking.assign).toHaveBeenCalledWith('fxfiles://connect?blox=My_Blox&peer=p1');
    expect(await screen.findByTestId('dapp-card-12D3KooWdapp')).toHaveTextContent('FxFiles');
  });

  it('authorization failure toasts the error and records nothing', async () => {
    fulaMock.accountFund.mockRejectedValueOnce(new Error('fund failed'));
    renderRoute(routes, deepLink);
    fireEvent.click(await screen.findByTestId('add-dapp-submit'));
    expect(await screen.findByText('fund failed')).toBeInTheDocument();
    expect(useDAppsStore.getState().connectedDApps.p1 ?? []).toHaveLength(0);
    expect(screen.queryByTestId('dapp-open-return')).toBeNull();
    expect(linking.assign).not.toHaveBeenCalled();
  });

  it('menu route: lists the current Blox dApps, opens the settings sheet ("Coming soon") and the clear sheet', async () => {
    useDAppsStore.setState({
      connectedDApps: {
        p1: [
          {
            name: 'File Sync',
            bundleId: 'land.fx.files',
            peerId: 'peerFS',
            bloxPeerId: 'p1',
            authorized: true,
            tag: 'Home Blox Setup',
            storageUsed: 2048,
            lastUpdate: new Date('2026-01-02T00:00:00Z'),
          },
        ],
      },
    });
    renderRoute(routes, '/settings/dapps');
    expect(screen.getByRole('heading', { name: 'Connected dApps' })).toBeInTheDocument();
    const card = screen.getByTestId('dapp-card-peerFS');
    expect(card).toHaveTextContent('File Sync');
    expect(card).toHaveTextContent('land.fx.files');
    expect(card).toHaveTextContent('2.05 GB');
    fireEvent.click(screen.getByTestId('dapp-card-settings'));

    expect(await screen.findByTestId('dapp-settings-open')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('dapp-settings-open'));
    expect(await screen.findByTestId('fx-confirm')).toHaveTextContent('Coming soon');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    fireEvent.click(screen.getByTestId('dapp-settings-clear'));
    expect(await screen.findByText(/remove all File Sync data/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('clear-dapp-cancel'));
    await waitFor(() => expect(screen.queryByTestId('clear-dapp-cancel')).toBeNull());
  });

  it('shows the empty state without dApps; buildReturnLink substitutes and validates', () => {
    renderRoute(routes, '/settings/dapps');
    expect(screen.getByTestId('dapps-empty')).toHaveTextContent('No connected dApps yet');
    expect(buildReturnLink(encodeURIComponent(RETURN), 'Living Room', 'peer1')).toBe(
      'fxfiles://connect?blox=Living_Room&peer=peer1',
    );
    expect(buildReturnLink('not a url', 'x', 'y')).toBeNull();
  });
});

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/platform/network', () => ({
  isOnline: vi.fn(),
  onOnlineChange: () => () => undefined,
}));
vi.mock('@/platform/lanHttp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/lanHttp')>();
  return { ...actual, lanFetch: vi.fn() };
});
vi.mock('@/utils/helper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/helper')>();
  return { ...actual, initFula: vi.fn() };
});
vi.mock('@/lib/fula', () => ({
  fula: {},
  blockchain: {},
  identity: {},
  fxblox: { getClusterInfo: vi.fn() },
}));

import { peekDeepLinkStash, stashDeepLink } from '@/app/deepLinkStash';
import { fxblox } from '@/lib/fula';
import { lanFetch } from '@/platform/lanHttp';
import { isOnline } from '@/platform/network';
import { useBloxsStore, useUserProfileStore } from '@/stores';
import * as Helper from '@/utils/helper';
import { _setTimingsForTests } from '../SetupComplete';
import {
  renderSetupAt,
  resetStores,
  TEST_APP_PEER_ID,
  TEST_BLOX_PEER_ID,
  TEST_CLUSTER_PEER_ID,
} from './renderSetup';

const isOnlineMock = isOnline as unknown as ReturnType<typeof vi.fn>;
const initFulaMock = Helper.initFula as unknown as ReturnType<typeof vi.fn>;
const clusterMock = fxblox.getClusterInfo as unknown as ReturnType<typeof vi.fn>;
const lanFetchMock = lanFetch as unknown as ReturnType<typeof vi.fn>;

function seedBlox(status?: 'CONNECTED' | 'DISCONNECTED') {
  useBloxsStore.setState({
    bloxs: { [TEST_BLOX_PEER_ID]: { peerId: TEST_BLOX_PEER_ID, name: 'Blox Unit #1' } },
    currentBloxPeerId: TEST_BLOX_PEER_ID,
    checkBloxConnection: vi.fn(async () => {
      if (status) {
        useBloxsStore.setState((s) => ({
          bloxsConnectionStatus: { ...s.bloxsConnectionStatus, [TEST_BLOX_PEER_ID]: status },
        }));
      }
      return status === 'CONNECTED';
    }),
  });
}

describe('SetupComplete', () => {
  let restore: () => void;
  beforeEach(() => {
    resetStores({ identity: true, appPeerId: TEST_APP_PEER_ID });
    isOnlineMock.mockReset();
    initFulaMock.mockReset();
    clusterMock.mockReset();
    lanFetchMock.mockReset();
    clusterMock.mockResolvedValue({
      cluster_peer_id: TEST_CLUSTER_PEER_ID,
      cluster_peer_name: 'c',
    });
    restore = _setTimingsForTests({
      internetGraceMs: 10,
      fulaInitDelayMs: 10,
      reachStartDelayMs: 5,
      reachRetryDelayMs: 5,
      internetRetryDelayMs: 5,
      hotspotPollMs: 40,
    });
  });
  afterEach(() => restore());

  it('online → initFula for the current Blox → connected → COMPLETED, cluster id stored, Home consumes the deep link', async () => {
    stashDeepLink('/connectdapp/FxFiles/b/p/r/0x1');
    isOnlineMock.mockResolvedValue(true);
    initFulaMock.mockResolvedValue(TEST_APP_PEER_ID);
    seedBlox('CONNECTED');
    const { router } = await renderSetupAt('/setup/complete');
    expect(await screen.findByText('Completing setup')).toBeInTheDocument();
    expect(await screen.findByTestId('setup-completed')).toHaveTextContent('Setup Complete');
    expect(initFulaMock).toHaveBeenCalledWith({
      password: 'test-password',
      signiture: '0xsignature',
      bloxPeerId: TEST_BLOX_PEER_ID,
    });
    const profile = useUserProfileStore.getState();
    expect(profile.fulaIsReady).toBe(true);
    expect(profile.fulaReadyForPeerId).toBe(TEST_BLOX_PEER_ID);
    await waitFor(() =>
      expect(useBloxsStore.getState().bloxs[TEST_BLOX_PEER_ID]?.clusterPeerId).toBe(
        TEST_CLUSTER_PEER_ID,
      ),
    );
    await userEvent.click(screen.getByTestId('setup-continue'));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/connectdapp/FxFiles/b/p/r/0x1'),
    );
    expect(peekDeepLinkStash()).toBeNull();
  });

  it('Home without a stashed deep link goes to /blox', async () => {
    isOnlineMock.mockResolvedValue(true);
    initFulaMock.mockResolvedValue(TEST_APP_PEER_ID);
    seedBlox('CONNECTED');
    const { router } = await renderSetupAt('/setup/complete');
    await userEvent.click(await screen.findByTestId('setup-continue'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/blox'));
  });

  it('initFula failure → ERROR state; "Back" checks the hotspot and toasts when it is gone', async () => {
    isOnlineMock.mockResolvedValue(true);
    initFulaMock.mockRejectedValue(new Error('no relay'));
    lanFetchMock.mockRejectedValue(new Error('unreachable'));
    seedBlox();
    await renderSetupAt('/setup/complete');
    expect(await screen.findByText(/If Blox is flashing 'Cyan'/)).toBeInTheDocument();
    expect(useUserProfileStore.getState().fulaIsReady).toBe(false);
    await userEvent.click(screen.getByTestId('error-back'));
    expect(
      await screen.findByText(/It seems you are no longer connected to Hotspot/),
    ).toBeInTheDocument();
  });

  it('offline → NOTCONNECTED copy, "Check internet connectivity" retries, hotspot poll reveals "wrong password"', async () => {
    isOnlineMock.mockResolvedValue(false);
    lanFetchMock.mockResolvedValue(new Response(''));
    seedBlox();
    const { router } = await renderSetupAt('/setup/complete');
    expect(await screen.findByText(/Is you blox LED 'green'/)).toBeInTheDocument();
    expect(initFulaMock).not.toHaveBeenCalled();
    await screen.findByTestId('wrong-password'); // HEAD /properties answered (10 s poll)
    const before = isOnlineMock.mock.calls.length;
    await userEvent.click(screen.getByTestId('check-internet'));
    await waitFor(() => expect(isOnlineMock.mock.calls.length).toBeGreaterThan(before));
    // The retry re-renders the NOTCOMPLETED actions (CHECKING in between) — re-query the button.
    await userEvent.click(await screen.findByTestId('wrong-password'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/connect-wifi'));
  });

  it('Blox unreachable after the retries → NOTCOMPLETED with "Reconnect Blox to Wi-Fi" → Connect to Blox', async () => {
    isOnlineMock.mockResolvedValue(true);
    initFulaMock.mockResolvedValue(TEST_APP_PEER_ID);
    seedBlox('DISCONNECTED');
    const { router } = await renderSetupAt('/setup/complete');
    expect(await screen.findByText(/Your Blox is not reachable/)).toBeInTheDocument();
    const check = useBloxsStore.getState().checkBloxConnection as unknown as ReturnType<
      typeof vi.fn
    >;
    expect(check.mock.calls.length).toBe(3); // first attempt + 2 retries
    await userEvent.click(screen.getByTestId('reconnect-blox'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/connect-blox'));
  });

  it('no current Blox (authorizer skipped) → updating copy + "Home Screen" restarts setup', async () => {
    isOnlineMock.mockResolvedValue(true);
    const { router } = await renderSetupAt('/setup/complete?manual=1');
    expect(await screen.findByText(/Your blox is updating/)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('home-screen'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/welcome'));
  });
});

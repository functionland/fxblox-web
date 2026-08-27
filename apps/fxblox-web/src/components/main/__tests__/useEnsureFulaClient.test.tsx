import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initFulaMock = vi.hoisted(() => vi.fn(async () => 'peer'));
vi.mock('@/utils/helper', () => ({ initFula: initFulaMock }));
// Pre-load the mocked module so the hook's dynamic import resolves within microtasks.
import '@/utils/helper';

import { FULA_READY_SETTLE_MS, _resetEnsureFulaForTests, isValidIp, useEnsureFulaClient } from '@/components/main/useEnsureFulaClient';
import { useBloxsStore, useUserProfileStore } from '@/stores';
import { resetStores, setPairedStores, TEST_BLOX_PEER_ID } from './testUtils';

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('useEnsureFulaClient', () => {
  beforeEach(() => {
    resetStores();
    _resetEnsureFulaForTests();
    initFulaMock.mockClear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('initialises the client for the selected blox once and marks readiness for that peer after the settle wait', async () => {
    setPairedStores({ fulaIsReady: false });
    useUserProfileStore.setState({ useLocalIp: '192.168.1.20' });
    const hook = renderHook(() => useEnsureFulaClient());
    await flush();
    expect(initFulaMock).toHaveBeenCalledTimes(1);
    expect(initFulaMock).toHaveBeenCalledWith({
      password: 'pass',
      signiture: '0xsig',
      bloxAddr: `/ip4/192.168.1.20/tcp/40001/p2p/${TEST_BLOX_PEER_ID}`,
      bloxPeerId: TEST_BLOX_PEER_ID,
    });
    expect(useUserProfileStore.getState().fulaIsReady).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FULA_READY_SETTLE_MS);
    });
    expect(useUserProfileStore.getState().fulaIsReady).toBe(true);
    expect(useUserProfileStore.getState().fulaReadyForPeerId).toBe(TEST_BLOX_PEER_ID);

    // A second mount (another screen) is a no-op once ready.
    hook.unmount();
    renderHook(() => useEnsureFulaClient());
    await flush();
    expect(initFulaMock).toHaveBeenCalledTimes(1);
  });

  it('skips when switchToBlox owns the init, and a late readiness for a switched-away blox is dropped', async () => {
    setPairedStores({ fulaIsReady: false });
    useBloxsStore.setState({ _initFulaSource: 'switch' });
    renderHook(() => useEnsureFulaClient());
    await flush();
    expect(initFulaMock).not.toHaveBeenCalled();
    expect(useBloxsStore.getState()._initFulaSource).toBeNull();

    _resetEnsureFulaForTests();
    renderHook(() => useEnsureFulaClient());
    await flush();
    expect(initFulaMock).toHaveBeenCalledTimes(1);
    // The user switches during the settle wait → the peer-aware setter drops the stale readiness.
    useBloxsStore.setState({ currentBloxPeerId: 'other-peer' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FULA_READY_SETTLE_MS);
    });
    expect(useUserProfileStore.getState().fulaReadyForPeerId).not.toBe(TEST_BLOX_PEER_ID);
  });

  it('isValidIp accepts dotted quads only', () => {
    expect(isValidIp('10.0.0.1')).toBe(true);
    expect(isValidIp('256.0.0.1')).toBe(false);
    expect(isValidIp('scan')).toBe(false);
  });
});

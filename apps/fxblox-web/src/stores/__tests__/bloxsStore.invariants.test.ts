/**
 * Multi-Blox invariants from E:\GitHub\fx\AUDIT_multi_device.md (M1–M4 / S2 / S3 / H2): the single shared client
 * is switched between bloxes; every per-blox write is peerId-keyed and generation-guarded.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/fula', () => ({
  fula: {
    isReady: vi.fn(async () => true),
    checkConnection: vi.fn(async () => true),
    logout: vi.fn(async () => true),
    shutdown: vi.fn(async () => undefined),
    newClient: vi.fn(async () => '12D3KooWApp'),
  },
  blockchain: { bloxFreeSpace: vi.fn(async () => ({ size: 100, avail: 50, used: 50, used_percentage: 50 })) },
  fxblox: {},
  identity: {},
  configure: vi.fn(),
}));
vi.mock('@/platform/network', () => ({ isOnline: vi.fn(async () => true), onOnlineChange: () => () => undefined, connectionInfo: () => ({ online: true }), onConnectionChange: () => () => undefined }));
vi.mock('@/utils/helper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/helper')>();
  return { ...actual, initFula: vi.fn(async () => '12D3KooWApp'), findBox: vi.fn(async () => ['/relay/p2p-circuit/p2p/x']) };
});

import { fula } from '@/lib/fula';
import * as Helper from '@/utils/helper';
import { useBloxsStore, resolveConnStatus } from '@/stores/useBloxsStore';
import { useUserProfileStore } from '@/stores/useUserProfileStore';
import { sleep, waitFor } from '@/test/helpers/waitFor';

const initFulaMock = Helper.initFula as unknown as ReturnType<typeof vi.fn>;
const checkConnectionMock = fula.checkConnection as unknown as ReturnType<typeof vi.fn>;

const A = '12D3KooWBloxA';
const B = '12D3KooWBloxB';
const C = '12D3KooWBloxC';

function seed(current = A) {
  useBloxsStore.setState({
    bloxs: { [A]: { peerId: A, name: 'A' }, [B]: { peerId: B, name: 'B' }, [C]: { peerId: C, name: 'C' } },
    currentBloxPeerId: current,
    bloxsConnectionStatus: {},
    bloxsSpaceInfo: {},
    bloxsPropertyInfo: {},
    folderSizeInfo: {},
    _isCheckingAllStatus: false,
    _initFulaSource: null,
  });
  useUserProfileStore.setState({ password: 'pw', signiture: 'sig', fulaIsReady: true, fulaReadyForPeerId: current, bloxConnectionStatus: 'CONNECTED', lastFulaReinitTime: 0 });
}

const status = (peer: string) => useBloxsStore.getState().bloxsConnectionStatus[peer];

beforeEach(() => {
  initFulaMock.mockReset().mockImplementation(async () => {
    await sleep(30);
    return '12D3KooWApp';
  });
  checkConnectionMock.mockReset().mockResolvedValue(true);
  seed();
});

describe('resolveConnStatus (audit S3 mirror)', () => {
  test('mirrors the lower-level classification; cancelled → null', () => {
    expect(resolveConnStatus(true, 'DISCONNECTED')).toBe('CONNECTED');
    expect(resolveConnStatus(false, 'DISCONNECTED')).toBe('DISCONNECTED');
    expect(resolveConnStatus(false, 'NO INTERNET')).toBe('NO INTERNET');
    expect(resolveConnStatus(false, 'NO CLIENT')).toBe('NO CLIENT');
    expect(resolveConnStatus(false, 'CHECKING')).toBeNull();
    expect(resolveConnStatus(false, undefined)).toBeNull();
  });
});

describe('switchToBlox generation guard', () => {
  test('A→B→A: the superseded switch marks B DISCONNECTED, A ends CONNECTED and ready-for A; initFula runs once', async () => {
    void useBloxsStore.getState().switchToBlox(B);
    expect(useBloxsStore.getState().currentBloxPeerId).toBe(B);
    expect(status(B)).toBe('SWITCHING');
    expect(useUserProfileStore.getState().fulaIsReady).toBe(false);
    await sleep(20); // still inside gen-1's 300 ms debounce
    void useBloxsStore.getState().switchToBlox(A);
    expect(useBloxsStore.getState().currentBloxPeerId).toBe(A);

    await waitFor(() => status(A) === 'CONNECTED', { timeoutMs: 3000, label: 'A connected' });
    expect(status(B)).toBe('DISCONNECTED');
    expect(initFulaMock).toHaveBeenCalledTimes(1);
    expect(initFulaMock.mock.calls[0]![0]).toEqual(expect.objectContaining({ bloxPeerId: A }));
    expect(useUserProfileStore.getState().fulaIsReady).toBe(true);
    expect(useUserProfileStore.getState().fulaReadyForPeerId).toBe(A);
    expect(useBloxsStore.getState().currentBloxPeerId).toBe(A);
  });

  test('B→C→B: the OLDEST switch to B must NOT write DISCONNECTED for B once a newer generation re-claimed B', async () => {
    void useBloxsStore.getState().switchToBlox(B); // gen 1
    await sleep(10);
    void useBloxsStore.getState().switchToBlox(C); // gen 2
    await sleep(10);
    void useBloxsStore.getState().switchToBlox(B); // gen 3 re-claims B
    await waitFor(() => status(B) === 'CONNECTED', { timeoutMs: 3000, label: 'B connected' });
    await sleep(50);
    expect(status(B)).toBe('CONNECTED');
    expect(status(C)).toBe('DISCONNECTED');
    expect(initFulaMock).toHaveBeenCalledTimes(1);
    expect(useUserProfileStore.getState().fulaReadyForPeerId).toBe(B);
  });

  test('a switch superseded AFTER initFula started (shouldCancel) does not mark the winner ready for the loser', async () => {
    let release: () => void = () => undefined;
    initFulaMock.mockImplementationOnce(async ({ shouldCancel }: { shouldCancel?: () => boolean }) => {
      await new Promise<void>((r) => (release = r));
      if (shouldCancel?.()) throw new Error('initFula cancelled — switch superseded');
      return 'x';
    });
    void useBloxsStore.getState().switchToBlox(B);
    await sleep(350); // past the debounce → initFula(B) in flight
    expect(initFulaMock).toHaveBeenCalledTimes(1);
    void useBloxsStore.getState().switchToBlox(A);
    release();
    await waitFor(() => status(A) === 'CONNECTED', { timeoutMs: 3000, label: 'A connected' });
    expect(status(B)).toBe('DISCONNECTED');
    expect(useUserProfileStore.getState().fulaReadyForPeerId).toBe(A);
  });

  test('switching to the current blox is a no-op', async () => {
    await useBloxsStore.getState().switchToBlox(A);
    expect(initFulaMock).not.toHaveBeenCalled();
    expect(status(A)).toBeUndefined();
  });

  test('missing credentials → DISCONNECTED without calling initFula', async () => {
    useUserProfileStore.setState({ password: undefined, signiture: undefined });
    void useBloxsStore.getState().switchToBlox(B);
    await waitFor(() => status(B) === 'DISCONNECTED', { timeoutMs: 2000 });
    expect(initFulaMock).not.toHaveBeenCalled();
  });

  test('post-switch probe mirrors NO CLIENT / NO INTERNET rather than a false red', async () => {
    const { isOnline } = await import('@/platform/network');
    (isOnline as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    void useBloxsStore.getState().switchToBlox(B);
    await waitFor(() => status(B) !== 'SWITCHING' && status(B) !== 'CHECKING', { timeoutMs: 3000 });
    expect(status(B)).toBe('NO INTERNET');
  });
});

describe('checkBloxConnection wrapper (audit M2 restore)', () => {
  test('superseded by a client re-init mid-check → prior status restored (no phantom CHECKING), result not attributed', async () => {
    useBloxsStore.setState({ bloxsConnectionStatus: { [A]: 'CONNECTED' } });
    let release: () => void = () => undefined;
    useUserProfileStore.setState({
      checkBloxConnection: async () => {
        await new Promise<void>((r) => (release = r));
        return false;
      },
    });
    const p = useBloxsStore.getState().checkBloxConnection(1, 1);
    await sleep(5);
    expect(status(A)).toBe('CHECKING');
    Helper.resetInitFula(); // a switch / re-init bumped the epoch
    release();
    await p;
    expect(status(A)).toBe('CONNECTED');
  });

  test('superseded with no prior status → key removed so the screen effect re-fires', async () => {
    let release: () => void = () => undefined;
    useUserProfileStore.setState({
      checkBloxConnection: async () => {
        await new Promise<void>((r) => (release = r));
        return true;
      },
    });
    const p = useBloxsStore.getState().checkBloxConnection(1, 1);
    await sleep(5);
    Helper.resetInitFula();
    release();
    await p;
    expect(status(A)).toBeUndefined();
    expect(A in useBloxsStore.getState().bloxsConnectionStatus).toBe(false);
  });

  test('not superseded → writes the mirrored result under the captured peer even if the selection later changes', async () => {
    useUserProfileStore.setState({ checkBloxConnection: async () => true, bloxConnectionStatus: 'CONNECTED' });
    await useBloxsStore.getState().checkBloxConnection(1, 1);
    expect(status(A)).toBe('CONNECTED');
    // lower-level DISCONNECTED → red; NO CLIENT → not red
    useUserProfileStore.setState({
      checkBloxConnection: async () => {
        useUserProfileStore.setState({ bloxConnectionStatus: 'NO CLIENT' });
        return false;
      },
    });
    await useBloxsStore.getState().checkBloxConnection(1, 1);
    expect(status(A)).toBe('NO CLIENT');
  });

  test('a superseded lower-level check (left CHECKING) does not overwrite: the newer check owns the write', async () => {
    useUserProfileStore.setState({
      checkBloxConnection: async () => {
        useUserProfileStore.setState({ bloxConnectionStatus: 'CHECKING' });
        return false;
      },
    });
    await useBloxsStore.getState().checkBloxConnection(1, 1);
    expect(status(A)).toBe('CHECKING');
  });

  test('no current blox → returns false and writes nothing', async () => {
    useBloxsStore.setState({ currentBloxPeerId: undefined });
    expect(await useBloxsStore.getState().checkBloxConnection()).toBe(false);
    expect(useBloxsStore.getState().bloxsConnectionStatus).toEqual({});
  });
});

describe('getBloxSpace / getFolderSize (audit M3)', () => {
  test('a result that lands after a switch is returned but NOT written under the captured key', async () => {
    const { blockchain } = await import('@/lib/fula');
    (blockchain.bloxFreeSpace as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      useBloxsStore.setState({ currentBloxPeerId: B }); // selection changed mid-call
      return { size: 7, avail: 1, used: 6, used_percentage: 85 };
    });
    const result = await useBloxsStore.getState().getBloxSpace();
    expect(result.size).toBe(7);
    expect(useBloxsStore.getState().bloxsSpaceInfo).toEqual({});
  });

  test('a stable selection + epoch writes under the captured key', async () => {
    await useBloxsStore.getState().getBloxSpace();
    expect(useBloxsStore.getState().bloxsSpaceInfo?.[A]?.size).toBe(100);
  });
});

describe('removeBlox (audit H2)', () => {
  test('removing the current blox repoints to the first remaining one and clears every per-blox map', () => {
    useBloxsStore.setState({
      bloxsConnectionStatus: { [A]: 'CONNECTED', [B]: 'DISCONNECTED' },
      bloxsSpaceInfo: { [A]: { device_count: 1, size: 1, avail: 1, used: 0, used_percentage: 0 } },
      folderSizeInfo: { [A]: { fula: '1', chain: '1', fulaCount: '1', userOwnData: '1' } },
      bloxsPropertyInfo: { [A]: { hardwareID: 'hw' } as never },
    });
    useBloxsStore.getState().removeBlox(A);
    const s = useBloxsStore.getState();
    expect(s.currentBloxPeerId).toBe(B);
    expect(s.bloxs).not.toHaveProperty(A);
    expect(s.bloxsConnectionStatus).toEqual({ [B]: 'DISCONNECTED' });
    expect(s.bloxsSpaceInfo).toEqual({});
    expect(s.folderSizeInfo).toEqual({});
    expect(s.bloxsPropertyInfo).toEqual({});
  });

  test('removing the last blox leaves currentBloxPeerId undefined', () => {
    useBloxsStore.setState({ bloxs: { [A]: { peerId: A, name: 'A' } }, currentBloxPeerId: A });
    useBloxsStore.getState().removeBlox(A);
    expect(useBloxsStore.getState().currentBloxPeerId).toBeUndefined();
  });
});

describe('checkAllBloxStatus (audit M1)', () => {
  test('re-entry guard: a second call while one is running returns immediately', async () => {
    useBloxsStore.setState({ _isCheckingAllStatus: true });
    const spy = vi.fn(async () => true);
    useUserProfileStore.setState({ checkBloxConnection: spy });
    await useBloxsStore.getState().checkAllBloxStatus();
    expect(spy).not.toHaveBeenCalled();
  });

  test('sweeps every blox under the sweep lock and returns to the original selection', async () => {
    useUserProfileStore.setState({ checkBloxConnection: async () => true, bloxConnectionStatus: 'CONNECTED' });
    await useBloxsStore.getState().checkAllBloxStatus();
    const s = useBloxsStore.getState();
    expect(s.currentBloxPeerId).toBe(A);
    expect(s._isCheckingAllStatus).toBe(false);
    expect([A, B, C].map(status)).toEqual(['CONNECTED', 'CONNECTED', 'CONNECTED']);
    // switch B, switch C, switch back A
    expect(initFulaMock).toHaveBeenCalledTimes(3);
  }, 15000);
});

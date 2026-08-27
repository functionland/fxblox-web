import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/fula', () => ({
  fula: {
    isReady: vi.fn(async () => true),
    checkConnection: vi.fn(async () => true),
    logout: vi.fn(async () => true),
    shutdown: vi.fn(async () => undefined),
    newClient: vi.fn(async () => 'app'),
  },
  blockchain: { createAccount: vi.fn(async (seed: string) => ({ seed, account: '5F...' })) },
  fxblox: {},
  identity: {},
  configure: vi.fn(),
}));
vi.mock('@/platform/network', () => ({ isOnline: vi.fn(async () => true), onOnlineChange: () => () => undefined, connectionInfo: () => ({ online: true }), onConnectionChange: () => () => undefined }));
vi.mock('@/wallet/appkit', () => ({ disconnectWallet: vi.fn(async () => undefined) }));

import { fula } from '@/lib/fula';
import { isOnline } from '@/platform/network';
import { disconnectWallet } from '@/wallet/appkit';
import * as secureStore from '@/platform/secureStore';
import { useUserProfileStore } from '@/stores/useUserProfileStore';
import { useBloxsStore } from '@/stores/useBloxsStore';

const checkConnectionMock = fula.checkConnection as unknown as ReturnType<typeof vi.fn>;
const isOnlineMock = isOnline as unknown as ReturnType<typeof vi.fn>;

beforeEach(async () => {
  await secureStore.wipe();
  useUserProfileStore.getState().reset();
  useBloxsStore.setState({ currentBloxPeerId: 'P1', bloxs: { P1: { peerId: 'P1', name: 'one' } }, bloxsConnectionStatus: {} });
  checkConnectionMock.mockReset().mockResolvedValue(true);
  isOnlineMock.mockReset().mockResolvedValue(true);
});

describe('credentials via the SecureStore', () => {
  test('setKeyChainValue stores each secret and loadAllCredentials restores them after a reset()', async () => {
    const s = useUserProfileStore.getState();
    await s.setKeyChainValue(secureStore.Service.DIDPassword, 'my pass');
    await s.setKeyChainValue(secureStore.Service.Signiture, '0xsig');
    await s.setKeyChainValue(secureStore.Service.Address, '0xaddr');
    await s.setKeyChainValue(secureStore.Service.FULAPeerId, '12D3KooWFula');
    await s.setKeyChainValue(secureStore.Service.FULARootCID, 'bafy');
    expect(useUserProfileStore.getState()).toEqual(expect.objectContaining({ password: 'my pass', signiture: '0xsig', address: '0xaddr', fulaPeerId: '12D3KooWFula', fulaRoodCID: 'bafy' }));

    useUserProfileStore.getState().reset();
    expect(useUserProfileStore.getState().password).toBeUndefined();
    await useUserProfileStore.getState().loadAllCredentials();
    expect(useUserProfileStore.getState()).toEqual(expect.objectContaining({ password: 'my pass', signiture: '0xsig', address: '0xaddr', fulaPeerId: '12D3KooWFula', fulaRoodCID: 'bafy' }));
  });

  test('setWalletId(…, clearSigniture) wipes password/signature/address slots', async () => {
    const s = useUserProfileStore.getState();
    await s.setKeyChainValue(secureStore.Service.DIDPassword, 'p');
    await s.setKeyChainValue(secureStore.Service.Signiture, 's');
    await s.setWalletId('wallet-x', true);
    expect(useUserProfileStore.getState().walletId).toBe('wallet-x');
    expect(await secureStore.load(secureStore.Service.DIDPassword)).toBe(false);
    expect(await secureStore.load(secureStore.Service.Signiture)).toBe(false);
  });

  test('logout wipes the secure store, disconnects the wallet and resets the stores', async () => {
    const s = useUserProfileStore.getState();
    await s.setKeyChainValue(secureStore.Service.DIDPassword, 'p');
    useUserProfileStore.setState({ appPeerId: '12D3KooWApp', walletId: 'w' });
    expect(await useUserProfileStore.getState().logout()).toBe(true);
    expect(await secureStore.load(secureStore.Service.DIDPassword)).toBe(false);
    expect(disconnectWallet).toHaveBeenCalled();
    expect(useUserProfileStore.getState().appPeerId).toBeUndefined();
    expect(useUserProfileStore.getState().walletId).toBeUndefined();
    expect(useBloxsStore.getState().bloxs).toEqual({});
  });
});

describe('setFulaIsReady (audit M4/S2)', () => {
  test('marks ready FOR the current blox and drops stale late readiness for a superseded blox', () => {
    const s = useUserProfileStore.getState();
    s.setFulaIsReady(true, 'P1');
    expect(useUserProfileStore.getState()).toEqual(expect.objectContaining({ fulaIsReady: true, fulaReadyForPeerId: 'P1' }));
    s.setFulaIsReady(false);
    expect(useUserProfileStore.getState()).toEqual(expect.objectContaining({ fulaIsReady: false, fulaReadyForPeerId: undefined }));
    s.setFulaIsReady(true, 'P-old');
    expect(useUserProfileStore.getState().fulaIsReady).toBe(false);
  });
});

describe('checkBloxConnection (lower level)', () => {
  test('offline → NO INTERNET', async () => {
    isOnlineMock.mockResolvedValueOnce(false);
    expect(await useUserProfileStore.getState().checkBloxConnection(1, 0)).toBe(false);
    expect(useUserProfileStore.getState().bloxConnectionStatus).toBe('NO INTERNET');
  });

  test('client not ready → NO CLIENT', async () => {
    useUserProfileStore.setState({ fulaIsReady: false });
    expect(await useUserProfileStore.getState().checkBloxConnection(1, 0)).toBe(false);
    expect(useUserProfileStore.getState().bloxConnectionStatus).toBe('NO CLIENT');
  });

  test('connected → CONNECTED', async () => {
    useUserProfileStore.setState({ fulaIsReady: true });
    expect(await useUserProfileStore.getState().checkBloxConnection(1, 0)).toBe(true);
    expect(useUserProfileStore.getState().bloxConnectionStatus).toBe('CONNECTED');
  });

  test('retries exhausted → DISCONNECTED and the reinit cooldown is recorded', async () => {
    useUserProfileStore.setState({ fulaIsReady: true, useLocalIp: 'scan' });
    checkConnectionMock.mockResolvedValue(false);
    expect(await useUserProfileStore.getState().checkBloxConnection(2, 0)).toBe(false);
    expect(checkConnectionMock).toHaveBeenCalledTimes(2);
    expect(useUserProfileStore.getState().bloxConnectionStatus).toBe('DISCONNECTED');
    expect(useUserProfileStore.getState().lastFulaReinitTime).toBeGreaterThan(0);
    expect(useUserProfileStore.getState().fulaReinitCount).toBe(1);
  });

  test('a newer check cancels the older one (generation guard) — the older leaves CHECKING for the newer to own', async () => {
    useUserProfileStore.setState({ fulaIsReady: true });
    let release: (v: boolean) => void = () => undefined;
    checkConnectionMock.mockImplementationOnce(() => new Promise<boolean>((r) => (release = r)));
    const older = useUserProfileStore.getState().checkBloxConnection(1, 0);
    const newer = useUserProfileStore.getState().checkBloxConnection(1, 0);
    await new Promise((r) => setTimeout(r, 10)); // both past the online probe; the older is parked in checkConnection
    release(true);
    expect(await older).toBe(false);
    expect(await newer).toBe(true);
    expect(useUserProfileStore.getState().bloxConnectionStatus).toBe('CONNECTED');
  });
});

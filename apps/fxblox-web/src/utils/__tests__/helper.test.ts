/**
 * Ported from apps/box/src/utils/__tests__/helper.test.ts — initFula retry loop (verbatim behaviour) with the
 * fula client + discovery mocked; plus the identity-string normalisation and the sweep lock.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/fula', () => ({
  fula: {
    newClient: vi.fn(),
    logout: vi.fn().mockResolvedValue(true),
    shutdown: vi.fn().mockResolvedValue(undefined),
    isReady: vi.fn().mockResolvedValue(true),
    checkConnection: vi.fn().mockResolvedValue(true),
  },
  blockchain: {},
  fxblox: {},
  identity: {},
  configure: vi.fn(),
}));

vi.mock('@/services/discoveryClient', () => ({
  findBox: vi.fn(),
  refreshRelayCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@functionland/fula-sec-web', () => ({
  HDKEY: class {
    chainCode = 'cc';
    createEDKeyPair() {
      return { secretKey: new Uint8Array(64).fill(7), publicKey: new Uint8Array(32).fill(8) };
    }
  },
  DID: class {
    did() {
      return 'did:fake';
    }
  },
}));

import { fula } from '@/lib/fula';
import { findBox as discoveryFindBox } from '@/services/discoveryClient';
import { initFula, resetInitFula, getInitFulaGen, withFulaSweepLock, identityStringFromSecretKey, getMyDIDKeyPair, getMyDID } from '../helper';

const newClientMock = fula.newClient as unknown as ReturnType<typeof vi.fn>;
const logoutMock = fula.logout as unknown as ReturnType<typeof vi.fn>;
const shutdownMock = fula.shutdown as unknown as ReturnType<typeof vi.fn>;
const findBoxMock = discoveryFindBox as unknown as ReturnType<typeof vi.fn>;

const IDENTITY_64 = new Array(64).fill('7').join(',');

beforeEach(() => {
  newClientMock.mockReset();
  logoutMock.mockReset().mockResolvedValue(true);
  shutdownMock.mockReset().mockResolvedValue(undefined);
  findBoxMock.mockReset().mockResolvedValue(['/dns/relay/.../p2p-circuit/p2p/BOX']);
  resetInitFula();
});

describe('identity normalisation', () => {
  it('identityStringFromSecretKey is the comma-joined 64 bytes (what go-fula hashes)', () => {
    const s = identityStringFromSecretKey(new Uint8Array(64).fill(7));
    expect(s).toMatch(/^\d+(,\d+){63}$/);
    expect(s).toBe(IDENTITY_64);
  });

  it('normalises Buffer-like subclasses via Uint8Array.from', () => {
    const buf = Buffer.alloc(64, 9);
    expect(identityStringFromSecretKey(buf)).toBe(new Array(64).fill('9').join(','));
  });

  it('getMyDIDKeyPair returns plain Uint8Arrays; getMyDID returns the DID', () => {
    const kp = getMyDIDKeyPair('pw', 'sig');
    expect(Object.getPrototypeOf(kp.secretKey)).toBe(Uint8Array.prototype);
    expect(kp.secretKey.length).toBe(64);
    expect(getMyDID('pw', 'sig')).toBe('did:fake');
  });
});

describe('initFula()', () => {
  const PASSWORD = 'pw';
  const SIG = 'sig';
  const PID = '12D3KooWInitFulaBlox';

  it('first candidate succeeds → resolves with peerId, no retry; identity string is the CSV secret', async () => {
    newClientMock.mockResolvedValueOnce('returned-peer-id');
    const result = await initFula({ password: PASSWORD, signiture: SIG, bloxPeerId: PID });
    expect(result).toBe('returned-peer-id');
    expect(newClientMock).toHaveBeenCalledTimes(1);
    expect(newClientMock).toHaveBeenCalledWith(IDENTITY_64, '', '/dns/relay/.../p2p-circuit/p2p/BOX', '', true, true, true);
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(logoutMock).toHaveBeenCalledWith(IDENTITY_64, '');
    expect(shutdownMock).toHaveBeenCalledTimes(1);
  });

  it('explicit bloxAddr path uses that one address only (no findBox)', async () => {
    newClientMock.mockResolvedValueOnce('peer-via-addr');
    const result = await initFula({ password: PASSWORD, signiture: SIG, bloxAddr: '/dns/custom-relay/.../p2p-circuit/p2p/THING' });
    expect(result).toBe('peer-via-addr');
    expect(findBoxMock).not.toHaveBeenCalled();
    expect(newClientMock).toHaveBeenCalledWith(expect.any(String), '', '/dns/custom-relay/.../p2p-circuit/p2p/THING', '', true, true, true);
  });

  it('no target → empty address + "noop" exchange', async () => {
    newClientMock.mockResolvedValueOnce('peer-noop');
    await initFula({ password: PASSWORD, signiture: SIG });
    expect(newClientMock).toHaveBeenCalledWith(expect.any(String), '', '', 'noop', true, true, true);
  });

  it('first candidate fails, second succeeds — observes cleanup between', async () => {
    findBoxMock.mockResolvedValueOnce(['/dns/a/tcp/4001/p2p/PA/p2p-circuit/p2p/X', '/dns/b/tcp/4001/p2p/PB/p2p-circuit/p2p/X']);
    newClientMock.mockRejectedValueOnce(new Error('first candidate down')).mockResolvedValueOnce('second-candidate-peer');
    const result = await initFula({ password: PASSWORD, signiture: SIG, bloxPeerId: PID });
    expect(result).toBe('second-candidate-peer');
    expect(newClientMock).toHaveBeenCalledTimes(2);
    expect(logoutMock).toHaveBeenCalledTimes(2);
    expect(shutdownMock).toHaveBeenCalledTimes(2);
  });

  it('all candidates fail → rejects with last error', async () => {
    findBoxMock.mockResolvedValueOnce(['/a', '/b']);
    newClientMock.mockRejectedValueOnce(new Error('first fail')).mockRejectedValueOnce(new Error('second fail (last)'));
    await expect(initFula({ password: PASSWORD, signiture: SIG, bloxPeerId: PID })).rejects.toThrow(/second fail/);
  });

  it('cancellation via shouldCancel aborts mid-loop', async () => {
    findBoxMock.mockResolvedValueOnce(['/a', '/b']);
    let calls = 0;
    newClientMock.mockImplementation(async () => {
      calls++;
      throw new Error(`fail #${calls}`);
    });
    const shouldCancel = () => calls >= 1;
    await expect(initFula({ password: PASSWORD, signiture: SIG, bloxPeerId: PID, shouldCancel })).rejects.toThrow(/cancelled/);
    expect(newClientMock).toHaveBeenCalledTimes(1);
  });

  it('rejects when password is missing', async () => {
    await expect(initFula({ password: '', signiture: SIG, bloxPeerId: PID })).rejects.toThrow(/Password and signature are required/);
  });

  it('a second call while one is in flight joins the in-flight init (promise guard — audit L1)', async () => {
    let release: (v: string) => void = () => undefined;
    newClientMock.mockImplementationOnce(() => new Promise<string>((r) => (release = r)));
    const p1 = initFula({ password: PASSWORD, signiture: SIG, bloxPeerId: PID });
    const p2 = initFula({ password: PASSWORD, signiture: SIG, bloxPeerId: 'OTHER' });
    await new Promise((r) => setTimeout(r, 5));
    release('peer');
    await expect(p1).resolves.toBe('peer');
    await expect(p2).resolves.toBe('peer');
    expect(newClientMock).toHaveBeenCalledTimes(1);
    expect(findBoxMock).toHaveBeenCalledTimes(1); // the second caller never resolved its own target
  });

  it('getInitFulaGen bumps on resetInitFula AND on every initFula start', async () => {
    const g0 = getInitFulaGen();
    resetInitFula();
    expect(getInitFulaGen()).toBe(g0 + 1);
    newClientMock.mockResolvedValueOnce('p');
    await initFula({ password: PASSWORD, signiture: SIG, bloxPeerId: PID });
    expect(getInitFulaGen()).toBe(g0 + 2);
  });
});

describe('withFulaSweepLock', () => {
  it('serialises callers and always releases', async () => {
    const order: string[] = [];
    let releaseA: () => void = () => undefined;
    const a = withFulaSweepLock(async () => {
      order.push('a-start');
      await new Promise<void>((r) => (releaseA = r));
      order.push('a-end');
      return 'A';
    });
    const b = withFulaSweepLock(async () => {
      order.push('b-start');
      return 'B';
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(order).toEqual(['a-start']);
    releaseA();
    expect(await a).toBe('A');
    expect(await b).toBe('B');
    expect(order).toEqual(['a-start', 'a-end', 'b-start']);
  });

  it('releases the lock when fn throws', async () => {
    await expect(withFulaSweepLock(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(withFulaSweepLock(async () => 'after')).resolves.toBe('after');
  });
});

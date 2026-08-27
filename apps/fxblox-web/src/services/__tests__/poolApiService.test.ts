/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { PoolApiService } from '../poolApiService';

afterEach(() => {
  vi.unstubAllGlobals();
});

const request = { peerId: '12D3KooWCluster', kuboPeerId: '12D3KooWKubo', account: '0xabc', chain: 'skale' as const, poolId: 1 };

describe('PoolApiService.joinPool', () => {
  test('POSTs JSON to /join and returns the parsed body', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'ok', msg: 'joined', transactionHash: '0x1' }) }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await PoolApiService.joinPool(request);
    expect(r).toEqual({ status: 'ok', msg: 'joined', transactionHash: '0x1' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://pools.fx.land/join');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(request);
  });

  test('429 → friendly rate-limit message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })));
    expect((await PoolApiService.joinPool(request)).msg).toMatch(/Too many requests/);
  });

  test('4xx with field errors → joined message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ status: 'err', msg: 'bad', errors: [{ field: 'poolId', message: 'required' }] }) })));
    expect((await PoolApiService.joinPool(request)).msg).toBe('poolId: required');
  });

  test('timeout (AbortError) → "timed out" message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    expect((await PoolApiService.joinPool(request)).msg).toMatch(/timed out/);
  });

  test('health reflects reachability', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));
    expect(await PoolApiService.health()).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    expect(await PoolApiService.health()).toBe(false);
  });

  test('no /leave or /cancel routes are exposed (contract path only)', () => {
    expect((PoolApiService as any).leavePool).toBeUndefined();
    expect((PoolApiService as any).cancelJoinRequest).toBeUndefined();
  });
});

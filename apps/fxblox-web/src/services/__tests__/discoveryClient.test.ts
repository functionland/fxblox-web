/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * discoveryClient — the 3-tier findBox (ported from the mobile helper tests) + the web CORS fallback.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findBox, refreshRelayCache, listRelays, probeDiscovery, readRelayCache, _configureForTests } from '../discoveryClient';
import { FXRelay, FXRelayCacheKey } from '@/utils/constants';
import { createMemoryKvStore } from '@/platform/kvStore';

const BASE = 'https://disc.test';
let mem = createMemoryKvStore();
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mem = createMemoryKvStore();
  _configureForTests({ store: mem, baseUrl: BASE });
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });

describe('findBox()', () => {
  const BOX_PID = '12D3KooWBox';

  it('tier 1: returns multiaddrs from Workers /find-box (POST with x-fula-client)', async () => {
    fetchMock.mockResolvedValueOnce(json([{ multiaddr: '/dns/r1/.../p2p-circuit/p2p/BOX' }]));
    expect(await findBox(BOX_PID)).toEqual(['/dns/r1/.../p2p-circuit/p2p/BOX']);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/find-box`);
    expect((init as any).method).toBe('POST');
    expect((init as any).headers['x-fula-client']).toBe('app');
    expect(JSON.parse((init as any).body)).toEqual({ peerId: BOX_PID });
  });

  it('tier 1: empty array from Workers falls through to tier 2', async () => {
    fetchMock.mockResolvedValueOnce(json([]));
    await mem.setItem(FXRelayCacheKey, JSON.stringify({ list: [{ dnsName: 'r2', peerId: 'PR2', addr: '/dns/r2/tcp/4001', multiaddr: '/dns/r2/tcp/4001/p2p/PR2' }], ts: Date.now() }));
    expect(await findBox(BOX_PID)).toEqual([`/dns/r2/tcp/4001/p2p/PR2/p2p-circuit/p2p/${BOX_PID}`]);
  });

  it('tier 2: Workers errors + cache hit → constructed addresses', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await mem.setItem(
      FXRelayCacheKey,
      JSON.stringify({
        list: [
          { dnsName: 'a', peerId: 'PA', addr: '/dns/a/tcp/4001', multiaddr: '/dns/a/tcp/4001/p2p/PA' },
          { dnsName: 'b', peerId: 'PB', addr: '/dns/b/tcp/4001', multiaddr: '/dns/b/tcp/4001/p2p/PB' },
        ],
        ts: Date.now(),
      }),
    );
    expect(await findBox(BOX_PID)).toEqual([`/dns/a/tcp/4001/p2p/PA/p2p-circuit/p2p/${BOX_PID}`, `/dns/b/tcp/4001/p2p/PB/p2p-circuit/p2p/${BOX_PID}`]);
  });

  it('tier 2: cache older than max age → falls through to tier 3', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    await mem.setItem(FXRelayCacheKey, JSON.stringify({ list: [{ dnsName: 'old', peerId: 'OLD', addr: '/dns/old/tcp/4001', multiaddr: 'x' }], ts: Date.now() - 8 * 24 * 60 * 60 * 1000 }));
    expect(await findBox(BOX_PID)).toEqual([`${FXRelay}/p2p/${BOX_PID}`]);
  });

  it('tier 3: Workers down + cache miss → hardcoded fallback', async () => {
    fetchMock.mockRejectedValue(new Error('down'));
    expect(await findBox(BOX_PID)).toEqual([`${FXRelay}/p2p/${BOX_PID}`]);
  });

  it('tier 3: Workers returns non-ok status + cache miss → hardcoded', async () => {
    fetchMock.mockResolvedValueOnce(json({}, false, 500));
    expect(await findBox(BOX_PID)).toEqual([`${FXRelay}/p2p/${BOX_PID}`]);
  });

  it('CORS preflight failure (TypeError) → retried ONCE without the x-fula-client header', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(json([{ multiaddr: '/via/retry' }]));
    expect(await findBox(BOX_PID)).toEqual(['/via/retry']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0]![1] as any).headers['x-fula-client']).toBe('app');
    expect((fetchMock.mock.calls[1]![1] as any).headers['x-fula-client']).toBeUndefined();
  });
});

describe('refreshRelayCache() / readRelayCache()', () => {
  it('writes the fetched relay list with a timestamp', async () => {
    const list = [{ dnsName: 'r', peerId: 'P', addr: '/dns/r/tcp/4001', multiaddr: '/dns/r/tcp/4001/p2p/P' }];
    fetchMock.mockResolvedValueOnce(json(list));
    await refreshRelayCache();
    const wrote = JSON.parse(mem.dump()[FXRelayCacheKey]!);
    expect(wrote.list).toEqual(list);
    expect(typeof wrote.ts).toBe('number');
    expect((await readRelayCache())?.list).toEqual(list);
  });

  it('does not throw on network failure and skips empty lists', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    await expect(refreshRelayCache()).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce(json([]));
    await refreshRelayCache();
    expect(mem.dump()[FXRelayCacheKey]).toBeUndefined();
  });
});

describe('listRelays() / probeDiscovery()', () => {
  it('live → source live (+ cache refreshed); failure → cache; nothing → none', async () => {
    const list = [{ dnsName: 'r', peerId: 'P', addr: '/dns/r/tcp/4001', multiaddr: 'm', addrs: ['/dns/r/udp/4001/quic-v1/webtransport/certhash/uEi'] }];
    fetchMock.mockResolvedValueOnce(json(list));
    expect(await listRelays()).toEqual(expect.objectContaining({ source: 'live', relays: list }));
    fetchMock.mockRejectedValue(new Error('down'));
    expect((await listRelays()).source).toBe('cache');
    await mem.clear();
    expect(await listRelays()).toEqual({ relays: [], source: 'none' });
  });

  it('probeDiscovery reflects reachability', async () => {
    fetchMock.mockResolvedValueOnce(json([]));
    expect(await probeDiscovery()).toBe(true);
    fetchMock.mockRejectedValue(new Error('down'));
    expect(await probeDiscovery()).toBe(false);
  });
});

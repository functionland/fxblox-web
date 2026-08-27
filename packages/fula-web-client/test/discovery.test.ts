import { afterEach, describe, expect, it } from 'vitest';
import { multiaddr } from '@multiformats/multiaddr';
import {
  HARDCODED_RELAYS,
  MemoryKeyValueStore,
  RELAY_CACHE_KEY,
  RELAY_DEV_FX_LAND,
  circuitParts,
  configureDiscovery,
  lastPeerId,
  listRelays,
  parseFindBoxResponse,
  parseRelaysResponse,
  relayWebTransportAddrs,
  resetDiscovery,
  resolveCandidates,
  rewriteCircuitForBrowser,
} from '../src/core/discovery.js';

const BOX = '12D3KooWPnaMDrD7QLZKiT2iktjm9Kucx7XEPrSCUS6TTBbYuiRj';
const RELAY = RELAY_DEV_FX_LAND.peerId;
const WT = '/dns/relay.dev.fx.land/udp/4001/quic-v1/webtransport/certhash/uEiCLmoPz5PDjRKDCu7vxowpW_s71izflO2HLncZlhYFQuQ/certhash/uEiAk6HQNr9aK22Ih_p6_Yo_6LQgkLqjf7WwZ7dkmCTD7UA';
const TCP_CIRCUIT = `/dns/relay.dev.fx.land/tcp/4001/p2p/${RELAY}/p2p-circuit/p2p/${BOX}`;
const WT_CIRCUIT = `${WT}/p2p/${RELAY}/p2p-circuit/p2p/${BOX}`;

type Route = (url: string, init: RequestInit) => unknown;

function fakeFetch(routes: Record<string, Route>): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (key === undefined) throw new TypeError(`fetch failed: ${url}`);
    const body = routes[key]?.(url, init ?? {});
    if (body instanceof Error) throw body;
    if (typeof body === 'number') return new Response('', { status: body });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

afterEach(() => resetDiscovery());

describe('multiaddr helpers', () => {
  it('extracts the last peer id and the circuit parts', () => {
    expect(lastPeerId(multiaddr(TCP_CIRCUIT))).toBe(BOX);
    expect(lastPeerId(multiaddr('/ip4/127.0.0.1/tcp/4001'))).toBeUndefined();
    const parts = circuitParts(multiaddr(TCP_CIRCUIT));
    expect(parts?.relayPeerId).toBe(RELAY);
    expect(parts?.boxPeerId).toBe(BOX);
    expect(parts?.relayTransport.toString()).toBe('/dns/relay.dev.fx.land/tcp/4001');
  });

  it('rewrites a TCP relay circuit to WebTransport circuits and keeps WT circuits as-is', () => {
    expect(rewriteCircuitForBrowser(multiaddr(TCP_CIRCUIT), [WT]).map(String)).toEqual([WT_CIRCUIT]);
    expect(rewriteCircuitForBrowser(multiaddr(TCP_CIRCUIT), [`${WT}/p2p/${RELAY}`]).map(String)).toEqual([WT_CIRCUIT]);
    expect(rewriteCircuitForBrowser(multiaddr(WT_CIRCUIT), []).map(String)).toEqual([WT_CIRCUIT]);
    expect(rewriteCircuitForBrowser(multiaddr(TCP_CIRCUIT), [])).toEqual([]);
  });

  it('parses the discovery worker responses defensively', () => {
    expect(parseRelaysResponse([{ peerId: RELAY, multiaddr: RELAY_DEV_FX_LAND.multiaddr, addrs: [WT] }])).toEqual([
      { peerId: RELAY, multiaddr: RELAY_DEV_FX_LAND.multiaddr, addrs: [WT] },
    ]);
    expect(parseRelaysResponse({ relays: [{ peer_id: RELAY, addr: RELAY_DEV_FX_LAND.multiaddr }] })[0]?.peerId).toBe(RELAY);
    expect(parseRelaysResponse([RELAY_DEV_FX_LAND.multiaddr])[0]?.peerId).toBe(RELAY);
    expect(parseRelaysResponse(null)).toEqual([]);
    expect(parseFindBoxResponse([{ multiaddr: TCP_CIRCUIT }, WT_CIRCUIT])).toEqual([TCP_CIRCUIT, WT_CIRCUIT]);
    expect(parseFindBoxResponse({ results: [{ multiaddr: TCP_CIRCUIT }] })).toEqual([TCP_CIRCUIT]);
    expect(parseFindBoxResponse('nope')).toEqual([]);
  });
});

describe('sources', () => {
  it('/relays result is cached in the KV and merged with the hardcoded relays; failures fall back', async () => {
    const kv = new MemoryKeyValueStore();
    let calls = 0;
    configureDiscovery({
      kv,
      fetch: fakeFetch({
        'https://discovery.fula.network/relays': (_u, init) => {
          calls++;
          expect((init.headers as Record<string, string>)['x-fula-client']).toBe('app');
          return [{ peerId: '12D3KooWNewRelayAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', multiaddr: '/dns/new.relay/tcp/4001/p2p/12D3KooWNewRelayAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }];
        },
      }),
    });
    const relays = await listRelays();
    expect(relays.map((r) => r.peerId)).toEqual(['12D3KooWNewRelayAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', ...HARDCODED_RELAYS.map((r) => r.peerId)]);
    expect(await kv.get(RELAY_CACHE_KEY)).toContain('new.relay');
    await listRelays();
    expect(calls).toBe(1); // cached

    // network gone: cached value is still used
    configureDiscovery({ kv, fetch: fakeFetch({}) });
    expect((await listRelays({ refresh: true })).map((r) => r.peerId)[0]).toBe('12D3KooWNewRelayAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');

    // WAF 403 and empty cache: hardcoded only
    configureDiscovery({ kv: new MemoryKeyValueStore(), fetch: fakeFetch({ 'https://discovery.fula.network/relays': () => 403 }) });
    expect((await listRelays()).map((r) => r.peerId)).toEqual(HARDCODED_RELAYS.map((r) => r.peerId));
  });

  it('relay WebTransport addrs: /relays.addrs → delegated routing → build-time → stale cache', async () => {
    const kv = new MemoryKeyValueStore();
    configureDiscovery({
      kv,
      fetch: fakeFetch({
        'https://delegated-ipfs.dev/routing/v1/peers/': (url) => ({
          Peers: [{ ID: url.split('/').pop(), Addrs: ['/ip4/40.233.107.227/udp/4001/quic-v1', `${WT}/p2p/${RELAY}`, '/ip4/10.0.0.5/udp/4001/quic-v1/webtransport/certhash/uEiAA'] }],
        }),
      }),
    });
    // (a) advertised
    expect(await relayWebTransportAddrs({ ...RELAY_DEV_FX_LAND, addrs: [RELAY_DEV_FX_LAND.multiaddr, WT] })).toEqual([WT]);
    // (b) delegated routing (dns first, private last, /p2p suffix stripped)
    const viaRouting = await relayWebTransportAddrs(RELAY, { refresh: true });
    expect(viaRouting).toEqual([WT, '/ip4/10.0.0.5/udp/4001/quic-v1/webtransport/certhash/uEiAA']);
    // (c) build-time when everything else fails
    configureDiscovery({ kv: new MemoryKeyValueStore(), fetch: fakeFetch({}), relayWebTransportAddrs: { [RELAY]: [WT] } });
    expect(await relayWebTransportAddrs(RELAY)).toEqual([WT]);
    // stale cache beats nothing
    configureDiscovery({ kv, fetch: fakeFetch({}), relayWebTransportAddrs: {}, certhashTtlMs: 0 });
    expect(await relayWebTransportAddrs(RELAY)).toEqual(viaRouting);
    // nothing at all
    configureDiscovery({ kv: new MemoryKeyValueStore(), fetch: fakeFetch({}), relayWebTransportAddrs: {} });
    expect(await relayWebTransportAddrs(RELAY)).toEqual([]);
  });
});

describe('resolveCandidates', () => {
  it('orders bloxAddr → find-box → relays, rewrites TCP circuits and defers TCP forms to the end', async () => {
    configureDiscovery({
      kv: new MemoryKeyValueStore(),
      relays: [RELAY_DEV_FX_LAND],
      fetch: fakeFetch({
        'https://discovery.fula.network/find-box': (_u, init) => {
          expect(JSON.parse(String(init.body))).toEqual({ peerId: BOX });
          return [{ multiaddr: TCP_CIRCUIT }, { multiaddr: `/ip4/1.2.3.4/tcp/4001/p2p/${BOX}` }];
        },
        'https://discovery.fula.network/relays': () => 403,
        'https://delegated-ipfs.dev/routing/v1/peers/': () => ({ Peers: [{ ID: RELAY, Addrs: [WT] }] }),
      }),
    });
    const { candidates, certhashMissing } = await resolveCandidates(BOX, { bloxAddr: TCP_CIRCUIT });
    expect(certhashMissing).toBe(false);
    expect(candidates.map((c) => `${c.source} ${c.ma.toString()}`)).toEqual([
      `blox-addr ${WT_CIRCUIT}`,
      `find-box /ip4/1.2.3.4/tcp/4001/p2p/${BOX}`,
      `blox-addr ${TCP_CIRCUIT}`,
    ]);
    expect(candidates[0]?.relayed).toBe(true);
    expect(candidates[0]?.relayPeerId).toBe(RELAY);
    expect(candidates[1]?.relayed).toBe(false);
  });

  it('keeps find-box entries that already carry a certhash and ignores addresses for other peers', async () => {
    configureDiscovery({
      kv: new MemoryKeyValueStore(),
      relays: [],
      fetch: fakeFetch({
        'https://discovery.fula.network/find-box': () => [WT_CIRCUIT, `/ip4/1.2.3.4/tcp/4001/p2p/${RELAY}`],
      }),
    });
    const { candidates } = await resolveCandidates(BOX);
    expect(candidates.map((c) => c.ma.toString())).toEqual([WT_CIRCUIT]);
  });

  it('reports certhashMissing when only TCP circuits could be produced', async () => {
    configureDiscovery({ kv: new MemoryKeyValueStore(), fetch: fakeFetch({}) });
    const { candidates, certhashMissing } = await resolveCandidates(BOX);
    expect(certhashMissing).toBe(true);
    expect(candidates.map((c) => c.ma.toString())).toEqual(HARDCODED_RELAYS.map((r) => `${r.multiaddr}/p2p-circuit/p2p/${BOX}`));
    expect(candidates.every((c) => c.source === 'hardcoded')).toBe(true);
  });

  it('honours the findBox override and throws NO_CANDIDATES when it returns nothing', async () => {
    configureDiscovery({ findBox: async () => [`/ip4/127.0.0.1/tcp/1234/p2p/${BOX}`], fetch: fakeFetch({}) });
    const { candidates } = await resolveCandidates(BOX);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.source).toBe('override');
    configureDiscovery({ findBox: async () => [] });
    await expect(resolveCandidates(BOX)).rejects.toMatchObject({ code: 'NO_CANDIDATES' });
  });
});

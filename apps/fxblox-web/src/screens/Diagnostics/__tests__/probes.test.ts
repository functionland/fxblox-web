import { beforeEach, describe, expect, it, vi } from 'vitest';

const listRelaysMock = vi.hoisted(() => vi.fn());
vi.mock('@/services/discoveryClient', async (orig) => ({
  ...(await orig<typeof import('@/services/discoveryClient')>()),
  listRelays: listRelaysMock,
}));

import { computePluginPresence, hardcodedRelayDnsName, probeDiscoveryAndListRelays, relayFreshness } from '@/screens/Diagnostics/probes';

describe('computePluginPresence (3-state)', () => {
  it('is checking while the per-blox fetch is idle or loading regardless of the list', () => {
    expect(computePluginPresence(['blox-ai'], 'idle')).toBe('checking');
    expect(computePluginPresence(['blox-ai'], 'loading')).toBe('checking');
  });
  it('is installed only when blox-ai is in a loaded list', () => {
    expect(computePluginPresence(['blox-ai'], 'loaded')).toBe('installed');
    expect(computePluginPresence(['something-else', 'blox-ai'], 'loaded')).toBe('installed');
    expect(computePluginPresence(['blox-ai'], 'error')).toBe('installed');
  });
  it('never claims installed for an empty / missing / non-array list (old firmware shape)', () => {
    expect(computePluginPresence([], 'loaded')).toBe('notInstalledOrUnavailable');
    expect(computePluginPresence(['streamr-node', 'loyal-agent'], 'loaded')).toBe('notInstalledOrUnavailable');
    expect(computePluginPresence(undefined, 'loaded')).toBe('notInstalledOrUnavailable');
    expect(computePluginPresence(null, 'error')).toBe('notInstalledOrUnavailable');
    expect(computePluginPresence({}, 'loaded')).toBe('notInstalledOrUnavailable');
    expect(computePluginPresence('blox-ai', 'loaded')).toBe('notInstalledOrUnavailable');
  });
});

describe('relayFreshness', () => {
  const now = 1_000_000_000_000;
  it('buckets the relay list age', () => {
    expect(relayFreshness(now - 10_000, now)).toEqual({ key: 'freshnessJustNow', count: 0 });
    expect(relayFreshness(now - 5 * 60_000, now)).toEqual({ key: 'freshnessMinutes', count: 5 });
    expect(relayFreshness(now - 3 * 3_600_000, now)).toEqual({ key: 'freshnessHours', count: 3 });
    expect(relayFreshness(now - 2 * 86_400_000, now)).toEqual({ key: 'freshnessDays', count: 2 });
  });
});

describe('probeDiscoveryAndListRelays', () => {
  // Braces matter: `mockClear()` returns the mock, and a function returned from `beforeEach` is registered by
  // vitest as the teardown callback — so an expression body would make the runner CALL the mock after each test,
  // surfacing a throwing implementation as a spurious test failure.
  beforeEach(() => {
    listRelaysMock.mockClear();
  });

  it('live listing → discovery ok, every relay "unsupported" (no TCP probe from a browser)', async () => {
    listRelaysMock.mockResolvedValue({ relays: [{ dnsName: 'a.fx.land' }, { dnsName: '' }, {}], source: 'live', fetchedAt: 42 });
    const r = await probeDiscoveryAndListRelays();
    expect(r).toEqual({ discovery: 'ok', relays: [{ dnsName: 'a.fx.land', status: 'unsupported' }], source: 'live', fetchedAt: 42 });
  });

  it('cached listing → discovery failed but the cached relays are still listed', async () => {
    listRelaysMock.mockResolvedValue({ relays: [{ dnsName: 'b.fx.land' }], source: 'cache', fetchedAt: 7 });
    const r = await probeDiscoveryAndListRelays();
    expect(r.discovery).toBe('failed');
    expect(r.source).toBe('cache');
    expect(r.relays).toEqual([{ dnsName: 'b.fx.land', status: 'unsupported' }]);
  });

  it('nothing known → the hardcoded FXRelay host', async () => {
    listRelaysMock.mockResolvedValue({ relays: [], source: 'none' });
    const r = await probeDiscoveryAndListRelays();
    expect(hardcodedRelayDnsName()).toBe('relay.dev.fx.land');
    expect(r).toEqual({ discovery: 'failed', relays: [{ dnsName: 'relay.dev.fx.land', status: 'unsupported' }], source: 'hardcoded' });
  });

  // The client is called inside a try/catch, so a synchronous throw and a rejected promise land in the same branch.
  it('a throwing client is treated as failed + hardcoded', async () => {
    listRelaysMock.mockImplementation(async () => {
      throw new Error('boom');
    });
    const r = await probeDiscoveryAndListRelays();
    expect(r.discovery).toBe('failed');
    expect(r.source).toBe('hardcoded');
    expect(r.relays).toEqual([{ dnsName: 'relay.dev.fx.land', status: 'unsupported' }]);
  });
});

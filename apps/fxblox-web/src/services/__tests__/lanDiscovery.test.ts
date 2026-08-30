import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BLOX_AI_PORT,
  LOCAL_HOST_CANDIDATES,
  discoverBloxesOnLan,
  peerIdFromRelayDiag,
  probeLocalHost,
} from '@/services/lanDiscovery';

const BLOX = '12D3KooWD3fmVvqP6GCSXfNviHf6hTa5RxD7udQbb3Sc14sdJpP7';
const RELAY = '12D3KooWDRrBaAfPwsGJivBoUw5fE7ZpDiyfUjqgiURq2DEcL835';

/** A real `/diag/relay` answer, trimmed. */
const relayBody = (peerId = BLOX) => ({
  relays: [
    {
      addr: `/dns/relay.dev.fx.land/tcp/4001/p2p/${RELAY}/p2p-circuit/p2p/${peerId}`,
      dns_name: 'relay.dev.fx.land',
      has_circuit_reservation: true,
    },
  ],
});

describe('peerIdFromRelayDiag', () => {
  it('takes the Blox, not the relay it is reserved on', () => {
    // A circuit address names two peers; the FIRST is the relay. Reading that one would add the relay as if it
    // were the user's device.
    expect(peerIdFromRelayDiag(relayBody())).toBe(BLOX);
    expect(peerIdFromRelayDiag(relayBody())).not.toBe(RELAY);
  });

  it('skips non-circuit addresses', () => {
    expect(
      peerIdFromRelayDiag({
        relays: [
          { addr: `/dns/relay.dev.fx.land/tcp/4001/p2p/${RELAY}` },
          { addr: `/dns/relay.dev.fx.land/tcp/4001/p2p/${RELAY}/p2p-circuit/p2p/${BLOX}` },
        ],
      }),
    ).toBe(BLOX);
  });

  it('returns null for anything it cannot read', () => {
    expect(peerIdFromRelayDiag(undefined)).toBeNull();
    expect(peerIdFromRelayDiag({})).toBeNull();
    expect(peerIdFromRelayDiag({ relays: [] })).toBeNull();
    expect(peerIdFromRelayDiag({ relays: [{ addr: 42 }] })).toBeNull();
    // A circuit address whose tail is not a valid peer id.
    expect(peerIdFromRelayDiag({ relays: [{ addr: '/p2p-circuit/p2p/not-a-peer-id' }] })).toBeNull();
  });
});

describe('probeLocalHost', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks blox-ai on the .local name and returns the peer id', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => relayBody() });
    await expect(probeLocalHost('fxblox-rk1.local')).resolves.toEqual({
      host: 'fxblox-rk1.local',
      peerId: BLOX,
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`http://fxblox-rk1.local:${BLOX_AI_PORT}/diag/relay`);
  });

  it('asserts the target address space, or Chrome has nothing to prompt about', async () => {
    // The regression that made this useless on a phone. Without `targetAddressSpace: 'local'`, a request to the
    // local network is not prompted for — it is simply blocked. The first version of this file used a bare
    // fetch and only worked on a browser profile that had already been granted the permission by earlier
    // testing, which is indistinguishable from working until you try a device that has not.
    fetchMock.mockResolvedValue({ ok: true, json: async () => relayBody() });
    await probeLocalHost('fxblox-rk1.local');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ targetAddressSpace: 'local' });
  });

  it('a name nobody claims is not found, not an error', async () => {
    // The common case by far: three of the four candidates never exist. It must stay quiet.
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(probeLocalHost('fxblox-rk1-9.local', { retryDelayMs: 0 })).resolves.toBeNull();
  });

  it('retries a cold resolve that timed out, because the first try warms the cache', async () => {
    // The behaviour that makes this feature work at all. The Blox registers its mDNS service with
    // `service.TTL(2)` — a two-second record TTL against a norm of 120 — so the resolver cache is empty almost
    // every time and nearly every lookup is a fresh multicast query racing Chrome's ~2.3 s patience. Measured
    // on the live app: five consecutive probes failed, then one succeeded at 2704 ms and the next at 11 ms.
    // The failed query is not wasted; it populates the cache, so attempt two lands immediately.
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true, json: async () => relayBody() });
    await expect(probeLocalHost('fxblox-rk1.local', { retryDelayMs: 0 })).resolves.toEqual({
      host: 'fxblox-rk1.local',
      peerId: BLOX,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry when the first attempt already answered', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => relayBody() });
    await probeLocalHost('fxblox-rk1.local', { retryDelayMs: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops retrying when the caller aborts', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async () => {
      controller.abort();
      throw new TypeError('Failed to fetch');
    });
    await expect(
      probeLocalHost('fxblox-rk1.local', { signal: controller.signal, retryDelayMs: 0 }),
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a host that answers but is not a Blox is not found', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ hello: 'world' }) });
    await expect(probeLocalHost('printer.local', { retryDelayMs: 0 })).resolves.toBeNull();
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    await expect(probeLocalHost('printer.local', { retryDelayMs: 0 })).resolves.toBeNull();
  });

  it('gives up rather than hanging the scan', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    await expect(probeLocalHost('slow.local', { timeoutMs: 10, retryDelayMs: 0 })).resolves.toBeNull();
  });
});

describe('discoverBloxesOnLan', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('probes every candidate name at once and reports what answered', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('fxblox-rk1.local')
        ? { ok: true, json: async () => relayBody() }
        : Promise.reject(new TypeError('Failed to fetch')),
    );
    const outcome = await discoverBloxesOnLan({ attempts: 1 });
    expect(outcome.found).toEqual([{ host: 'fxblox-rk1.local', peerId: BLOX }]);
    expect(outcome.failure).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(LOCAL_HOST_CANDIDATES.length);
  });

  it('dedupes one device answering to two names', async () => {
    // A renamed host can still answer its old name; adding the same Blox twice is worse than missing it.
    fetchMock.mockResolvedValue({ ok: true, json: async () => relayBody() });
    const { found } = await discoverBloxesOnLan({ hosts: ['a.local', 'b.local'], attempts: 1 });
    expect(found).toHaveLength(1);
  });

  it('keeps two genuinely different Bloxes', async () => {
    const other = '12D3KooWLQsqwzWGcUfdyL7LTSZX9R1csPsSCL9J8GTKVZGN5rHC';
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => relayBody(url.includes('a.local') ? BLOX : other),
    }));
    const { found } = await discoverBloxesOnLan({ hosts: ['a.local', 'b.local'], attempts: 1 });
    expect(found.map((b) => b.peerId).sort()).toEqual([BLOX, other].sort());
  });

  it('an empty network is an empty list, never a throw', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const outcome = await discoverBloxesOnLan({ attempts: 1 });
    expect(outcome.found).toEqual([]);
    expect(outcome.failure).toBe('not-found');
  });
});

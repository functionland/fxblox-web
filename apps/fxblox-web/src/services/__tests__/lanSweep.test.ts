import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_SUBNETS,
  ipFromCandidate,
  localSubnets,
  probeAddress,
  subnetPrefixOf,
  sweepForBloxes,
  sweepSubnet,
} from '@/services/lanSweep';

const BLOX = '12D3KooWD3fmVvqP6GCSXfNviHf6hTa5RxD7udQbb3Sc14sdJpP7';
const RELAY = '12D3KooWDRrBaAfPwsGJivBoUw5fE7ZpDiyfUjqgiURq2DEcL835';
const relayBody = (peerId = BLOX) => ({
  relays: [{ addr: `/dns/relay.dev.fx.land/tcp/4001/p2p/${RELAY}/p2p-circuit/p2p/${peerId}` }],
});

describe('ipFromCandidate', () => {
  it('reads the address out of an Android host candidate', () => {
    // Verbatim from a Moto G85 over adb: Android exposes the real address because it has no working mDNS to
    // hide it behind, which is the whole reason the sweep can know where to look.
    expect(
      ipFromCandidate(
        'candidate:2775306261 1 udp 2113937151 192.168.2.155 57482 typ host generation 0 ufrag WCJ+ network-cost 999',
      ),
    ).toBe('192.168.2.155');
  });

  it('returns null for the mDNS-obfuscated desktop form', () => {
    // Verbatim from desktop Chrome 151. No address to be had — and none needed, since `.local` resolves there.
    expect(
      ipFromCandidate(
        'candidate:3020544686 1 udp 2113937151 a8caccf9-bb25-47eb-bdbf-27d3ab062d26.local 51443 typ host generation 0 ufrag r4qa',
      ),
    ).toBeNull();
  });

  it('ignores anything that is not a private host candidate', () => {
    // A srflx candidate carries the PUBLIC address. Sweeping a public /24 would be scanning the internet.
    expect(ipFromCandidate('candidate:1 1 udp 1 203.0.113.7 4444 typ srflx raddr 0.0.0.0')).toBeNull();
    expect(ipFromCandidate('candidate:1 1 udp 1 203.0.113.7 4444 typ host')).toBeNull();
    expect(ipFromCandidate('')).toBeNull();
  });
});

describe('subnetPrefixOf', () => {
  it('takes the /24', () => {
    expect(subnetPrefixOf('192.168.2.155')).toBe('192.168.2.');
    expect(subnetPrefixOf('10.0.1.7')).toBe('10.0.1.');
  });
  it('rejects nonsense', () => {
    expect(subnetPrefixOf('192.168.2')).toBeNull();
    expect(subnetPrefixOf('')).toBeNull();
  });
});

describe('probeAddress / sweepSubnet', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asserts the target address space, as every LAN request must', () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => relayBody() });
    return probeAddress('192.168.2.159').then(() => {
      expect(fetchMock.mock.calls[0]?.[0]).toBe('http://192.168.2.159:8083/diag/relay');
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ targetAddressSpace: 'local' });
    });
  });

  it('a dead address is null, not a throw', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(probeAddress('192.168.2.201')).resolves.toBeNull();
  });

  it('sweeps .1 through .254 and returns only what answered', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('192.168.2.159')
        ? { ok: true, json: async () => relayBody() }
        : Promise.reject(new TypeError('Failed to fetch')),
    );
    await expect(sweepSubnet('192.168.2.')).resolves.toEqual([
      { host: '192.168.2.159', peerId: BLOX },
    ]);
    // Never .0 or .255 — network and broadcast.
    expect(fetchMock).toHaveBeenCalledTimes(254);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes('192.168.2.0:'))).toBe(false);
    expect(urls.some((u) => u.includes('192.168.2.255:'))).toBe(false);
  });
});

describe('localSubnets', () => {
  const original = globalThis.RTCPeerConnection;
  afterEach(() => {
    globalThis.RTCPeerConnection = original;
  });

  function stubIce(candidates: string[]) {
    globalThis.RTCPeerConnection = class {
      onicecandidate: ((e: { candidate: { candidate: string } | null }) => void) | null = null;
      createDataChannel() {
        return {};
      }
      async createOffer() {
        return {};
      }
      async setLocalDescription() {
        for (const candidate of candidates) this.onicecandidate?.({ candidate: { candidate } });
      }
      close() {
        /* nothing to release in the stub */
      }
    } as unknown as typeof RTCPeerConnection;
  }

  it('derives the subnet from an Android-style candidate', async () => {
    stubIce([
      'candidate:1 1 udp 2113937151 192.168.2.155 57482 typ host generation 0 ufrag WCJ+ network-cost 999',
    ]);
    await expect(localSubnets({ gatherMs: 0 })).resolves.toEqual(['192.168.2.']);
  });

  it('finds nothing on desktop, where the candidate is obfuscated', async () => {
    // Not a failure: desktop resolves `.local` instead, so the name probes cover it.
    stubIce(['candidate:1 1 udp 2113937151 a8caccf9-bb25.local 51443 typ host']);
    await expect(localSubnets({ gatherMs: 0 })).resolves.toEqual([]);
  });

  it('caps how many subnets one tap can scan', async () => {
    // A device with a VPN and virtual adapters could otherwise turn one tap into a very wide scan.
    stubIce(
      ['192.168.1.5', '192.168.2.5', '10.0.0.5', '172.16.0.5'].map(
        (ip) => `candidate:1 1 udp 1 ${ip} 1111 typ host`,
      ),
    );
    await expect(localSubnets({ gatherMs: 0 })).resolves.toHaveLength(MAX_SUBNETS);
  });

  it('survives a browser with no WebRTC at all', async () => {
    globalThis.RTCPeerConnection = undefined as unknown as typeof RTCPeerConnection;
    await expect(localSubnets({ gatherMs: 0 })).resolves.toEqual([]);
  });
});

describe('sweepForBloxes', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing when the subnet is unknown', async () => {
    // The desktop case. Sweeping a guessed range would be scanning networks the user is not even on.
    await expect(sweepForBloxes({ subnets: [] })).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('dedupes a Blox that answers on two subnets', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('.159') ? { ok: true, json: async () => relayBody() } : Promise.reject(new TypeError('x')),
    );
    const found = await sweepForBloxes({ subnets: ['192.168.1.', '192.168.2.'] });
    expect(found).toHaveLength(1);
  });
});

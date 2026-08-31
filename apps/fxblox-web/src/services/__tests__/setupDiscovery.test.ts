import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  discoverUnownedBloxes,
  probeSetupHost,
  setupProbeUrl,
  WAP_PORT,
} from '../setupDiscovery';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // jsdom has no RTCPeerConnection, so `localSubnets` returns [] and only the name probes run — which is the
  // desktop shape anyway. The sweep gets its own coverage through the injected `subnets` option.
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ok = () => new Response('', { status: 200 });
const forbidden = () => new Response('', { status: 403 });

describe('setupProbeUrl', () => {
  it('asks the WAP API, not blox-ai — an unowned box has nothing to say on :8083', () => {
    expect(setupProbeUrl('fxblox-rk1.local')).toBe(`http://fxblox-rk1.local:${WAP_PORT}/properties`);
    expect(WAP_PORT).toBe(3500);
  });
});

describe('probeSetupHost', () => {
  it('reports a Blox that answers', async () => {
    fetchMock.mockResolvedValue(ok());
    await expect(probeSetupHost('192.168.2.159')).resolves.toEqual({ host: '192.168.2.159' });
  });

  it('asserts the local address space, or Chrome blocks the request outright', async () => {
    fetchMock.mockResolvedValue(ok());
    await probeSetupHost('192.168.2.159');
    const init = fetchMock.mock.calls[0]![1] as { targetAddressSpace?: string; method?: string };
    expect(init.targetAddressSpace).toBe('local');
    expect(init.method).toBe('HEAD');
  });

  it('treats a Blox that already has an owner as a miss', async () => {
    // go-fula's lanSetupGuard answers 403 once an authorizer is set. Offering to "set up" someone else's box
    // is the one wrong answer this search could give.
    fetchMock.mockResolvedValue(forbidden());
    await expect(probeSetupHost('192.168.2.159')).resolves.toBeNull();
  });

  it('never throws on a dead address', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(probeSetupHost('192.168.2.4')).resolves.toBeNull();
  });
});

describe('discoverUnownedBloxes', () => {
  it('finds a Blox by name and reports no failure', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes('fxblox-rk1.local') ? ok() : forbidden(),
    );
    const outcome = await discoverUnownedBloxes({ attempts: 1 });
    expect(outcome.found).toEqual([{ host: 'fxblox-rk1.local' }]);
    expect(outcome.failure).toBeUndefined();
  });

  it('distinguishes a blocked browser from an absent Blox', async () => {
    // Reporting a refused permission as "no Blox found" sends the user after a cable fault they do not have.
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('navigator', {
      ...navigator,
      permissions: { query: async () => ({ state: 'denied' }) },
    });
    const outcome = await discoverUnownedBloxes({ attempts: 1 });
    expect(outcome.found).toEqual([]);
    expect(outcome.failure).toBe('blocked');
  });

  it('says not-found when the browser was willing and nothing answered', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const outcome = await discoverUnownedBloxes({ attempts: 1 });
    expect(outcome.found).toEqual([]);
    expect(outcome.failure).toBe('not-found');
  });

  it('sweeps an injected subnet and dedupes against the name probes', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const target = String(url);
      if (target.includes('192.168.9.7:')) return ok();
      return forbidden();
    });
    const outcome = await discoverUnownedBloxes({ attempts: 1, subnets: ['192.168.9.'] });
    expect(outcome.found).toEqual([{ host: '192.168.9.7' }]);
  });

  it('a name and an address for the same box are both kept, name first', async () => {
    // They are different strings and both work as a base URL; the name is the friendlier one to act on.
    fetchMock.mockImplementation(async (url: string) => {
      const target = String(url);
      if (target.includes('fxblox-rk1.local') || target.includes('192.168.9.7:')) return ok();
      return forbidden();
    });
    const outcome = await discoverUnownedBloxes({ attempts: 1, subnets: ['192.168.9.'] });
    expect(outcome.found[0]).toEqual({ host: 'fxblox-rk1.local' });
  });
});

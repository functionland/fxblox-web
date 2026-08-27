/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { buildLanRequest, classifyNetworkFailure, isLocalTarget, lanFetch, lanJson, probeNoCors, LanHttpError, isLanHttpError } from '../lanHttp';
import { textResponse } from '@/test/helpers/sseResponse';

const AP = 'http://10.42.0.1:3500';

afterEach(() => {
  vi.unstubAllGlobals();
});

function abortErr() {
  return Object.assign(new Error('aborted'), { name: 'AbortError' });
}

/** A fetch that never resolves until its signal aborts (for timeout / abort tests). */
function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(abortErr()))));
}

describe('isLocalTarget', () => {
  test.each([
    [`${AP}/readiness`, true],
    ['http://192.168.1.20:8083/health', true],
    ['http://localhost:3500/x', true],
    ['http://127.0.0.1:3500/x', true],
    ['http://blox.local/x', true],
    ['https://discovery.fula.network/relays', false],
    ['http://8.8.8.8/x', false],
    ['not a url', false],
  ])('%s → %s', (url, expected) => {
    expect(isLocalTarget(url)).toBe(expected);
  });
});

describe('buildLanRequest — simple-request discipline', () => {
  test('GET: cors/no-store/omit, no body (jsdom page is localhost → no targetAddressSpace)', () => {
    const { url, init } = buildLanRequest(`${AP}/properties`);
    expect(url).toBe(`${AP}/properties`);
    expect(init).toEqual(expect.objectContaining({ method: 'GET', mode: 'cors', cache: 'no-store', credentials: 'omit' }));
    // jsdom serves the test page from localhost, itself a local address space — see the dedicated
    // targetAddressSpace block below for why asserting it from there breaks the request outright.
    expect(init.targetAddressSpace).toBeUndefined();
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({});
  });

  test('POST form: application/x-www-form-urlencoded body + query params (go-fula FormValue reads both)', () => {
    const { url, init } = buildLanRequest(`${AP}/wifi/connect`, { method: 'POST', query: { ssid: 'Home Net', countryCode: 'CA' }, form: { ssid: 'Home Net', password: 'p&w', countryCode: 'CA' } });
    expect(url).toBe(`${AP}/wifi/connect?ssid=Home+Net&countryCode=CA`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/x-www-form-urlencoded');
    expect(init.body).toBe('ssid=Home+Net&password=p%26w&countryCode=CA');
  });

  test('form implies POST; undefined/null values are skipped', () => {
    const { init } = buildLanRequest(`${AP}/peer/exchange`, { form: { peer_id: 'p', seed: undefined, x: null } });
    expect(init.method).toBe('POST');
    expect(init.body).toBe('peer_id=p');
  });

  test('POST without a form still sends the simple content-type and an empty body', () => {
    const { init } = buildLanRequest(`${AP}/partition`, { method: 'POST' });
    expect(init.body).toBe('');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/x-www-form-urlencoded');
  });

  test('custom headers are rejected (they would force a preflight)', () => {
    expect(() => buildLanRequest(`${AP}/x`, { headers: { 'x-custom': '1' } } as any)).toThrow(/custom headers/);
  });

  test('no targetAddressSpace for public hosts', () => {
    const { init } = buildLanRequest('https://pools.fx.land/health');
    expect(init.targetAddressSpace).toBeUndefined();
  });
});

/**
 * `targetAddressSpace` is an assertion, not a hint: Chrome answers it with a Private Network Access preflight
 * and fails the request unless the server allows it. The gate protects local devices from PUBLIC pages, so it
 * is only meaningful when the page is more public than the target.
 *
 * Getting this wrong is not a soft failure. Verified against a real Blox: from a page on http://127.0.0.1:5173,
 * `fetch(box, { targetAddressSpace: 'local' })` threw "TypeError: Failed to fetch" while the identical fetch
 * without it returned 200 — so every LAN call from a dev build died before reaching the box.
 */
describe('buildLanRequest — targetAddressSpace only when crossing into a local space', () => {
  test('page on localhost → NOT set (same address space, nothing to gate)', () => {
    vi.stubGlobal('location', { hostname: 'localhost' });
    expect(buildLanRequest(`${AP}/properties`).init.targetAddressSpace).toBeUndefined();
  });

  test('page on a LAN IP → NOT set', () => {
    vi.stubGlobal('location', { hostname: '192.168.1.50' });
    expect(buildLanRequest(`${AP}/properties`).init.targetAddressSpace).toBeUndefined();
  });

  test('page on the deployed public origin → set (this is the case LNA exists for)', () => {
    vi.stubGlobal('location', { hostname: 'blox.fx.land' });
    expect(buildLanRequest(`${AP}/properties`).init.targetAddressSpace).toBe('local');
  });

  test('public page to a public target → still not set', () => {
    vi.stubGlobal('location', { hostname: 'blox.fx.land' });
    expect(buildLanRequest('https://pools.fx.land/health').init.targetAddressSpace).toBeUndefined();
  });
});

describe('lanFetch — success + http errors', () => {
  test('2xx resolves with the Response and passes the built init (+ signal)', async () => {
    const fetchImpl = vi.fn(async () => textResponse('{"status":"ready"}'));
    const res = await lanFetch(`${AP}/readiness`, {}, { fetchImpl });
    expect(res.status).toBe(200);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit & { targetAddressSpace?: string }];
    expect(url).toBe(`${AP}/readiness`);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test('non-2xx → LanHttpError kind http with status + body', async () => {
    const fetchImpl = vi.fn(async () => textResponse('nope', 500));
    const err = await lanFetch(`${AP}/x`, {}, { fetchImpl }).catch((e) => e);
    expect(isLanHttpError(err)).toBe(true);
    expect(err).toBeInstanceOf(LanHttpError);
    expect(err.kind).toBe('http');
    expect(err.status).toBe(500);
    expect(err.body).toBe('nope');
  });

  test('lanJson parses JSON bodies and returns raw text otherwise (axios envelope)', async () => {
    const json = await lanJson<{ a: number }>(`${AP}/j`, {}, { fetchImpl: vi.fn(async () => textResponse('{"a":1}')) });
    expect(json.data).toEqual({ a: 1 });
    expect(json.status).toBe(200);
    const text = await lanJson<string>(`${AP}/t`, {}, { fetchImpl: vi.fn(async () => textResponse('Wifi connected!')) });
    expect(text.data).toBe('Wifi connected!');
  });
});

describe('lanFetch — taxonomy', () => {
  test('timeout → kind timeout', async () => {
    const err = await lanFetch(`${AP}/slow`, { timeoutMs: 20 }, { fetchImpl: hangingFetch() as any }).catch((e) => e);
    expect(err.kind).toBe('timeout');
  });

  test('caller abort → kind aborted', async () => {
    const ac = new AbortController();
    const p = lanFetch(`${AP}/slow`, { signal: ac.signal, timeoutMs: 5000 }, { fetchImpl: hangingFetch() as any }).catch((e) => e);
    ac.abort();
    const err = await p;
    expect(err.kind).toBe('aborted');
  });

  test('TypeError + reachable no-cors probe → kind cors (old firmware → offer BLE)', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.mode === 'no-cors') return new Response(null, { status: 200 });
      throw new TypeError('Failed to fetch');
    });
    const err = await lanFetch(`${AP}/properties`, {}, { fetchImpl: fetchImpl as any }).catch((e) => e);
    expect(err.kind).toBe('cors');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].mode).toBe('no-cors');
  });

  test('TypeError + failing probe → kind unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await lanFetch(`${AP}/properties`, {}, { fetchImpl: fetchImpl as any }).catch((e) => e);
    expect(err.kind).toBe('unreachable');
  });

  test('TypeError + probe timeout → kind timeout', async () => {
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.mode === 'no-cors') return new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(abortErr())));
      return Promise.reject(new TypeError('Failed to fetch'));
    });
    const kind = await classifyNetworkFailure(`${AP}/x`, { fetchImpl: fetchImpl as any, probeTimeoutMs: 10 });
    expect(kind).toBe('timeout');
  });

  test('local-network-access permission denied → kind lna-denied (no probe needed)', async () => {
    vi.stubGlobal('navigator', { ...navigator, permissions: { query: async () => ({ state: 'denied' }) } });
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await lanFetch(`${AP}/properties`, {}, { fetchImpl: fetchImpl as any }).catch((e) => e);
    expect(err.kind).toBe('lna-denied');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('classify:false skips the probe and reports unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await lanFetch(`${AP}/x`, { classify: false }, { fetchImpl: fetchImpl as any }).catch((e) => e);
    expect(err.kind).toBe('unreachable');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('probeNoCors maps opaque / TypeError / abort', async () => {
    expect(await probeNoCors(`${AP}/x`, 100, (async () => new Response(null, { status: 200 })) as any)).toBe('reachable');
    expect(
      await probeNoCors(`${AP}/x`, 100, (async () => {
        throw new TypeError('x');
      }) as any),
    ).toBe('unreachable');
    expect(await probeNoCors(`${AP}/x`, 10, hangingFetch() as any)).toBe('timeout');
  });
});

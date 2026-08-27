import { afterEach, describe, expect, test, vi } from 'vitest';
import { isOnline, probeInternet, INTERNET_PROBE_URL } from '../network';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('network.isOnline', () => {
  test('navigator.onLine === false short-circuits without a probe', async () => {
    vi.stubGlobal('navigator', { ...navigator, onLine: false });
    const fetchImpl = vi.fn();
    expect(await isOnline({ fetchImpl: fetchImpl as unknown as typeof fetch })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('probe resolves (opaque no-cors) → online', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    expect(await isOnline({ fetchImpl: fetchImpl as unknown as typeof fetch })).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.startsWith(INTERNET_PROBE_URL)).toBe(true);
    expect(init.mode).toBe('no-cors');
  });

  test('probe rejects → offline', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await probeInternet({ fetchImpl: fetchImpl as unknown as typeof fetch })).toBe(false);
  });

  test('probe timeout → offline', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
    );
    expect(await probeInternet({ fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 10 })).toBe(false);
  });
});

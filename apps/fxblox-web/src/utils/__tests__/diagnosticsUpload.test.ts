/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DIAGNOSTICS_UPLOAD_URL, uuidv4, buildDiagnosticsPayload, postDiagnostics } from '../diagnosticsUpload';
import type { DiagBundle } from '../httpAiClient';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DIAGNOSTICS_UPLOAD_URL', () => {
  test('points at the agreed /diagnostics intake endpoint', () => {
    expect(DIAGNOSTICS_UPLOAD_URL).toBe('https://ai-training.fx.land/diagnostics');
  });
  test('is HTTPS on an fx.land host', () => {
    const u = new URL(DIAGNOSTICS_UPLOAD_URL);
    expect(u.protocol).toBe('https:');
    expect(u.hostname.endsWith('.fx.land')).toBe(true);
  });
});

describe('uuidv4', () => {
  const CANONICAL_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  test('matches the canonical lowercase v4 shape', () => {
    for (let i = 0; i < 200; i++) expect(uuidv4()).toMatch(CANONICAL_V4);
  });
  test('sets version nibble to 4 and variant nibble to 8/9/a/b', () => {
    const u = uuidv4();
    expect(u[14]).toBe('4');
    expect(['8', '9', 'a', 'b']).toContain(u[19]);
  });
  test('produces distinct ids across calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(uuidv4());
    expect(seen.size).toBe(500);
  });
});

describe('buildDiagnosticsPayload', () => {
  const baseArgs = {
    bloxKuboPeerId: '12D3KooKubo',
    bloxClusterPeerId: '12D3KooCluster',
    appPeerId: '12D3KooApp',
    phoneInternet: 'ok' as const,
    discoveryStatus: 'failed' as const,
    relays: [{ dns_name: 'relay1.fx.land', status: 'ok' }],
    transportUsed: 'lan-http',
    appPlatform: 'web',
  };

  test('kind is always "diagnostics" and ids/timestamps are minted', () => {
    const p = buildDiagnosticsPayload({ ...baseArgs, bundle: null });
    expect(p.kind).toBe('diagnostics');
    expect(p.upload_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(Number.isNaN(Date.parse(p.generated_at))).toBe(false);
  });

  test('phone block carries every identifier + probe verbatim', () => {
    const p = buildDiagnosticsPayload({ ...baseArgs, bundle: null });
    expect(p.phone).toEqual({
      blox_kubo_peer_id: '12D3KooKubo',
      blox_cluster_peer_id: '12D3KooCluster',
      app_peer_id: '12D3KooApp',
      phone_internet: 'ok',
      discovery_service: 'failed',
      relays: [{ dns_name: 'relay1.fx.land', status: 'ok' }],
      transport_used: 'lan-http',
      app_platform: 'web',
    });
  });

  test('blox = {generated_at, tools} when a bundle was fetched', () => {
    const bundle: DiagBundle = { generated_at: '2026-05-29T00:00:00.000Z', tools: { internet: { dns_ok: true } } };
    expect(buildDiagnosticsPayload({ ...baseArgs, bundle }).blox).toEqual({ generated_at: '2026-05-29T00:00:00.000Z', tools: { internet: { dns_ok: true } } });
  });

  test('blox = {error} when the bundle fetch failed', () => {
    expect(buildDiagnosticsPayload({ ...baseArgs, bundle: null, bundleError: 'no transport available' }).blox).toEqual({ error: 'no transport available' });
  });

  test('blox = null when neither a bundle nor an error is supplied', () => {
    expect(buildDiagnosticsPayload({ ...baseArgs, bundle: null }).blox).toBeNull();
  });

  test('two calls mint distinct upload_ids', () => {
    expect(buildDiagnosticsPayload({ ...baseArgs, bundle: null }).upload_id).not.toBe(buildDiagnosticsPayload({ ...baseArgs, bundle: null }).upload_id);
  });
});

describe('postDiagnostics', () => {
  const payload = buildDiagnosticsPayload({
    bloxKuboPeerId: 'k',
    bloxClusterPeerId: null,
    appPeerId: 'a',
    phoneInternet: 'ok',
    discoveryStatus: 'ok',
    relays: null,
    transportUsed: 'none',
    appPlatform: 'web',
    bundle: null,
  });

  test('200 → ok:true with status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    expect(await postDiagnostics(payload)).toEqual({ ok: true, status: 200 });
  });

  test('POSTs JSON to the diagnostics URL with the exact payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    await postDiagnostics(payload);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(DIAGNOSTICS_UPLOAD_URL);
    expect((init as any).method).toBe('POST');
    expect((init as any).headers['Content-Type']).toBe('application/json');
    expect(JSON.parse((init as any).body)).toEqual(payload);
  });

  test('non-2xx → ok:false with sanitized "HTTP <status>"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 413 }));
    expect(await postDiagnostics(payload)).toEqual({ ok: false, status: 413, error: 'HTTP 413' });
  });

  test('network failure → "network error" (never throws)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const r = await postDiagnostics(payload);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('network error');
  });

  test('abort/timeout → "timeout"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    const r = await postDiagnostics(payload, 5);
    expect(r.error).toBe('timeout');
  });
});

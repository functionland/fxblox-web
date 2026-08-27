/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Ported from apps/box/src/utils/__tests__/httpAiClient.test.ts. The SSE lifecycle tests now drive the real
 * fetch + ReadableStream client with `Response(ReadableStream)` bodies instead of a react-native-sse mock.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { HttpAiClient, DIAG_FALLBACK_TOOLS, seqFromId } from '../httpAiClient';
import { sseResponse, textResponse } from '@/test/helpers/sseResponse';
import { sleep, waitFor } from '@/test/helpers/waitFor';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<any>) {
  const mock = vi.fn(impl);
  vi.stubGlobal('fetch', mock);
  return mock;
}

describe('HttpAiClient — constructor validation', () => {
  test('rejects empty lanIp', () => {
    expect(() => new HttpAiClient('')).toThrow(/lanIp/);
  });

  test.each([0, -1, 65536, 99999, 1.5, NaN])('rejects bad port %p', (port) => {
    expect(() => new HttpAiClient('192.168.1.1', port as number)).toThrow(/port/);
  });

  test.each([1, 80, 8083, 8084, 65535])('accepts valid port %p', (port) => {
    expect(() => new HttpAiClient('192.168.1.1', port)).not.toThrow();
  });

  test('builds baseUrl from lanIp + port', () => {
    expect(new HttpAiClient('10.0.0.5', 9100).baseUrl).toBe('http://10.0.0.5:9100');
  });

  test('default port 8083', () => {
    const c = new HttpAiClient('192.168.1.50');
    expect(c.port).toBe(8083);
    expect(c.baseUrl).toBe('http://192.168.1.50:8083');
  });
});

describe('seqFromId', () => {
  test('parses integers, rejects -1 / junk', () => {
    expect(seqFromId('0')).toBe(0);
    expect(seqFromId('17')).toBe(17);
    expect(seqFromId('-1')).toBeNull();
    expect(seqFromId('')).toBeNull();
    expect(seqFromId(undefined)).toBeNull();
    expect(seqFromId('abc')).toBeNull();
  });
});

describe('HttpAiClient.health()', () => {
  test('returns ok=true when server responds 200 with ok:true body', async () => {
    stubFetch(async () => ({ status: 200, text: () => Promise.resolve('{"ok":true}') }));
    const r = await new HttpAiClient('192.168.1.50').health();
    expect(r.ok).toBe(true);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test('returns ok=false on non-200', async () => {
    stubFetch(async () => ({ status: 503, text: () => Promise.resolve('{"ok":false}') }));
    expect((await new HttpAiClient('192.168.1.50').health()).ok).toBe(false);
  });

  test('returns ok=false when 200 body is not ok:true', async () => {
    stubFetch(async () => ({ status: 200, text: () => Promise.resolve('garbage') }));
    expect((await new HttpAiClient('192.168.1.50').health()).ok).toBe(false);
  });

  test('returns ok=false on network error', async () => {
    stubFetch(async () => {
      throw new Error('ECONNREFUSED');
    });
    expect((await new HttpAiClient('192.168.1.50').health()).ok).toBe(false);
  });

  test('memoizes for HEALTH_CACHE_TTL_MS', async () => {
    const fetchMock = stubFetch(async () => ({ status: 200, text: () => Promise.resolve('{"ok":true}') }));
    const c = new HttpAiClient('192.168.1.50');
    await c.health();
    await c.health();
    await c.health();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await c.health()).cached).toBe(true);
  });

  test('invalidateHealthCache forces re-probe', async () => {
    const fetchMock = stubFetch(async () => ({ status: 200, text: () => Promise.resolve('{"ok":true}') }));
    const c = new HttpAiClient('192.168.1.50');
    await c.health();
    c.invalidateHealthCache();
    await c.health();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('HttpAiClient.executeAction()', () => {
  test('200 → ok with parsed payload', async () => {
    stubFetch(async () => ({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"type":"execution_result","action_id":"a1","success":true,"duration_ms":100}'),
    }));
    const r = await new HttpAiClient('192.168.1.50').executeAction({ action_id: 'a1', approval_token: 'tok' });
    expect(r.ok).toBe(true);
    expect(r.payload?.success).toBe(true);
  });

  test('429 → http-busy error (NOT transient)', async () => {
    stubFetch(async () => ({ ok: false, status: 429, text: () => Promise.resolve('device busy') }));
    const r = await new HttpAiClient('192.168.1.50').executeAction({ action_id: 'a1', approval_token: 't' });
    expect(r.ok).toBe(false);
    expect(r.error?.kind).toBe('http-busy');
    expect(r.error?.transient).toBe(false);
  });

  test('400 → http-bad-request (not transient)', async () => {
    stubFetch(async () => ({ ok: false, status: 400, text: () => Promise.resolve('bad request') }));
    const r = await new HttpAiClient('192.168.1.50').executeAction({ action_id: 'a1', approval_token: 't' });
    expect(r.error?.kind).toBe('http-bad-request');
    expect(r.error?.transient).toBe(false);
  });

  test('404 → http-not-found (not transient)', async () => {
    stubFetch(async () => ({ ok: false, status: 404, text: () => Promise.resolve('not found') }));
    const r = await new HttpAiClient('192.168.1.50').executeAction({ action_id: 'a1', approval_token: 't' });
    expect(r.error?.kind).toBe('http-not-found');
    expect(r.error?.transient).toBe(false);
  });

  test('500 → http-server (transient)', async () => {
    stubFetch(async () => ({ ok: false, status: 500, text: () => Promise.resolve('boom') }));
    const r = await new HttpAiClient('192.168.1.50').executeAction({ action_id: 'a1', approval_token: 't' });
    expect(r.error?.kind).toBe('http-server');
    expect(r.error?.transient).toBe(true);
  });

  test('network failure → network error (transient)', async () => {
    stubFetch(async () => {
      throw new Error('ETIMEDOUT');
    });
    const r = await new HttpAiClient('192.168.1.50').executeAction({ action_id: 'a1', approval_token: 't' });
    expect(r.error?.kind).toBe('network');
    expect(r.error?.transient).toBe(true);
  });

  test('includes security_code only when provided', async () => {
    const fetchMock = stubFetch(async () => ({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"type":"execution_result","action_id":"a1","success":true,"duration_ms":100}'),
    }));
    const c = new HttpAiClient('192.168.1.50');
    await c.executeAction({ action_id: 'a1', approval_token: 't' });
    const bodyNoCode = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(bodyNoCode.security_code).toBeUndefined();
    await c.executeAction({ action_id: 'a2', approval_token: 't' }, '1234');
    const bodyWithCode = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(bodyWithCode.security_code).toBe('1234');
  });
});

describe('HttpAiClient.fetchDiagBundle()', () => {
  test('200 + valid JSON → ok:true with parsed bundle', async () => {
    stubFetch(async () => ({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"generated_at":"2026-05-29T00:00:00Z","tools":{"internet":{"dns_ok":true}}}'),
    }));
    const r = await new HttpAiClient('192.168.1.50').fetchDiagBundle();
    expect(r.ok).toBe(true);
    expect(r.payload?.generated_at).toBe('2026-05-29T00:00:00Z');
    expect(r.payload?.tools).toEqual({ internet: { dns_ok: true } });
  });

  test('POSTs an empty JSON body to /diag/bundle (BLE-proxy-compatible)', async () => {
    const fetchMock = stubFetch(async () => ({ ok: true, status: 200, text: () => Promise.resolve('{"generated_at":"t","tools":{}}') }));
    await new HttpAiClient('192.168.1.50').fetchDiagBundle();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://192.168.1.50:8083/diag/bundle');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as any).headers['Content-Type']).toBe('application/json');
    expect((init as RequestInit).body).toBe('{}');
  });

  test('200 + non-JSON → sse-malformed', async () => {
    stubFetch(async () => ({ ok: true, status: 200, text: () => Promise.resolve('not json at all') }));
    const r = await new HttpAiClient('192.168.1.50').fetchDiagBundle();
    expect(r.ok).toBe(false);
    expect(r.error?.kind).toBe('sse-malformed');
    expect(r.error?.transient).toBe(false);
  });

  test('429 → http-busy', async () => {
    stubFetch(async () => ({ ok: false, status: 429, text: () => Promise.resolve('device busy') }));
    const r = await new HttpAiClient('192.168.1.50').fetchDiagBundle();
    expect(r.error?.kind).toBe('http-busy');
    expect(r.error?.transient).toBe(false);
  });

  test('500 → http-server (transient)', async () => {
    stubFetch(async () => ({ ok: false, status: 500, text: () => Promise.resolve('boom') }));
    const r = await new HttpAiClient('192.168.1.50').fetchDiagBundle();
    expect(r.error?.kind).toBe('http-server');
    expect(r.error?.transient).toBe(true);
  });

  test('network failure → network error (transient)', async () => {
    stubFetch(async () => {
      throw new Error('ECONNREFUSED');
    });
    const r = await new HttpAiClient('192.168.1.50').fetchDiagBundle();
    expect(r.ok).toBe(false);
    expect(r.error?.kind).toBe('network');
  });

  test('405 on POST → falls back to per-tool GETs and assembles the bundle', async () => {
    const fetchMock = stubFetch(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return { ok: false, status: 405, text: () => Promise.resolve('Method Not Allowed') };
      const tool = url.split('/diag/')[1];
      return { ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ tool, ok: true })) };
    });
    const r = await new HttpAiClient('192.168.1.50').fetchDiagBundle();
    expect(r.ok).toBe(true);
    expect(typeof r.payload?.generated_at).toBe('string');
    expect(Object.keys(r.payload!.tools).sort()).toEqual([...DIAG_FALLBACK_TOOLS].sort());
    expect(r.payload?.tools.internet).toEqual({ tool: 'internet', ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1 + DIAG_FALLBACK_TOOLS.length);
  });

  test('404 on POST → also falls back', async () => {
    stubFetch(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return { ok: false, status: 404, text: () => Promise.resolve('Not Found') };
      return { ok: true, status: 200, text: () => Promise.resolve('{"ok":true}') };
    });
    const r = await new HttpAiClient('192.168.1.50').fetchDiagBundle();
    expect(r.ok).toBe(true);
    expect(r.payload?.tools.internet).toEqual({ ok: true });
  });

  test('fallback records {error} for tools absent on a stale image but still succeeds', async () => {
    const stale = new Set(['internet', 'relay', 'time', 'power', 'storage', 'containers', 'wireguard', 'heartbeat', 'events', 'readiness']);
    stubFetch(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return { ok: false, status: 405, text: () => Promise.resolve('') };
      const tool = url.split('/diag/')[1]!;
      return stale.has(tool)
        ? { ok: true, status: 200, text: () => Promise.resolve('{"data":1}') }
        : { ok: false, status: 404, text: () => Promise.resolve('not found') };
    });
    const r = await new HttpAiClient('192.168.1.50').fetchDiagBundle();
    expect(r.ok).toBe(true);
    expect(r.payload?.tools.internet).toEqual({ data: 1 });
    expect(r.payload?.tools.kubo_health).toEqual({ error: 'HTTP 404', http_status: 404 });
  });

  test('fallback where EVERY per-tool GET fails → network error', async () => {
    stubFetch(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return { ok: false, status: 405, text: () => Promise.resolve('') };
      return { ok: false, status: 500, text: () => Promise.resolve('boom') };
    });
    const r = await new HttpAiClient('192.168.1.50').fetchDiagBundle();
    expect(r.ok).toBe(false);
    expect(r.error?.kind).toBe('network');
  });

  test('fallback caps in-flight per-tool GETs (parallel but bounded)', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    stubFetch(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return { ok: false, status: 405, text: () => Promise.resolve('') };
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await sleep(5);
      inFlight -= 1;
      return { ok: true, status: 200, text: () => Promise.resolve('{}') };
    });
    const r = await new HttpAiClient('192.168.1.50').fetchDiagBundle();
    expect(r.ok).toBe(true);
    expect(maxInFlight).toBeLessThanOrEqual(5);
    expect(maxInFlight).toBeGreaterThan(1);
  });
});

describe('HttpAiClient.enableRemoteSupport()', () => {
  test('200 {success:true} → ok:true', async () => {
    stubFetch(async () => ({ ok: true, status: 200, text: () => Promise.resolve('{"success":true,"exit_code":0}') }));
    const r = await new HttpAiClient('192.168.1.50').enableRemoteSupport('1234');
    expect(r.ok).toBe(true);
    expect(r.payload?.success).toBe(true);
  });

  test('sends X-Fula-Support header + security_code body', async () => {
    const fetchMock = stubFetch(async () => ({ ok: true, status: 200, text: () => Promise.resolve('{"success":true}') }));
    await new HttpAiClient('192.168.1.50').enableRemoteSupport('4321');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://192.168.1.50:8083/support/wireguard');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as any).headers['X-Fula-Support']).toBe('enable');
    expect(JSON.parse((init as RequestInit).body as string).security_code).toBe('4321');
  });

  test('403 security_code_invalid → ok:false but payload carries the gate code', async () => {
    stubFetch(async () => ({ ok: false, status: 403, text: () => Promise.resolve('{"error":"security_code_invalid"}') }));
    const r = await new HttpAiClient('192.168.1.50').enableRemoteSupport('0000');
    expect(r.ok).toBe(false);
    expect(r.error?.kind).toBe('http-bad-request');
    expect(r.payload?.error).toBe('security_code_invalid');
  });

  test('non-2xx with non-JSON body → payload undefined, error set', async () => {
    stubFetch(async () => ({ ok: false, status: 500, text: () => Promise.resolve('<html>500</html>') }));
    const r = await new HttpAiClient('192.168.1.50').enableRemoteSupport('1234');
    expect(r.error?.kind).toBe('http-server');
    expect(r.payload).toBeUndefined();
  });

  test('500 tunnel_inactive_after_restart → verified-down status preserved', async () => {
    stubFetch(async () => ({
      ok: false,
      status: 500,
      text: () => Promise.resolve(JSON.stringify({ success: false, error: 'tunnel_inactive_after_restart', status: { installed: true, registered: true, active: false } })),
    }));
    const r = await new HttpAiClient('192.168.1.50').enableRemoteSupport('1234');
    expect(r.payload?.error).toBe('tunnel_inactive_after_restart');
    expect(r.payload?.status?.active).toBe(false);
  });
});

describe('HttpAiClient.userReply / phoneContext / cancel', () => {
  test('userReply succeeds on 200', async () => {
    stubFetch(async () => ({ ok: true, status: 200, text: () => Promise.resolve('') }));
    await expect(new HttpAiClient('192.168.1.50').userReply('s', 'q1', 'hi')).resolves.toBeUndefined();
  });

  test('userReply throws AiClientError on 4xx', async () => {
    stubFetch(async () => ({ ok: false, status: 400, text: () => Promise.resolve('bad') }));
    await expect(new HttpAiClient('192.168.1.50').userReply('s', 'q1', 'hi')).rejects.toMatchObject({ kind: 'http-bad-request' });
  });

  test('phoneContext throws on network failure', async () => {
    stubFetch(async () => {
      throw new Error('net');
    });
    await expect(new HttpAiClient('192.168.1.50').phoneContext('s', { foo: 'bar' })).rejects.toBeDefined();
  });

  test('cancel swallows errors', async () => {
    stubFetch(async () => {
      throw new Error('whatever');
    });
    await expect(new HttpAiClient('192.168.1.50').cancel('s')).resolves.toBeUndefined();
  });
});

describe('HttpAiClient.runAi — SSE over fetch + ReadableStream', () => {
  test('POSTs the prompt with Accept: text/event-stream and streams events → onEvent/onSeq/onComplete', async () => {
    const stream = sseResponse();
    const fetchMock = stubFetch(async () => stream.response);
    const c = new HttpAiClient('192.168.1.50');
    const onEvent = vi.fn();
    const onSeq = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    const handle = c.runAi('why disconnected?', undefined, { onEvent, onSeq, onComplete, onError });

    await waitFor(() => fetchMock.mock.calls.length === 1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://192.168.1.50:8083/troubleshoot');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ prompt: 'why disconnected?' });
    expect((init as any).headers.Accept).toBe('text/event-stream');

    stream.event({ type: 'session_started', session_id: 'sess-1', protocol_version: 3 }, { id: 0 });
    stream.event({ type: 'thought', payload: 'checking' }, { id: 1 });
    stream.event({ type: 'thought', payload: 'truncation marker' }, { id: -1 });
    stream.end();

    await waitFor(() => onComplete.mock.calls.length === 1);
    expect(onEvent).toHaveBeenCalledTimes(3);
    expect(onEvent.mock.calls[0]![0].type).toBe('session_started');
    expect(handle.sessionId).toBe('sess-1');
    expect(onSeq.mock.calls.map((c) => c[0])).toEqual([0, 1, null]);
    expect(onError).not.toHaveBeenCalled();
  });

  test('HTTP 503 → onError once (http-server, transient), onComplete never fires', async () => {
    stubFetch(async () => textResponse('boom', 503));
    const c = new HttpAiClient('192.168.1.50');
    const onComplete = vi.fn();
    const onError = vi.fn();
    c.runAi('hi', undefined, { onEvent: vi.fn(), onComplete, onError });
    await waitFor(() => onError.mock.calls.length === 1);
    await sleep(10);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ kind: 'http-server', transient: true, httpStatus: 503, message: 'boom' }));
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('429 mid-session → http-busy (not transient)', async () => {
    stubFetch(async () => textResponse('device busy', 429));
    const onError = vi.fn();
    new HttpAiClient('192.168.1.50').runAi('hi', undefined, { onEvent: vi.fn(), onError });
    await waitFor(() => onError.mock.calls.length === 1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ kind: 'http-busy', transient: false }));
  });

  test('non-JSON frame → sse-malformed but the stream continues', async () => {
    const stream = sseResponse();
    stubFetch(async () => stream.response);
    const onEvent = vi.fn();
    const onError = vi.fn();
    const onComplete = vi.fn();
    new HttpAiClient('192.168.1.50').runAi('hi', undefined, { onEvent, onError, onComplete });
    stream.push('data: not-json\n\n');
    stream.event({ type: 'thought', payload: 'ok' });
    stream.end();
    await waitFor(() => onComplete.mock.calls.length === 1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ kind: 'sse-malformed' }));
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  test('cancel() does not fire onError or onComplete afterwards and best-effort POSTs /cancel', async () => {
    const stream = sseResponse();
    const fetchMock = stubFetch(async (url: string) => (url.endsWith('/cancel') ? textResponse('{}') : stream.response));
    const c = new HttpAiClient('192.168.1.50');
    const onError = vi.fn();
    const onComplete = vi.fn();
    const session = c.runAi('hi', undefined, { onEvent: vi.fn(), onComplete, onError });
    await waitFor(() => fetchMock.mock.calls.length === 1);
    stream.event({ type: 'session_started', session_id: 'sess-2', protocol_version: 3 });
    await waitFor(() => session.sessionId === 'sess-2');

    session.cancel();
    stream.end();
    await sleep(20);

    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/cancel'))).toBe(true);
  });

  test('network failure → onError network (transient)', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const onError = vi.fn();
    new HttpAiClient('192.168.1.50').runAi('hi', undefined, { onEvent: vi.fn(), onError });
    await waitFor(() => onError.mock.calls.length === 1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ kind: 'network', transient: true }));
  });

  test('resume() GETs /troubleshoot/resume?session_id&from and 404 → http-not-found', async () => {
    const fetchMock = stubFetch(async () => textResponse('gone', 404));
    const onError = vi.fn();
    new HttpAiClient('192.168.1.50').resume('sess-9', 12, { onEvent: vi.fn(), onError });
    await waitFor(() => onError.mock.calls.length === 1);
    expect(String(fetchMock.mock.calls[0]![0])).toBe('http://192.168.1.50:8083/troubleshoot/resume?session_id=sess-9&from=12');
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe('GET');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ kind: 'http-not-found', transient: false }));
  });

  test('runTree() POSTs scenario_id to /troubleshoot/tree', async () => {
    const stream = sseResponse();
    const fetchMock = stubFetch(async () => stream.response);
    const onComplete = vi.fn();
    new HttpAiClient('192.168.1.50').runTree('disconnected', undefined, { onEvent: vi.fn(), onComplete });
    await waitFor(() => fetchMock.mock.calls.length === 1);
    expect(String(fetchMock.mock.calls[0]![0])).toBe('http://192.168.1.50:8083/troubleshoot/tree');
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)).toEqual({ scenario_id: 'disconnected' });
    stream.end();
    await waitFor(() => onComplete.mock.calls.length === 1);
  });
});

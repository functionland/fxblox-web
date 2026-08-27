import { describe, expect, test, vi } from 'vitest';
import { SseParser, openSse } from '../sse';
import { sseResponse, textResponse } from '@/test/helpers/sseResponse';
import { sleep, waitFor } from '@/test/helpers/waitFor';

describe('SseParser', () => {
  test('dispatches a single event on a blank line', () => {
    const p = new SseParser();
    expect(p.feed('data: hello\n\n')).toEqual([{ data: 'hello' }]);
  });

  test('joins multi-line data with \\n and carries id/event/retry', () => {
    const p = new SseParser();
    const out = p.feed('id: 7\nevent: thought\nretry: 250\ndata: a\ndata: b\n\n');
    expect(out).toEqual([{ data: 'a\nb', id: '7', event: 'thought', retry: 250 }]);
  });

  test('handles \\r\\n\\r\\n line endings', () => {
    const p = new SseParser();
    expect(p.feed('id: 1\r\ndata: x\r\n\r\ndata: y\r\n\r\n')).toEqual([{ data: 'x', id: '1' }, { data: 'y', id: '1' }]);
  });

  test('the last id persists across events until replaced', () => {
    const p = new SseParser();
    const out = p.feed('id: 3\ndata: a\n\ndata: b\n\nid: 4\ndata: c\n\n');
    expect(out.map((m) => m.id)).toEqual(['3', '3', '4']);
  });

  test('ignores comments and unknown fields; strips one leading space', () => {
    const p = new SseParser();
    expect(p.feed(': keep-alive\nfoo: bar\ndata:  two spaces\n\n')).toEqual([{ data: ' two spaces' }]);
  });

  test('buffers partial chunks across feeds (split mid-line and mid-CRLF)', () => {
    const p = new SseParser();
    expect(p.feed('da')).toEqual([]);
    expect(p.feed('ta: he')).toEqual([]);
    expect(p.feed('llo\r')).toEqual([]);
    expect(p.feed('\n\r')).toEqual([]);
    expect(p.feed('\n')).toEqual([{ data: 'hello' }]);
  });

  test('a lone \\r terminates a line (a trailing \\r is held back in case a \\n follows)', () => {
    const p = new SseParser();
    expect(p.feed('data: a\r\rdata: b\r\r')).toEqual([{ data: 'a' }]);
    expect(p.end()).toEqual([{ data: 'b' }]);
    const q = new SseParser();
    expect(q.feed('data: a\r\rdata: b\r\rdata: c\n')).toEqual([{ data: 'a' }, { data: 'b' }]);
  });

  test('end() flushes an unterminated final event', () => {
    const p = new SseParser();
    expect(p.feed('data: tail')).toEqual([]);
    expect(p.end()).toEqual([{ data: 'tail' }]);
    expect(p.end()).toEqual([]);
  });

  test('an event with no data lines is not dispatched', () => {
    const p = new SseParser();
    expect(p.feed('event: ping\n\n')).toEqual([]);
  });

  test('a stream ending in a bare \\r treats it as a terminator (no stray \\r in the data)', () => {
    const p = new SseParser();
    expect(p.feed('data: tail\r')).toEqual([]);
    expect(p.end()).toEqual([{ data: 'tail' }]);
  });

  test('retry: is ignored unless it is all ASCII digits', () => {
    const p = new SseParser();
    expect(p.feed('retry: \ndata: a\n\n')).toEqual([{ data: 'a' }]);
    expect(p.feed('retry: 12ms\ndata: b\n\n')).toEqual([{ data: 'b' }]);
    expect(p.feed('retry: 300\ndata: c\n\n')).toEqual([{ data: 'c', retry: 300 }]);
  });
});

describe('openSse', () => {
  test('streams messages then onClose exactly once', async () => {
    const stream = sseResponse();
    const onMessage = vi.fn();
    const onClose = vi.fn();
    const onError = vi.fn();
    const onOpen = vi.fn();
    openSse('http://x/stream', { method: 'POST', body: '{}', fetchImpl: async () => stream.response }, { onOpen, onMessage, onClose, onError });
    stream.event({ a: 1 }, { id: 1 });
    stream.push('data: raw\n\n');
    stream.end();
    await waitFor(() => onClose.mock.calls.length === 1);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls.map((c) => c[0])).toEqual([{ data: '{"a":1}', id: '1' }, { data: 'raw', id: '1' }]);
    expect(onError).not.toHaveBeenCalled();
  });

  test('sends Accept: text/event-stream and the caller headers/body', async () => {
    const fetchImpl = vi.fn(async () => textResponse('', 200));
    openSse('http://x/s', { method: 'POST', body: 'b', headers: { 'Content-Type': 'application/json' }, fetchImpl }, { onMessage: vi.fn() });
    await waitFor(() => fetchImpl.mock.calls.length === 1);
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('b');
    expect((init.headers as Record<string, string>).Accept).toBe('text/event-stream');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  test('non-2xx → onError {kind: http, status, body}; no onClose', async () => {
    const onError = vi.fn();
    const onClose = vi.fn();
    openSse('http://x/s', { fetchImpl: async () => textResponse('busy', 429) }, { onMessage: vi.fn(), onError, onClose });
    await waitFor(() => onError.mock.calls.length === 1);
    await sleep(5);
    expect(onError).toHaveBeenCalledWith({ kind: 'http', status: 429, message: 'busy', body: 'busy' });
    expect(onClose).not.toHaveBeenCalled();
  });

  test('fetch rejection → onError {kind: network}', async () => {
    const onError = vi.fn();
    openSse('http://x/s', { fetchImpl: async () => Promise.reject(new TypeError('Failed to fetch')) }, { onMessage: vi.fn(), onError });
    await waitFor(() => onError.mock.calls.length === 1);
    expect(onError.mock.calls[0]![0]).toEqual(expect.objectContaining({ kind: 'network', message: 'Failed to fetch' }));
  });

  test('close() before the response arrives → no callbacks at all', async () => {
    let resolveFetch: (r: Response) => void = () => undefined;
    const onMessage = vi.fn();
    const onClose = vi.fn();
    const onError = vi.fn();
    const handle = openSse('http://x/s', { fetchImpl: () => new Promise<Response>((r) => (resolveFetch = r)) }, { onMessage, onClose, onError });
    handle.close();
    expect(handle.closed).toBe(true);
    const stream = sseResponse();
    resolveFetch(stream.response);
    stream.event({ x: 1 });
    stream.end();
    await sleep(20);
    expect(onMessage).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  test('close() mid-stream stops delivery and fires nothing', async () => {
    const stream = sseResponse();
    const onMessage = vi.fn();
    const onClose = vi.fn();
    const onError = vi.fn();
    const handle = openSse('http://x/s', { fetchImpl: async () => stream.response }, { onMessage, onClose, onError });
    stream.event({ n: 1 });
    await waitFor(() => onMessage.mock.calls.length === 1);
    handle.close();
    stream.event({ n: 2 });
    stream.end();
    await sleep(20);
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  test('external AbortSignal → onError {kind: aborted}', async () => {
    const ac = new AbortController();
    const onError = vi.fn();
    const fetchImpl = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      })) as unknown as typeof fetch;
    openSse('http://x/s', { signal: ac.signal, fetchImpl }, { onMessage: vi.fn(), onError });
    ac.abort();
    await waitFor(() => onError.mock.calls.length === 1);
    expect(onError.mock.calls[0]![0]).toEqual(expect.objectContaining({ kind: 'aborted' }));
  });

  test('a throwing onMessage handler does not break the stream', async () => {
    const stream = sseResponse();
    const onClose = vi.fn();
    const seen: string[] = [];
    openSse(
      'http://x/s',
      { fetchImpl: async () => stream.response },
      {
        onMessage: (m) => {
          seen.push(m.data);
          throw new Error('handler blew up');
        },
        onClose,
      },
    );
    stream.event('1');
    stream.event('2');
    stream.end();
    await waitFor(() => onClose.mock.calls.length === 1);
    expect(seen).toEqual(['1', '2']);
  });
});

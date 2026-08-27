/**
 * SSE over fetch + ReadableStream — the `react-native-sse` replacement. Supports POST with a body (the Blox AI
 * `/troubleshoot` endpoints stream the response of a POST), `data:` multi-line join, `id:`, `event:`, `retry:`,
 * comment lines, and both `\n\n` and `\r\n\r\n` dispatch (the parser is line-based per the WHATWG spec, so a lone
 * `\r` also terminates a line).
 */

export interface SseMessage {
  data: string;
  id?: string;
  event?: string;
  retry?: number;
}

/** Incremental parser: feed decoded text chunks, get dispatched messages back. */
export class SseParser {
  private buffer = '';
  private dataLines: string[] = [];
  private eventName: string | undefined;
  private lastId: string | undefined;
  private retry: number | undefined;

  feed(chunk: string): SseMessage[] {
    this.buffer += chunk;
    const out: SseMessage[] = [];
    // Consume complete lines; a trailing '\r' may be the first half of '\r\n', so keep it buffered.
    let idx: number;
    while ((idx = this.findLineEnd()) !== -1) {
      const line = this.buffer.slice(0, idx);
      let skip = 1;
      if (this.buffer[idx] === '\r' && this.buffer[idx + 1] === '\n') skip = 2;
      this.buffer = this.buffer.slice(idx + skip);
      const msg = this.handleLine(line);
      if (msg) out.push(msg);
    }
    return out;
  }

  /** Flush at end of stream: an unterminated final line + pending event are dispatched. */
  end(): SseMessage[] {
    const out: SseMessage[] = [];
    // A trailing '\r' that was held back (possible "\r\n" split) is a line terminator now that the stream ended.
    if (this.buffer.endsWith('\r')) {
      const line = this.buffer.slice(0, -1);
      this.buffer = '';
      const msg = this.handleLine(line);
      if (msg) out.push(msg);
    } else if (this.buffer.length) {
      const msg = this.handleLine(this.buffer);
      this.buffer = '';
      if (msg) out.push(msg);
    }
    const tail = this.dispatch();
    if (tail) out.push(tail);
    return out;
  }

  private findLineEnd(): number {
    for (let i = 0; i < this.buffer.length; i++) {
      const c = this.buffer[i];
      if (c === '\n') return i;
      if (c === '\r') {
        if (i === this.buffer.length - 1) return -1; // might be "\r\n" split across chunks
        return i;
      }
    }
    return -1;
  }

  private handleLine(line: string): SseMessage | null {
    if (line === '') return this.dispatch();
    if (line.startsWith(':')) return null; // comment
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    switch (field) {
      case 'data':
        this.dataLines.push(value);
        break;
      case 'event':
        this.eventName = value;
        break;
      case 'id':
        if (!value.includes('\0')) this.lastId = value;
        break;
      case 'retry': {
        // Spec: only ASCII digits; anything else (including an empty value) is ignored.
        if (/^\d+$/.test(value)) this.retry = Number(value);
        break;
      }
      default:
        break; // unknown field: ignore
    }
    return null;
  }

  private dispatch(): SseMessage | null {
    if (this.dataLines.length === 0) {
      this.eventName = undefined;
      return null;
    }
    const msg: SseMessage = { data: this.dataLines.join('\n') };
    if (this.lastId !== undefined) msg.id = this.lastId;
    if (this.eventName !== undefined && this.eventName !== '') msg.event = this.eventName;
    if (this.retry !== undefined) msg.retry = this.retry;
    this.dataLines = [];
    this.eventName = undefined;
    return msg;
  }
}

export type SseErrorKind = 'http' | 'network' | 'aborted';

export interface SseError {
  kind: SseErrorKind;
  message: string;
  status?: number;
  body?: string;
}

export interface SseHandlers {
  onOpen?: (response: Response) => void;
  onMessage: (message: SseMessage) => void;
  onError?: (error: SseError) => void;
  /** Clean end of stream (server closed after the last event). Not called after an error or a close(). */
  onClose?: () => void;
}

export interface SseRequestInit {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Bytes of an error body to keep for the error message (default 4 KiB). */
  errorBodyCap?: number;
}

export interface SseHandle {
  close(): void;
  readonly closed: boolean;
}

function isAbortError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'AbortError';
}

/**
 * Open a stream. Exactly one terminal callback fires: `onError` or `onClose`; nothing fires after `close()`.
 */
export function openSse(url: string, init: SseRequestInit, handlers: SseHandlers): SseHandle {
  const controller = new AbortController();
  let closed = false;
  let terminal = false;
  const fetchImpl = init.fetchImpl ?? fetch;

  const fail = (err: SseError) => {
    if (closed || terminal) return;
    terminal = true;
    try {
      handlers.onError?.(err);
    } catch {
      /* swallow */
    }
  };
  const finish = () => {
    if (closed || terminal) return;
    terminal = true;
    try {
      handlers.onClose?.();
    } catch {
      /* swallow */
    }
  };

  if (init.signal) {
    if (init.signal.aborted) controller.abort();
    else init.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  void (async () => {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: init.method ?? 'GET',
        headers: { Accept: 'text/event-stream', ...(init.headers ?? {}) },
        body: init.body,
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
      });
    } catch (e) {
      if (closed) return;
      if (isAbortError(e)) fail({ kind: 'aborted', message: 'aborted' });
      else fail({ kind: 'network', message: e instanceof Error ? e.message : String(e) });
      return;
    }
    if (closed) return;
    if (!response.ok) {
      let body = '';
      try {
        body = (await response.text()).slice(0, init.errorBodyCap ?? 4096);
      } catch {
        /* ignore */
      }
      fail({ kind: 'http', status: response.status, message: body || `HTTP ${response.status}`, body });
      return;
    }
    try {
      handlers.onOpen?.(response);
    } catch {
      /* swallow */
    }
    if (!response.body) {
      finish();
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (closed) return;
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const msg of parser.feed(text)) {
          if (closed) return;
          try {
            handlers.onMessage(msg);
          } catch {
            /* swallow */
          }
        }
      }
      const tailText = decoder.decode();
      const tail = [...(tailText ? parser.feed(tailText) : []), ...parser.end()];
      for (const msg of tail) {
        if (closed) return;
        try {
          handlers.onMessage(msg);
        } catch {
          /* swallow */
        }
      }
      finish();
    } catch (e) {
      if (closed) return;
      if (isAbortError(e)) fail({ kind: 'aborted', message: 'aborted' });
      else fail({ kind: 'network', message: e instanceof Error ? e.message : String(e) });
    }
  })();

  return {
    get closed() {
      return closed;
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        controller.abort();
      } catch {
        /* ignore */
      }
    },
  };
}

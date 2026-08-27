/**
 * Build a `Response` whose body is a ReadableStream of SSE text — the fetch-backed replacement for the mobile
 * `react-native-sse` mocks. `push()` writes a chunk, `end()` closes the stream, `error()` errors it.
 */
export interface SseStreamController {
  response: Response;
  push: (text: string) => void;
  event: (data: unknown, opts?: { id?: string | number; event?: string }) => void;
  end: () => void;
  error: (e?: unknown) => void;
}

export function sseResponse(init: { status?: number; headers?: Record<string, string> } = {}): SseStreamController {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const response = new Response(stream, {
    status: init.status ?? 200,
    headers: { 'content-type': 'text/event-stream', ...(init.headers ?? {}) },
  });
  let closed = false;
  return {
    response,
    push: (text) => {
      if (!closed) controller.enqueue(encoder.encode(text));
    },
    event: (data, opts = {}) => {
      let text = '';
      if (opts.id !== undefined) text += `id: ${opts.id}\n`;
      if (opts.event) text += `event: ${opts.event}\n`;
      text += `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;
      if (!closed) controller.enqueue(encoder.encode(text));
    },
    end: () => {
      if (!closed) {
        closed = true;
        controller.close();
      }
    },
    error: (e = new Error('stream error')) => {
      if (!closed) {
        closed = true;
        controller.error(e);
      }
    },
  };
}

/** A plain text/JSON `Response` (non-streaming). */
export function textResponse(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers });
}

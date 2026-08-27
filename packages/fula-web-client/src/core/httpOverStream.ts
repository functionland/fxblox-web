/**
 * HTTP/1.1 over a libp2p stream — hand-rolled request writer + response parser.
 *
 * Why hand-rolled (plan §WS1, resolved by the spike): the Blox side is kubo's `p2p listen` forwarder
 * (`kubo/p2p/stream.go`) in front of go-fula's plain `net/http` server. Two kubo facts shape this file:
 *
 *  1. The forwarder FULL-closes the libp2p stream as soon as the client half-closes its write side. So we must
 *     NEVER close our write side before the complete response has been read (`requestOverDuplex` only calls
 *     `close()` after the parser reports `done`).
 *  2. We send `Connection: close`, so Go's server closes the TCP side after the body and kubo then closes the
 *     stream → EOF is a legitimate body terminator (for read-to-EOF bodies *and* for chunked bodies whose
 *     `0\r\n\r\n` trailer got cut). Content-Length and chunked framing are still honoured when present.
 *
 * Everything touches the stream through the tiny `ByteDuplex` adapter so the libp2p stream API (v3: EventTarget
 * + async-iterable, `send()` with back-pressure) is isolated in one function.
 *
 * Limits: 8 KiB for the status line + headers, 4 MiB for the body (plan §WS1).
 */
import type { Stream } from '@libp2p/interface';
import { Uint8ArrayList } from 'uint8arraylist';
import { concat, utf8 } from './encoding.js';
import { FulaWebError } from './errors.js';

export const DEFAULT_MAX_HEADER_BYTES = 8 * 1024;
export const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_CHUNK_SIZE_LINE = 1024;

const CRLF = utf8('\r\n');
const CRLFCRLF = utf8('\r\n\r\n');
const textDecoder = new TextDecoder();

/** Minimal byte-level duplex. Implemented for libp2p streams here and by an in-memory fake in the tests. */
export interface ByteDuplex {
  /** Write bytes, honouring back-pressure. */
  write(data: Uint8Array): Promise<void>;
  /** Bytes from the remote until it closes its write side (EOF) — or throws if the stream is reset. */
  read(): AsyncIterable<Uint8Array>;
  /** Half-close: no more writes from us. Only call once the full response has been read (kubo rule). */
  close(): Promise<void>;
  /** Tear everything down. */
  abort(err: Error): void;
}

/**
 * Adapter for a js-libp2p v3 `Stream`.
 * - `send()` returns false when the muxer's write buffer is full → wait for `drain` (`onDrain()`).
 * - async iteration yields `message` events and ends on `remoteCloseWrite`; a reset surfaces as a thrown error.
 */
/** Bytes handed to `stream.send()` at a time — keeps the muxer's write buffer small for large bodies. */
export const WRITE_CHUNK_BYTES = 64 * 1024;

export function streamToByteDuplex(stream: Stream): ByteDuplex {
  return {
    async write(data: Uint8Array): Promise<void> {
      for (let off = 0; off < data.byteLength; off += WRITE_CHUNK_BYTES) {
        const slice = data.subarray(off, Math.min(off + WRITE_CHUNK_BYTES, data.byteLength));
        if (!stream.send(slice)) await stream.onDrain();
      }
    },
    read(): AsyncIterable<Uint8Array> {
      return (async function* () {
        for await (const chunk of stream) {
          yield chunk instanceof Uint8Array ? chunk : chunk.subarray();
        }
      })();
    },
    close(): Promise<void> {
      return stream.close();
    },
    abort(err: Error): void {
      stream.abort(err);
    },
  };
}

export interface HttpRequestInit {
  /** Defaults to POST — go-fula never checks the method, only `path.Base(url)` is signed. */
  method?: string;
  /** e.g. `/blox-free-space` */
  path: string;
  /** `<bloxPeerId>.invalid`, exactly what go-fula's own client sends. */
  host: string;
  headers?: Record<string, string>;
  body?: Uint8Array;
}

function assertHeaderSafe(name: string, value: string): void {
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
    throw new FulaWebError('INVALID_ARGUMENT', `invalid HTTP header name: ${JSON.stringify(name)}`);
  }
  if (/[\r\n\0]/.test(value)) {
    throw new FulaWebError('INVALID_ARGUMENT', `invalid HTTP header value for ${name}`);
  }
}

/**
 * Serialises a request the way go-fula's `net/http` server expects. Defaults (`Content-Type`, `Content-Length`,
 * `Connection: close`) are skipped when the caller supplies the same header (case-insensitively).
 */
export function serializeRequest(req: HttpRequestInit): Uint8Array {
  const method = req.method ?? 'POST';
  const body = req.body ?? new Uint8Array(0);
  const userHeaders = req.headers ?? {};
  const has = (name: string): boolean => Object.keys(userHeaders).some((k) => k.toLowerCase() === name.toLowerCase());

  if (!/^[A-Z]+$/.test(method)) throw new FulaWebError('INVALID_ARGUMENT', `invalid HTTP method ${method}`);
  if (!req.path.startsWith('/') || /[\s\r\n]/.test(req.path)) {
    throw new FulaWebError('INVALID_ARGUMENT', `invalid request path ${JSON.stringify(req.path)}`);
  }
  assertHeaderSafe('Host', req.host);

  const lines = [`${method} ${req.path} HTTP/1.1`, `Host: ${req.host}`];
  if (!has('user-agent')) lines.push('User-Agent: fula-web-client');
  if (body.length > 0 && !has('content-type')) lines.push('Content-Type: application/json');
  if (!has('content-length')) lines.push(`Content-Length: ${body.length}`);
  if (!has('connection')) lines.push('Connection: close');
  for (const [k, v] of Object.entries(userHeaders)) {
    assertHeaderSafe(k, v);
    lines.push(`${k}: ${v}`);
  }
  return concat([utf8(lines.join('\r\n') + '\r\n\r\n'), body]);
}

export interface HttpResponse {
  status: number;
  statusText: string;
  /** Header names lower-cased; duplicates joined with ", ". */
  headers: Record<string, string>;
  body: Uint8Array;
}

export interface ParserLimits {
  maxHeaderBytes?: number;
  maxBodyBytes?: number;
}

type BodyMode = 'none' | 'length' | 'chunked' | 'eof';
type ChunkState = 'size' | 'data' | 'data-crlf' | 'trailers';

function bad(message: string): FulaWebError {
  return new FulaWebError('BAD_RESPONSE', message);
}

/**
 * Incremental HTTP/1.1 response parser. Feed bytes with `push()`, signal EOF with `end()`, read `done`.
 * Extra bytes after the body are ignored.
 */
export class HttpResponseParser {
  private readonly maxHeaderBytes: number;
  private readonly maxBodyBytes: number;
  private readonly buf = new Uint8ArrayList();
  private readonly body = new Uint8ArrayList();
  private phase: 'head' | 'body' | 'done' = 'head';
  private mode: BodyMode = 'eof';
  private remaining = 0;
  private chunkState: ChunkState = 'size';
  private chunkRemaining = 0;
  private trailerBytes = 0;
  private status = 0;
  private statusText = '';
  private headers: Record<string, string> = {};
  private bytesSeen = 0;

  constructor(limits: ParserLimits = {}) {
    this.maxHeaderBytes = limits.maxHeaderBytes ?? DEFAULT_MAX_HEADER_BYTES;
    this.maxBodyBytes = limits.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  }

  get done(): boolean {
    return this.phase === 'done';
  }

  /** Total bytes pushed (for relay byte accounting). */
  get bytesRead(): number {
    return this.bytesSeen;
  }

  /** Headers are available as soon as the head has been parsed (before the body completes). */
  get headersParsed(): boolean {
    return this.phase !== 'head';
  }

  push(chunk: Uint8Array): void {
    this.bytesSeen += chunk.byteLength;
    if (this.phase === 'done') return;
    this.buf.append(chunk);
    this.process();
  }

  /** The remote closed its write side. Decides whether what we have is a complete response. */
  end(): void {
    if (this.phase === 'done') return;
    if (this.phase === 'head') {
      throw bad(
        this.buf.byteLength === 0
          ? 'empty response: the stream was closed before any bytes arrived'
          : 'stream closed before the response headers were complete',
      );
    }
    switch (this.mode) {
      case 'eof':
        this.finish();
        return;
      case 'length':
        throw bad(`truncated response body: ${this.remaining} of ${this.remaining + this.body.byteLength} bytes missing`);
      case 'chunked':
        // `Connection: close` → Go closes after the last chunk; kubo may cut the `0\r\n\r\n` trailer. EOF at a
        // chunk boundary (or inside the trailer section) is therefore accepted as the end of the body.
        if ((this.chunkState === 'size' && this.buf.byteLength === 0) || this.chunkState === 'trailers') {
          this.finish();
          return;
        }
        throw bad('truncated chunked response body');
      case 'none':
        this.finish();
    }
  }

  result(): HttpResponse {
    if (this.phase !== 'done') throw bad('response not complete');
    return { status: this.status, statusText: this.statusText, headers: this.headers, body: this.body.subarray() };
  }

  private finish(): void {
    this.phase = 'done';
    this.buf.consume(this.buf.byteLength);
  }

  private appendBody(bytes: Uint8Array): void {
    if (this.body.byteLength + bytes.byteLength > this.maxBodyBytes) {
      throw bad(`response body exceeds the ${this.maxBodyBytes} byte limit`);
    }
    this.body.append(bytes);
  }

  private process(): void {
    if (this.phase === 'head') {
      const idx = this.buf.indexOf(CRLFCRLF);
      if (idx === -1) {
        if (this.buf.byteLength > this.maxHeaderBytes) throw bad(`response headers exceed the ${this.maxHeaderBytes} byte limit`);
        return;
      }
      if (idx + 4 > this.maxHeaderBytes) throw bad(`response headers exceed the ${this.maxHeaderBytes} byte limit`);
      const head = textDecoder.decode(this.buf.subarray(0, idx));
      this.buf.consume(idx + 4);
      this.parseHead(head);
      this.phase = 'body';
      if (this.mode === 'none') {
        this.finish();
        return;
      }
    }
    if (this.phase === 'body') this.processBody();
  }

  private parseHead(head: string): void {
    const lines = head.split('\r\n');
    const statusLine = lines[0] ?? '';
    const m = /^HTTP\/1\.[01] (\d{3})(?: (.*))?$/.exec(statusLine);
    if (m === null) throw bad(`invalid HTTP status line: ${JSON.stringify(statusLine.slice(0, 80))}`);
    this.status = Number(m[1]);
    this.statusText = m[2] ?? '';
    const headers: Record<string, string> = {};
    for (const line of lines.slice(1)) {
      if (line.length === 0) continue;
      const colon = line.indexOf(':');
      if (colon <= 0) throw bad(`invalid HTTP header line: ${JSON.stringify(line.slice(0, 80))}`);
      const name = line.slice(0, colon).trim().toLowerCase();
      const value = line.slice(colon + 1).trim();
      headers[name] = name in headers ? `${headers[name]}, ${value}` : value;
    }
    this.headers = headers;

    const te = headers['transfer-encoding'];
    const cl = headers['content-length'];
    if ((this.status >= 100 && this.status < 200) || this.status === 204 || this.status === 304) {
      this.mode = 'none';
    } else if (te !== undefined && te.toLowerCase().split(',').map((s) => s.trim()).includes('chunked')) {
      this.mode = 'chunked';
      this.chunkState = 'size';
    } else if (cl !== undefined) {
      if (!/^\d+$/.test(cl)) throw bad(`invalid Content-Length: ${JSON.stringify(cl)}`);
      this.remaining = Number(cl);
      if (this.remaining > this.maxBodyBytes) throw bad(`response body exceeds the ${this.maxBodyBytes} byte limit`);
      this.mode = this.remaining === 0 ? 'none' : 'length';
    } else {
      this.mode = 'eof';
    }
  }

  private processBody(): void {
    switch (this.mode) {
      case 'length': {
        const take = Math.min(this.remaining, this.buf.byteLength);
        if (take > 0) {
          this.appendBody(this.buf.subarray(0, take));
          this.buf.consume(take);
          this.remaining -= take;
        }
        if (this.remaining === 0) this.finish();
        return;
      }
      case 'eof': {
        if (this.buf.byteLength > 0) {
          this.appendBody(this.buf.subarray());
          this.buf.consume(this.buf.byteLength);
        }
        return;
      }
      case 'chunked':
        this.processChunked();
        return;
      case 'none':
        this.finish();
    }
  }

  private processChunked(): void {
    for (;;) {
      if (this.chunkState === 'size') {
        const idx = this.buf.indexOf(CRLF);
        if (idx === -1) {
          if (this.buf.byteLength > MAX_CHUNK_SIZE_LINE) throw bad('chunk size line too long');
          return;
        }
        const line = textDecoder.decode(this.buf.subarray(0, idx));
        this.buf.consume(idx + 2);
        const sizeStr = (line.split(';')[0] ?? '').trim();
        if (!/^[0-9a-fA-F]{1,16}$/.test(sizeStr)) throw bad(`invalid chunk size: ${JSON.stringify(line.slice(0, 40))}`);
        const size = Number.parseInt(sizeStr, 16);
        if (size === 0) {
          this.chunkState = 'trailers';
        } else {
          this.chunkRemaining = size;
          this.chunkState = 'data';
        }
      }
      if (this.chunkState === 'data') {
        const take = Math.min(this.chunkRemaining, this.buf.byteLength);
        if (take === 0) return;
        this.appendBody(this.buf.subarray(0, take));
        this.buf.consume(take);
        this.chunkRemaining -= take;
        if (this.chunkRemaining > 0) return;
        this.chunkState = 'data-crlf';
      }
      if (this.chunkState === 'data-crlf') {
        if (this.buf.byteLength < 2) return;
        if (this.buf.get(0) !== 13 || this.buf.get(1) !== 10) throw bad('missing CRLF after chunk data');
        this.buf.consume(2);
        this.chunkState = 'size';
        continue;
      }
      if (this.chunkState === 'trailers') {
        for (;;) {
          const idx = this.buf.indexOf(CRLF);
          if (idx === -1) {
            if (this.buf.byteLength + this.trailerBytes > this.maxHeaderBytes) throw bad('chunked trailers too long');
            return;
          }
          const lineLength = idx;
          this.buf.consume(idx + 2);
          // total trailer bytes are capped like headers, so a hostile peer cannot keep us reading forever
          this.trailerBytes += idx + 2;
          if (this.trailerBytes > this.maxHeaderBytes) throw bad('chunked trailers too long');
          if (lineLength === 0) {
            this.finish();
            return;
          }
          // trailer headers are ignored
        }
      }
    }
  }
}

export interface RequestOptions extends ParserLimits {
  signal?: AbortSignal;
}

export interface RequestResult {
  response: HttpResponse;
  bytesWritten: number;
  bytesRead: number;
}

/**
 * One request → one response over a fresh stream. The write side is only closed after the whole response has
 * been consumed (see the header comment). Aborting the signal tears the duplex down and rejects with TIMEOUT.
 */
export async function requestOverDuplex(duplex: ByteDuplex, req: HttpRequestInit, opts: RequestOptions = {}): Promise<RequestResult> {
  const run = async (): Promise<RequestResult> => {
    const bytes = serializeRequest(req);
    // Write and read concurrently: if the server answers before it has consumed the whole request (e.g. an early
    // 401 on a large body) a sequential `await write` could stall on muxer back-pressure while the response sits
    // unread. Deliberately NO duplex.close() before the full read — kubo's forwarder would full-close the stream
    // and drop the response.
    let writeDone = false;
    let writeError: unknown;
    const writing = duplex.write(bytes).then(
      () => {
        writeDone = true;
      },
      (e: unknown) => {
        writeError = e;
      },
    );
    const parser = new HttpResponseParser(opts);
    try {
      for await (const chunk of duplex.read()) {
        parser.push(chunk);
        if (parser.done) break;
      }
    } catch (e) {
      // a write failure (reset) is the root cause when the read then fails too
      throw writeError ?? e;
    }
    if (!parser.done) {
      if (writeError !== undefined) throw writeError;
      parser.end();
    }
    if (writeDone) {
      // Full response in hand: now the half-close is safe (kubo will tear the forwarder down — expected).
      await duplex.close().catch(() => undefined);
    } else if (writeError === undefined) {
      // The server finished without reading all of our request — nothing left to wait for.
      duplex.abort(new Error('response completed before the request was fully sent'));
    }
    await writing;
    return { response: parser.result(), bytesWritten: bytes.byteLength, bytesRead: parser.bytesRead };
  };

  const signal = opts.signal;
  if (signal === undefined) return run();
  if (signal.aborted) {
    duplex.abort(new Error('request aborted before start'));
    throw new FulaWebError('TIMEOUT', 'request aborted before it started');
  }
  return new Promise<RequestResult>((resolve, reject) => {
    const onAbort = (): void => {
      duplex.abort(new Error('request aborted'));
      reject(new FulaWebError('TIMEOUT', 'request timed out or was aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    run().then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Request parsing — used by the Node test box (and by tools/fake-blox later) to play the go-fula side.
// ---------------------------------------------------------------------------------------------------------------

export interface HttpRequest {
  method: string;
  path: string;
  /** Header names lower-cased. */
  headers: Record<string, string>;
  body: Uint8Array;
}

/** Incremental HTTP/1.1 request parser (Content-Length bodies only, which is all go-fula's client ever sends). */
export class HttpRequestParser {
  private readonly buf = new Uint8ArrayList();
  private head: { method: string; path: string; headers: Record<string, string> } | undefined;
  private contentLength = 0;
  private result: HttpRequest | undefined;

  constructor(private readonly maxHeaderBytes = DEFAULT_MAX_HEADER_BYTES, private readonly maxBodyBytes = DEFAULT_MAX_BODY_BYTES) {}

  get done(): boolean {
    return this.result !== undefined;
  }

  push(chunk: Uint8Array): HttpRequest | undefined {
    if (this.result !== undefined) return this.result;
    this.buf.append(chunk);
    if (this.head === undefined) {
      const idx = this.buf.indexOf(CRLFCRLF);
      if (idx === -1) {
        if (this.buf.byteLength > this.maxHeaderBytes) throw new Error('request headers too large');
        return undefined;
      }
      const lines = textDecoder.decode(this.buf.subarray(0, idx)).split('\r\n');
      this.buf.consume(idx + 4);
      const m = /^([A-Z]+) (\S+) HTTP\/1\.[01]$/.exec(lines[0] ?? '');
      if (m === null) throw new Error(`invalid request line: ${lines[0]}`);
      const headers: Record<string, string> = {};
      for (const line of lines.slice(1)) {
        const colon = line.indexOf(':');
        if (colon <= 0) throw new Error(`invalid request header: ${line}`);
        headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
      }
      this.head = { method: m[1] ?? '', path: m[2] ?? '', headers };
      this.contentLength = Number(headers['content-length'] ?? '0');
      if (!Number.isFinite(this.contentLength) || this.contentLength > this.maxBodyBytes) throw new Error('bad Content-Length');
    }
    if (this.buf.byteLength >= this.contentLength) {
      const body = this.buf.subarray(0, this.contentLength);
      this.buf.consume(this.contentLength);
      this.result = { ...this.head, body };
    }
    return this.result;
  }
}

/** Serialises a response for the test box / fake Blox (`Connection: close` semantics, like go-fula). */
export function serializeResponse(status: number, statusText: string, headers: Record<string, string>, body?: Uint8Array): Uint8Array {
  const lines = [`HTTP/1.1 ${status} ${statusText}`];
  for (const [k, v] of Object.entries(headers)) lines.push(`${k}: ${v}`);
  const head = utf8(lines.join('\r\n') + '\r\n\r\n');
  return body === undefined ? head : concat([head, body]);
}

export function decodeText(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

import { describe, expect, it } from 'vitest';
import { utf8 } from '../src/core/encoding.js';
import { FulaWebError } from '../src/core/errors.js';
import {
  HttpRequestParser,
  HttpResponseParser,
  decodeText,
  requestOverDuplex,
  serializeRequest,
  serializeResponse,
} from '../src/core/httpOverStream.js';
import { createKuboPair } from './helpers/memoryDuplex.js';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function parse(chunks: Array<string | Uint8Array>, eof = true, limits?: { maxHeaderBytes?: number; maxBodyBytes?: number }): HttpResponseParser {
  const p = new HttpResponseParser(limits);
  for (const c of chunks) {
    p.push(typeof c === 'string' ? utf8(c) : c);
    if (p.done) break;
  }
  if (!p.done && eof) p.end();
  return p;
}

describe('serializeRequest', () => {
  it('writes the exact wire format go-fula expects (POST, Host <peer>.invalid, Connection: close)', () => {
    const bytes = serializeRequest({
      path: '/blox-free-space',
      host: '12D3KooWPnaMDrD7QLZKiT2iktjm9Kucx7XEPrSCUS6TTBbYuiRj.invalid',
      headers: { 'X-Fula-Peer-ID': 'p', 'X-Fula-Timestamp': '1756166400', 'X-Fula-Signature': 'c2ln' },
      body: utf8('{}'),
    });
    expect(decodeText(bytes)).toBe(
      'POST /blox-free-space HTTP/1.1\r\n' +
        'Host: 12D3KooWPnaMDrD7QLZKiT2iktjm9Kucx7XEPrSCUS6TTBbYuiRj.invalid\r\n' +
        'User-Agent: fula-web-client\r\n' +
        'Content-Type: application/json\r\n' +
        'Content-Length: 2\r\n' +
        'Connection: close\r\n' +
        'X-Fula-Peer-ID: p\r\n' +
        'X-Fula-Timestamp: 1756166400\r\n' +
        'X-Fula-Signature: c2ln\r\n' +
        '\r\n' +
        '{}',
    );
  });

  it('omits Content-Type for a body-less GET and rejects header injection', () => {
    const text = decodeText(serializeRequest({ method: 'GET', path: '/', host: 'x.invalid' }));
    expect(text).toContain('GET / HTTP/1.1\r\n');
    expect(text).not.toContain('Content-Type');
    expect(text).toContain('Content-Length: 0\r\n');
    expect(() => serializeRequest({ path: '/a', host: 'x.invalid', headers: { 'X-Evil': 'a\r\nInjected: 1' } })).toThrow(FulaWebError);
    expect(() => serializeRequest({ path: 'no-slash', host: 'x.invalid' })).toThrow(FulaWebError);
  });
});

describe('HttpResponseParser', () => {
  it('parses a Content-Length body delivered in arbitrary chunk boundaries', () => {
    const p = parse(['HTTP/1.1 200 OK\r\nContent-Ty', 'pe: application/json\r\nContent-Length: 13\r\n\r\n{"a"', ':1,"b":2}', 'trailing junk'], false);
    expect(p.done).toBe(true);
    const r = p.result();
    expect(r.status).toBe(200);
    expect(r.statusText).toBe('OK');
    expect(r.headers['content-type']).toBe('application/json');
    expect(decodeText(r.body)).toBe('{"a":1,"b":2}');
  });

  it('parses chunked bodies (extensions, split chunks, trailers)', () => {
    const p = parse(['HTTP/1.1 202 Accepted\r\nTransfer-Encoding: chunked\r\n\r\n', '5;ext=1\r\nhel', 'lo\r\n', '6\r\n world\r\n', '0\r\nX-Trailer: 1\r\n\r\n'], false);
    expect(p.done).toBe(true);
    expect(decodeText(p.result().body)).toBe('hello world');
    expect(p.result().status).toBe(202);
  });

  it('accepts EOF at a chunk boundary as the terminator (Connection: close through kubo)', () => {
    const p = parse(['HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n', '3\r\nabc\r\n', '2\r\nde\r\n']);
    expect(p.done).toBe(true);
    expect(decodeText(p.result().body)).toBe('abcde');
  });

  it('rejects EOF in the middle of a chunk', () => {
    expect(() => parse(['HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n', '10\r\nabc'])).toThrow(/truncated chunked/);
  });

  it('reads to EOF when neither Content-Length nor chunked is present', () => {
    const p = parse(['HTTP/1.1 500 Internal Server Error\r\nContent-Type: text/plain\r\n\r\n', 'boom', ' boom']);
    expect(p.done).toBe(true);
    expect(p.result().status).toBe(500);
    expect(decodeText(p.result().body)).toBe('boom boom');
  });

  it('treats 204 / 304 / Content-Length: 0 as body-less', () => {
    expect(parse(['HTTP/1.1 204 No Content\r\n\r\n'], false).done).toBe(true);
    expect(parse(['HTTP/1.1 304 Not Modified\r\nContent-Length: 10\r\n\r\n'], false).done).toBe(true);
    const p = parse(['HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n'], false);
    expect(p.done).toBe(true);
    expect(p.result().body.byteLength).toBe(0);
  });

  it("parses go's http.Error 401 (text/plain, body '\\n')", () => {
    const p = parse(['HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain; charset=utf-8\r\nX-Content-Type-Options: nosniff\r\nContent-Length: 1\r\n\r\n\n'], false);
    expect(p.done).toBe(true);
    expect(p.result().status).toBe(401);
    expect(decodeText(p.result().body)).toBe('\n');
  });

  it('fails on truncated Content-Length bodies, bad status lines and bad headers', () => {
    expect(() => parse(['HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nabc'])).toThrow(/truncated response body/);
    expect(() => parse(['HTTP/2 200 OK\r\n\r\n'])).toThrow(/invalid HTTP status line/);
    expect(() => parse(['HTTP/1.1 200 OK\r\nno-colon-here\r\n\r\n'])).toThrow(/invalid HTTP header line/);
    expect(() => parse(['HTTP/1.1 200 OK\r\nContent-Length: abc\r\n\r\n'])).toThrow(/invalid Content-Length/);
    expect(() => parse([])).toThrow(/empty response/);
    expect(() => parse(['HTTP/1.1 200 OK\r\nContent-Le'])).toThrow(/before the response headers were complete/);
  });

  it('enforces the 8 KiB header cap and the 4 MiB body cap', () => {
    const bigHeader = 'HTTP/1.1 200 OK\r\nX-Big: ' + 'a'.repeat(9000) + '\r\n\r\n';
    expect(() => parse([bigHeader], false)).toThrow(/headers exceed/);
    expect(() => parse(['HTTP/1.1 200 OK\r\nContent-Length: 5000000\r\n\r\n'], false)).toThrow(/body exceeds/);
    // chunked body over the cap
    const p = new HttpResponseParser({ maxBodyBytes: 100 });
    p.push(utf8('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n'));
    p.push(utf8('40\r\n' + 'x'.repeat(64) + '\r\n'));
    expect(() => p.push(utf8('40\r\n' + 'y'.repeat(64) + '\r\n'))).toThrow(/body exceeds/);
    // read-to-EOF body over the cap
    const q = new HttpResponseParser({ maxBodyBytes: 10 });
    q.push(utf8('HTTP/1.1 200 OK\r\n\r\n'));
    expect(() => q.push(utf8('01234567890123'))).toThrow(/body exceeds/);
  });

  it('joins duplicate headers and lower-cases names', () => {
    const p = parse(['HTTP/1.1 200 OK\r\nSet-Cookie: a\r\nset-cookie: b\r\nContent-Length: 0\r\n\r\n'], false);
    expect(p.result().headers['set-cookie']).toBe('a, b');
  });
});

describe('requestOverDuplex over a kubo-like duplex', () => {
  const okResponse = (body: string): Uint8Array =>
    serializeResponse(200, 'OK', { 'Content-Type': 'application/json', 'Content-Length': String(utf8(body).length), Connection: 'close' }, utf8(body));

  it('reads a slow response completely and only then half-closes', async () => {
    const { client, server, tornDown } = createKuboPair();
    const serverTask = (async () => {
      let request = '';
      for await (const chunk of server.read()) {
        request += decodeText(chunk);
        if (request.includes('\r\n\r\n')) break;
      }
      const bytes = okResponse('{"ok":true}');
      // headers first, body 100 ms later — a client that half-closed early would lose it
      await server.write(bytes.subarray(0, 40));
      await sleep(100);
      expect(tornDown()).toBe(false);
      await server.write(bytes.subarray(40));
      await server.close();
      return request;
    })();
    const { response, bytesWritten, bytesRead } = await requestOverDuplex(client, { path: '/ping', host: 'x.invalid', body: utf8('{}') });
    const request = await serverTask;
    expect(request.startsWith('POST /ping HTTP/1.1\r\n')).toBe(true);
    expect(response.status).toBe(200);
    expect(decodeText(response.body)).toBe('{"ok":true}');
    expect(bytesWritten).toBeGreaterThan(0);
    expect(bytesRead).toBe(okResponse('{"ok":true}').byteLength);
    expect(tornDown()).toBe(true); // closed after the full read
  });

  it('demonstrates the kubo rule: half-closing before the body arrives loses the response', async () => {
    const { client, server } = createKuboPair();
    void (async () => {
      for await (const chunk of server.read()) {
        if (decodeText(chunk).includes('\r\n\r\n')) break;
      }
      const bytes = okResponse('{"ok":true}');
      await server.write(bytes.subarray(0, 40));
      await sleep(50);
      await server.write(bytes.subarray(40)); // dropped: the client already half-closed
      await server.close();
    })();
    // a naive client: write, half-close, then read
    await client.write(serializeRequest({ path: '/ping', host: 'x.invalid', body: utf8('{}') }));
    await sleep(10);
    await client.close();
    const parser = new HttpResponseParser();
    for await (const chunk of client.read()) parser.push(chunk);
    expect(parser.done).toBe(false);
    expect(() => parser.end()).toThrow(FulaWebError);
  });

  it('maps an aborted signal to TIMEOUT and tears the duplex down', async () => {
    const { client, server, tornDown } = createKuboPair();
    void (async () => {
      for await (const chunk of server.read()) {
        if (decodeText(chunk).includes('\r\n\r\n')) break;
      }
      // never answers
    })();
    const ac = new AbortController();
    const p = requestOverDuplex(client, { path: '/slow', host: 'x.invalid', body: utf8('{}') }, { signal: ac.signal });
    setTimeout(() => ac.abort(), 20);
    await expect(p).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(tornDown()).toBe(true);
  });

  it('surfaces a stream reset as an error rather than a truncated success', async () => {
    const { client, server } = createKuboPair();
    void (async () => {
      for await (const chunk of server.read()) {
        if (decodeText(chunk).includes('\r\n\r\n')) break;
      }
      await server.write(utf8('HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\nabc'));
      server.abort(new Error('relay reset'));
    })();
    await expect(requestOverDuplex(client, { path: '/x', host: 'x.invalid', body: utf8('{}') })).rejects.toThrow('relay reset');
  });
});

describe('HttpRequestParser (test box / fake blox side)', () => {
  it('round-trips a serialised request in split chunks', () => {
    const bytes = serializeRequest({ path: '/account-fund', host: 'b.invalid', headers: { 'X-Fula-Peer-ID': 'p' }, body: utf8('{"amount":1}') });
    const p = new HttpRequestParser();
    expect(p.push(bytes.subarray(0, 10))).toBeUndefined();
    const req = p.push(bytes.subarray(10));
    expect(req).toBeDefined();
    expect(req?.method).toBe('POST');
    expect(req?.path).toBe('/account-fund');
    expect(req?.headers['x-fula-peer-id']).toBe('p');
    expect(req?.headers['host']).toBe('b.invalid');
    expect(decodeText(req?.body ?? new Uint8Array())).toBe('{"amount":1}');
  });
});

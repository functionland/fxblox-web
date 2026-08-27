/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Ported from apps/box/src/utils/__tests__/ble.test.ts — the ble_stream / ble_header / ble_chunk framing of
 * ResponseAssembler.handleResponse, driven directly (no transport involved).
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { ResponseAssembler, BleStreamTimeoutError } from '../ble';
import { FakeBleTransport } from '@/test/helpers/fakeBleTransport';

describe('ResponseAssembler.ble_stream', () => {
  let assembler: ResponseAssembler;

  beforeEach(() => {
    assembler = new ResponseAssembler(new FakeBleTransport());
  });

  afterEach(() => {
    assembler.cleanup();
  });

  function setupCommandWithResolver(): { promise: Promise<any>; callbackFrames: any[] } {
    const callbackFrames: any[] = [];
    const promise = new Promise<any>((resolve) => {
      (assembler as any).currentCommand = 'test-cmd';
      (assembler as any).commandResolve = resolve;
      (assembler as any).onStreamFrame = (f: any) => {
        callbackFrames.push(f);
      };
    });
    return { promise, callbackFrames };
  }

  test('single-frame stream resolves on final=true', async () => {
    const { promise, callbackFrames } = setupCommandWithResolver();
    await assembler.handleResponse(
      JSON.stringify({ type: 'ble_stream', index: 0, data: JSON.stringify({ event: 'hello', token: 'world' }), final: true }),
    );
    const result = await promise;
    expect(result).toEqual({ frames: [{ event: 'hello', token: 'world' }], final: { event: 'hello', token: 'world' } });
    expect(callbackFrames).toHaveLength(1);
    expect(callbackFrames[0]).toEqual({ event: 'hello', token: 'world' });
  });

  test('multi-frame stream invokes callback per frame and resolves on final', async () => {
    const { promise, callbackFrames } = setupCommandWithResolver();
    for (let i = 0; i < 3; i++) {
      await assembler.handleResponse(JSON.stringify({ type: 'ble_stream', index: i, data: JSON.stringify({ tok: i }), final: false }));
    }
    await assembler.handleResponse(JSON.stringify({ type: 'ble_stream', index: 3, data: JSON.stringify({ done: true }), final: true }));
    const result = await promise;
    expect(result.frames).toEqual([{ tok: 0 }, { tok: 1 }, { tok: 2 }, { done: true }]);
    expect(result.final).toEqual({ done: true });
    expect(callbackFrames).toHaveLength(4);
    expect(callbackFrames[0]).toEqual({ tok: 0 });
    expect(callbackFrames[3]).toEqual({ done: true });
  });

  test('frame data that is not JSON is delivered as-is (string)', async () => {
    const { promise, callbackFrames } = setupCommandWithResolver();
    await assembler.handleResponse(JSON.stringify({ type: 'ble_stream', index: 0, data: 'plain text token', final: true }));
    const result = await promise;
    expect(result.final).toBe('plain text token');
    expect(callbackFrames[0]).toBe('plain text token');
  });

  test('stream state does not bleed across commands (cleanupCommand resets)', async () => {
    const { callbackFrames: framesA } = setupCommandWithResolver();
    await assembler.handleResponse(JSON.stringify({ type: 'ble_stream', index: 0, data: '"a"', final: false }));
    await assembler.handleResponse(JSON.stringify({ type: 'ble_stream', index: 1, data: '"b"', final: false }));
    expect(framesA).toHaveLength(2);
    expect((assembler as any).streamFrames).toHaveLength(2);
    expect((assembler as any).isStreaming).toBe(true);

    (assembler as any).cleanupCommand();

    expect((assembler as any).streamFrames).toEqual([]);
    expect((assembler as any).isStreaming).toBe(false);
    expect((assembler as any).onStreamFrame).toBeNull();

    const { promise: pB, callbackFrames: framesB } = setupCommandWithResolver();
    await assembler.handleResponse(JSON.stringify({ type: 'ble_stream', index: 0, data: '"c"', final: true }));
    const result = await pB;
    expect(result.frames).toEqual(['c']);
    expect(framesB).toEqual(['c']);
  });

  test('callback throwing does not kill the stream or unhandle errors', async () => {
    const promise = new Promise<any>((resolve) => {
      (assembler as any).currentCommand = 'test';
      (assembler as any).commandResolve = resolve;
      (assembler as any).onStreamFrame = () => {
        throw new Error('user code blew up');
      };
    });
    await expect(assembler.handleResponse(JSON.stringify({ type: 'ble_stream', index: 0, data: '"x"', final: true }))).resolves.not.toThrow();
    const result = await promise;
    expect(result.final).toBe('x');
  });

  test('stream without onStreamFrame still accumulates and resolves', async () => {
    const promise = new Promise<any>((resolve) => {
      (assembler as any).currentCommand = 'test';
      (assembler as any).commandResolve = resolve;
      (assembler as any).onStreamFrame = null;
    });
    await assembler.handleResponse(JSON.stringify({ type: 'ble_stream', index: 0, data: '{"n":1}', final: false }));
    await assembler.handleResponse(JSON.stringify({ type: 'ble_stream', index: 1, data: '{"n":2}', final: true }));
    const result = await promise;
    expect(result.frames).toEqual([{ n: 1 }, { n: 2 }]);
    expect(result.final).toEqual({ n: 2 });
  });

  test('BleStreamTimeoutError carries the partial frames that arrived', () => {
    const err = new BleStreamTimeoutError('test', [{ a: 1 }, { b: 2 }]);
    expect(err).toBeInstanceOf(BleStreamTimeoutError);
    expect(err).toBeInstanceOf(Error);
    expect(err.partialFrames).toEqual([{ a: 1 }, { b: 2 }]);
    expect(err.name).toBe('BleStreamTimeoutError');
    expect(err.message).toBe('test');
  });

  test('malformed JSON in a frame does not hang or throw out of handleResponse', async () => {
    const { promise, callbackFrames } = setupCommandWithResolver();
    const r = await assembler.handleResponse('not-json-at-all');
    expect(r).toBe('not-json-at-all');
    expect(callbackFrames).toHaveLength(0);

    await assembler.handleResponse(JSON.stringify({ type: 'ble_stream', index: 0, data: '"recovered"', final: true }));
    const result = await promise;
    expect(result.final).toBe('recovered');
  });

  test('legacy ble_header + ble_chunk path still works (no regression)', async () => {
    const resultPromise = assembler.handleResponse(JSON.stringify({ type: 'ble_header', chunks: 2 }));
    await assembler.handleResponse(JSON.stringify({ type: 'ble_chunk', index: 0, data: '{"hel' }));
    await assembler.handleResponse(JSON.stringify({ type: 'ble_chunk', index: 1, data: 'lo":1}' }));
    const result = await resultPromise;
    expect(result).toEqual({ hello: 1 });
  });
});

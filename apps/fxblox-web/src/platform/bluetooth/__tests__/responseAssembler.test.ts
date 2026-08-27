/**
 * ResponseAssembler over an in-memory BleTransport — the Web Bluetooth write/notify path end to end.
 */
import { describe, expect, test, vi } from 'vitest';
import { ResponseAssembler, BleStreamTimeoutError, BleNoDeviceError } from '@/platform/bluetooth';
import { FakeBleTransport } from '@/test/helpers/fakeBleTransport';
import { sleep } from '@/test/helpers/waitFor';

describe('ResponseAssembler.writeToBLEAndWaitForResponse over a BleTransport', () => {
  test('writes the command bytes, subscribes, resolves the plain JSON reply and unsubscribes', async () => {
    const t = new FakeBleTransport();
    t.onWrite = (_bytes, tr) => tr.emitFrame({ status: true, msg: 'ok' });
    const a = new ResponseAssembler(t);
    const result = await a.writeToBLEAndWaitForResponse('wifi/status', t.id);
    expect(result).toEqual({ status: true, msg: 'ok' });
    expect(t.lastWrittenText()).toBe('wifi/status');
    expect(t.attachCalls).toBe(1);
    expect(t.unsubscribeCalls).toBe(1);
    expect(t.subscribers.size).toBe(0);
  });

  test('a non-JSON reply resolves as the raw string', async () => {
    const t = new FakeBleTransport();
    t.onWrite = (_b, tr) => tr.emit('Wifi connected!');
    const result = await new ResponseAssembler(t).writeToBLEAndWaitForResponse('wifi/connect Home pw CA', t.id);
    expect(result).toBe('Wifi connected!');
  });

  test('ble_header + ble_chunk frames are reassembled (out-of-order chunks)', async () => {
    const t = new FakeBleTransport();
    t.onWrite = async (_b, tr) => {
      tr.emitFrame({ type: 'ble_header', chunks: 3 });
      await sleep(1);
      tr.emitFrame({ type: 'ble_chunk', index: 1, data: 'b":' });
      tr.emitFrame({ type: 'ble_chunk', index: 0, data: '{"a' });
      tr.emitFrame({ type: 'ble_chunk', index: 2, data: '1}' });
    };
    const result = await new ResponseAssembler(t).writeToBLEAndWaitForResponse('properties', t.id);
    expect(result).toEqual({ ab: 1 });
  });

  test('ble_stream frames are delivered via onStreamFrame and the final frame resolves {frames, final}', async () => {
    const t = new FakeBleTransport();
    t.onWrite = async (_b, tr) => {
      tr.emitFrame({ type: 'ble_stream', index: 0, data: JSON.stringify({ type: 'session_started', session_id: 's1', protocol_version: 3 }), final: false });
      await sleep(1);
      tr.emitFrame({ type: 'ble_stream', index: 1, data: JSON.stringify({ type: 'thought', payload: 'hmm' }), final: false });
      tr.emitFrame({ type: 'ble_stream', index: 2, data: JSON.stringify({ type: 'verdict', payload: { summary: 'ok', severity: 'green' } }), final: true });
    };
    const frames: unknown[] = [];
    const result = (await new ResponseAssembler(t).writeToBLEAndWaitForResponse(JSON.stringify({ command: 'ai/troubleshoot' }), t.id, undefined, undefined, 1000, (f) =>
      frames.push(f),
    )) as { frames: unknown[]; final: unknown };
    expect(frames).toHaveLength(3);
    expect(result.frames).toHaveLength(3);
    expect(result.final).toEqual({ type: 'verdict', payload: { summary: 'ok', severity: 'green' } });
  });

  test('single command in flight: a second call rejects with "Another command is in progress"', async () => {
    const t = new FakeBleTransport();
    const a = new ResponseAssembler(t);
    const first = a.writeToBLEAndWaitForResponse('slow', t.id, undefined, undefined, 500);
    await sleep(5);
    await expect(a.writeToBLEAndWaitForResponse('second', t.id)).rejects.toThrow(/Another command is in progress/);
    t.emitFrame({ done: true });
    await expect(first).resolves.toEqual({ done: true });
    // The channel is free again.
    t.onWrite = (_b, tr) => tr.emitFrame({ ok: 1 });
    await expect(a.writeToBLEAndWaitForResponse('third', t.id)).resolves.toEqual({ ok: 1 });
  });

  test('timeout rejects with BleStreamTimeoutError carrying the partial frames', async () => {
    const t = new FakeBleTransport();
    t.onWrite = (_b, tr) => {
      tr.emitFrame({ type: 'ble_stream', index: 0, data: '{"n":1}', final: false });
      tr.emitFrame({ type: 'ble_stream', index: 1, data: '{"n":2}', final: false });
    };
    const err = await new ResponseAssembler(t).writeToBLEAndWaitForResponse('ai', t.id, undefined, undefined, 30).catch((e) => e);
    expect(err).toBeInstanceOf(BleStreamTimeoutError);
    expect((err as BleStreamTimeoutError).partialFrames).toEqual([{ n: 1 }, { n: 2 }]);
    expect(t.unsubscribeCalls).toBe(1);
  });

  test('a GATT write that never completes still rejects at the timeout (no hang, no unhandled rejection)', async () => {
    const t = new FakeBleTransport();
    t.onWrite = () => new Promise<void>(() => undefined); // stuck write
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const err = await new ResponseAssembler(t).writeToBLEAndWaitForResponse('x', t.id, undefined, undefined, 30).catch((e) => e);
      expect(err).toBeInstanceOf(BleStreamTimeoutError);
      await sleep(10);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  test('a write failure rejects and leaves the assembler reusable', async () => {
    const t = new FakeBleTransport();
    t.writeError = new Error('GATT operation failed');
    const a = new ResponseAssembler(t);
    await expect(a.writeToBLEAndWaitForResponse('x', t.id)).rejects.toThrow('GATT operation failed');
    t.writeError = null;
    t.onWrite = (_b, tr) => tr.emitFrame({ ok: true });
    await expect(a.writeToBLEAndWaitForResponse('y', t.id)).resolves.toEqual({ ok: true });
  });

  test('without an injected transport and no registry session → BleNoDeviceError', async () => {
    const a = new ResponseAssembler();
    await expect(a.writeToBLEAndWaitForResponse('x', 'unknown-device')).rejects.toBeInstanceOf(BleNoDeviceError);
  });

  test('cleanup() rejects a pending command and stops notifications', async () => {
    const t = new FakeBleTransport();
    const a = new ResponseAssembler(t);
    const p = a.writeToBLEAndWaitForResponse('x', t.id, undefined, undefined, 5000);
    await sleep(5);
    a.cleanup();
    await expect(p).rejects.toThrow(/cleaned up/);
    expect(t.subscribers.size).toBe(0);
  });
});

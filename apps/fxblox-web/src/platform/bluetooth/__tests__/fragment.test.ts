/**
 * 512-byte write cap: pure fragmentation + BleSession.write policy over a fake BluetoothDevice.
 */
import { describe, expect, test, vi } from 'vitest';
import { fragmentCommand, chunkPrefix, toArrayBuffer } from '../fragment';
import { BleSession, type BluetoothDeviceLike, type BluetoothRemoteGATTCharacteristicLike } from '../webBluetooth';
import { BLE_MAX_WRITE_BYTES, BleCommandTooLong } from '../types';

const enc = new TextEncoder();
const dec = new TextDecoder();

describe('fragmentCommand', () => {
  test('≤ 512 bytes → a single whole write', () => {
    const bytes = enc.encode('x'.repeat(512));
    const frames = fragmentCommand(bytes);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toBe(bytes);
  });

  test('> 512 bytes → `chunk <n>/<m> <payload>` frames, each ≤ 512, payloads concatenate to the original', () => {
    const original = enc.encode('a'.repeat(1000));
    const frames = fragmentCommand(original);
    expect(frames).toHaveLength(3); // ceil(1000 / 480)
    const payloads: Uint8Array[] = [];
    frames.forEach((f, i) => {
      expect(f.length).toBeLessThanOrEqual(BLE_MAX_WRITE_BYTES);
      const prefix = dec.decode(chunkPrefix(i + 1, 3));
      expect(dec.decode(f.subarray(0, prefix.length))).toBe(`chunk ${i + 1}/3 `);
      payloads.push(f.subarray(prefix.length));
    });
    const joined = new Uint8Array(payloads.reduce((n, p) => n + p.length, 0));
    let off = 0;
    for (const p of payloads) {
      joined.set(p, off);
      off += p.length;
    }
    // Compare as plain arrays: jsdom's TextEncoder returns a Uint8Array from another realm.
    expect(Array.from(joined)).toEqual(Array.from(original));
    expect(payloads[0]!.length).toBe(480);
    expect(payloads[2]!.length).toBe(40);
  });

  test('toArrayBuffer copies an offset view into a standalone buffer', () => {
    const backing = new Uint8Array([1, 2, 3, 4, 5]);
    const view = backing.subarray(2, 4);
    const buf = toArrayBuffer(view);
    expect(buf.byteLength).toBe(2);
    expect([...new Uint8Array(buf)]).toEqual([3, 4]);
  });
});

function fakeDevice(opts: { connected?: boolean } = {}) {
  const writes: ArrayBuffer[] = [];
  const listeners = new Set<(ev: Event) => void>();
  const characteristic: BluetoothRemoteGATTCharacteristicLike & { writes: ArrayBuffer[]; notify: (text: string) => void } = {
    writes,
    value: null,
    writeValueWithResponse: vi.fn(async (v: BufferSource) => {
      writes.push(v as ArrayBuffer);
    }),
    startNotifications: vi.fn(async () => characteristic),
    stopNotifications: vi.fn(async () => characteristic),
    addEventListener: (_t, l) => listeners.add(l),
    removeEventListener: (_t, l) => listeners.delete(l),
    notify(text: string) {
      const dv = new DataView(toArrayBuffer(enc.encode(text)));
      for (const l of listeners) l({ target: { value: dv } } as unknown as Event);
    },
  };
  let connected = opts.connected ?? false;
  const gatt = {
    get connected() {
      return connected;
    },
    connect: vi.fn(async () => {
      connected = true;
      return gatt;
    }),
    disconnect: vi.fn(() => {
      connected = false;
    }),
    getPrimaryService: vi.fn(async () => ({ getCharacteristic: vi.fn(async () => characteristic) })),
  };
  const device: BluetoothDeviceLike = { id: 'dev-1', name: 'fulatower', gatt, addEventListener: () => undefined, removeEventListener: () => undefined };
  return { device, characteristic, gatt };
}

describe('BleSession.write — 512-byte cap policy', () => {
  test('≤ 512 B is written whole with writeValueWithResponse', async () => {
    const { device, characteristic } = fakeDevice();
    const s = new BleSession(device, { retryBaseMs: 1 });
    await s.write(enc.encode('properties'));
    expect(characteristic.writes).toHaveLength(1);
    expect(dec.decode(characteristic.writes[0]!)).toBe('properties');
    expect(s.isConnected()).toBe(true);
  });

  test('> 512 B with chunked writes DISABLED rejects BleCommandTooLong and writes nothing', async () => {
    const { device, characteristic } = fakeDevice();
    const s = new BleSession(device, { allowChunkedWrites: false });
    await expect(s.write(enc.encode('x'.repeat(600)))).rejects.toBeInstanceOf(BleCommandTooLong);
    expect(characteristic.writes).toHaveLength(0);
  });

  test('> 512 B with chunked writes ENABLED writes the `chunk n/m` frames in order', async () => {
    const { device, characteristic } = fakeDevice();
    const s = new BleSession(device, { allowChunkedWrites: true, retryBaseMs: 1 });
    await s.write(enc.encode('y'.repeat(1000)));
    expect(characteristic.writes).toHaveLength(3);
    expect(dec.decode(characteristic.writes[0]!).startsWith('chunk 1/3 ')).toBe(true);
    expect(dec.decode(characteristic.writes[2]!).startsWith('chunk 3/3 ')).toBe(true);
  });

  test('concurrent writes are serialised (no interleaving of fragments)', async () => {
    const { device, characteristic } = fakeDevice();
    const s = new BleSession(device, { allowChunkedWrites: true, retryBaseMs: 1 });
    await Promise.all([s.write(enc.encode('A'.repeat(700))), s.write(enc.encode('B'.repeat(700)))]);
    const order = characteristic.writes.map((w) => dec.decode(w).slice(0, 12));
    expect(order).toEqual(['chunk 1/2 AA', 'chunk 2/2 AA', 'chunk 1/2 BB', 'chunk 2/2 BB']);
  });

  test('attach retries getPrimaryService and subscribe delivers notification bytes', async () => {
    const { device, characteristic, gatt } = fakeDevice();
    gatt.getPrimaryService.mockRejectedValueOnce(new Error('not ready'));
    const s = new BleSession(device, { retryBaseMs: 1 });
    const received: string[] = [];
    const unsub = await s.subscribe((bytes) => received.push(dec.decode(bytes)));
    expect(gatt.getPrimaryService).toHaveBeenCalledTimes(2);
    characteristic.notify('{"hello":1}');
    expect(received).toEqual(['{"hello":1}']);
    await unsub();
    expect(characteristic.stopNotifications).toHaveBeenCalledTimes(1);
    characteristic.notify('late');
    expect(received).toHaveLength(1);
  });
});

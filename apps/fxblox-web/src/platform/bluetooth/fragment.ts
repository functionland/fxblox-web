/**
 * 512-byte write cap handling. Commands ≤ 512 bytes are written whole; longer ones are fragmented as
 * `chunk <n>/<m> <payload>` (1-based, ≤ 480-byte payloads, written in order with response) — the request framing
 * fula-ota PR-E adds to `bluetooth.py`. Pure and unit-tested.
 */
import { BLE_CHUNK_PAYLOAD_BYTES, BLE_MAX_WRITE_BYTES } from './types';

const enc = new TextEncoder();

export interface FragmentOptions {
  maxWrite?: number;
  payloadBytes?: number;
}

export function chunkPrefix(n: number, m: number): Uint8Array {
  return enc.encode(`chunk ${n}/${m} `);
}

export function fragmentCommand(bytes: Uint8Array, opts: FragmentOptions = {}): Uint8Array[] {
  const maxWrite = opts.maxWrite ?? BLE_MAX_WRITE_BYTES;
  const payloadBytes = opts.payloadBytes ?? BLE_CHUNK_PAYLOAD_BYTES;
  if (bytes.length <= maxWrite) return [bytes];
  const m = Math.ceil(bytes.length / payloadBytes);
  const out: Uint8Array[] = [];
  for (let i = 0; i < m; i++) {
    const payload = bytes.subarray(i * payloadBytes, Math.min(bytes.length, (i + 1) * payloadBytes));
    const prefix = chunkPrefix(i + 1, m);
    const frame = new Uint8Array(prefix.length + payload.length);
    frame.set(prefix, 0);
    frame.set(payload, prefix.length);
    if (frame.length > maxWrite) {
      throw new Error(`fragmentCommand: frame ${i + 1}/${m} is ${frame.length} bytes > ${maxWrite}`);
    }
    out.push(frame);
  }
  return out;
}

export function encodeCommand(command: string): Uint8Array {
  return enc.encode(command);
}

/** Copy a (possibly offset / shared-buffer) view into a standalone ArrayBuffer for GATT writes. */
export function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(u8.byteLength);
  new Uint8Array(out).set(u8);
  return out;
}

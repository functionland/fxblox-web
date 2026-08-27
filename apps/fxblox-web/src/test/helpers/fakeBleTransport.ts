/**
 * In-memory `BleTransport` for ResponseAssembler / BleAiClient tests. `written` records every write; call
 * `emit(json)` / `emitFrame(obj)` to simulate a notification from the Blox.
 */
import type { BleCharacteristicRef, BleTransport } from '@/platform/bluetooth/types';

export class FakeBleTransport implements BleTransport {
  readonly id: string;
  readonly name: string | undefined;
  written: Uint8Array[] = [];
  subscribers = new Set<(value: Uint8Array) => void>();
  connected = true;
  attachCalls = 0;
  unsubscribeCalls = 0;
  /** Optional hook run on each write (e.g. auto-reply). */
  onWrite: ((bytes: Uint8Array, transport: FakeBleTransport) => void | Promise<void>) | null = null;
  writeError: Error | null = null;

  constructor(id = 'fake-device-1', name = 'fulatower') {
    this.id = id;
    this.name = name;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async attach(): Promise<void> {
    this.attachCalls++;
  }

  async write(bytes: Uint8Array, _ref?: BleCharacteristicRef): Promise<void> {
    if (this.writeError) throw this.writeError;
    this.written.push(bytes);
    if (this.onWrite) await this.onWrite(bytes, this);
  }

  async subscribe(handler: (value: Uint8Array) => void): Promise<() => Promise<void>> {
    this.subscribers.add(handler);
    return async () => {
      this.unsubscribeCalls++;
      this.subscribers.delete(handler);
    };
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  /** Simulate a notification carrying raw text. */
  emit(text: string): void {
    const bytes = new TextEncoder().encode(text);
    for (const s of [...this.subscribers]) s(bytes);
  }

  emitFrame(frame: unknown): void {
    this.emit(JSON.stringify(frame));
  }

  lastWrittenText(): string {
    const last = this.written[this.written.length - 1];
    return last ? new TextDecoder().decode(last) : '';
  }
}

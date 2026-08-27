/**
 * BleSession — a Web Bluetooth GATT session for one Blox (the `BleManagerWrapper` replacement).
 *
 *  - `BleSession.pick()` runs `requestDevice({ filters: [{namePrefix:'fulatower'},{namePrefix:'fxblox'}],
 *    optionalServices: [00000001-…] })` — must be called from a click handler (Chrome's chooser replaces the
 *    mobile device-selection sheet).
 *  - `attach()` connects GATT, retries `getPrimaryService` 3× (services are not always enumerated right after
 *    connect), and caches the command characteristic.
 *  - `write()` enforces the 512-byte cap: whole write when ≤ 512 B; longer commands are fragmented
 *    (`chunk <n>/<m> <payload>`) only when `allowChunkedWrites` is on (fula-ota PR-E), else `BleCommandTooLong`.
 *  - `reconnect()` re-attaches without the chooser via `getDevices()` / `watchAdvertisements()` when the
 *    browser supports them.
 */
import type { BleCharacteristicRef, BleTransport } from './types';
import {
  BLE_COMMAND_CHARACTERISTIC_UUID,
  BLE_MAX_WRITE_BYTES,
  BLE_NAME_PREFIXES,
  BLE_SERVICE_UUID,
  BleCommandTooLong,
  BleUnavailableError,
} from './types';
import { fragmentCommand, toArrayBuffer } from './fragment';

/** Minimal structural view of `BluetoothDevice` so tests can pass a fake. */
export interface BluetoothDeviceLike {
  readonly id: string;
  readonly name?: string | undefined;
  readonly gatt?: BluetoothRemoteGATTServerLike | undefined;
  watchAdvertisements?: (options?: { signal?: AbortSignal }) => Promise<void>;
  addEventListener?: (type: string, listener: (ev: Event) => void, options?: AddEventListenerOptions | boolean) => void;
  removeEventListener?: (type: string, listener: (ev: Event) => void) => void;
}

export interface BluetoothRemoteGATTServerLike {
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServerLike>;
  disconnect(): void;
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTServiceLike>;
}

export interface BluetoothRemoteGATTServiceLike {
  getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristicLike>;
}

export interface BluetoothRemoteGATTCharacteristicLike {
  readonly value?: DataView | null;
  writeValueWithResponse?: (value: BufferSource) => Promise<void>;
  writeValue?: (value: BufferSource) => Promise<void>;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristicLike>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristicLike>;
  addEventListener(type: 'characteristicvaluechanged', listener: (ev: Event) => void): void;
  removeEventListener(type: 'characteristicvaluechanged', listener: (ev: Event) => void): void;
}

export interface BleSessionOptions {
  allowChunkedWrites?: boolean;
  serviceUUID?: string;
  characteristicUUID?: string;
  /** getPrimaryService retries (default 3) and the base backoff (default 1000 ms). */
  serviceRetries?: number;
  retryBaseMs?: number;
  log?: (message: string, ...args: unknown[]) => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function bluetoothApi(): Bluetooth | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth;
}

export function isWebBluetoothSupported(): boolean {
  return !!bluetoothApi()?.requestDevice;
}

export async function isBluetoothAvailable(): Promise<boolean> {
  const api = bluetoothApi();
  if (!api) return false;
  try {
    return typeof api.getAvailability === 'function' ? await api.getAvailability() : true;
  } catch {
    return true;
  }
}

export function isFxBloxDeviceName(name: string | undefined): boolean {
  const n = (name ?? '').toLowerCase();
  return BLE_NAME_PREFIXES.some((p) => n.includes(p));
}

export class BleSession implements BleTransport {
  readonly device: BluetoothDeviceLike;
  private readonly opts: Required<Pick<BleSessionOptions, 'allowChunkedWrites' | 'serviceUUID' | 'characteristicUUID' | 'serviceRetries' | 'retryBaseMs'>> & {
    log: (message: string, ...args: unknown[]) => void;
  };
  private characteristics = new Map<string, BluetoothRemoteGATTCharacteristicLike>();
  private attaching: Promise<void> | null = null;
  private disconnectListeners = new Set<() => void>();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(device: BluetoothDeviceLike, opts: BleSessionOptions = {}) {
    this.device = device;
    this.opts = {
      allowChunkedWrites: opts.allowChunkedWrites ?? false,
      serviceUUID: opts.serviceUUID ?? BLE_SERVICE_UUID,
      characteristicUUID: opts.characteristicUUID ?? BLE_COMMAND_CHARACTERISTIC_UUID,
      serviceRetries: opts.serviceRetries ?? 3,
      retryBaseMs: opts.retryBaseMs ?? 1000,
      log: opts.log ?? ((m, ...a) => console.log('[BLE]', m, ...a)),
    };
    device.addEventListener?.('gattserverdisconnected', () => {
      this.characteristics.clear();
      this.opts.log('disconnected', device.name ?? device.id);
      for (const cb of this.disconnectListeners) {
        try {
          cb();
        } catch {
          /* ignore */
        }
      }
    });
  }

  /** Chrome chooser — call from a user gesture. */
  static async pick(opts: BleSessionOptions = {}): Promise<BleSession> {
    const api = bluetoothApi();
    if (!api?.requestDevice) throw new BleUnavailableError();
    const device = await api.requestDevice({
      filters: BLE_NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
      optionalServices: [opts.serviceUUID ?? BLE_SERVICE_UUID],
    });
    return new BleSession(device as unknown as BluetoothDeviceLike, opts);
  }

  /** Devices this origin was previously granted (Chrome `getDevices()`); empty when unsupported. */
  static async knownDevices(): Promise<BluetoothDeviceLike[]> {
    const api = bluetoothApi();
    if (!api || typeof api.getDevices !== 'function') return [];
    try {
      const devices = await api.getDevices();
      return (devices as unknown as BluetoothDeviceLike[]).filter((d) => isFxBloxDeviceName(d.name));
    } catch {
      return [];
    }
  }

  get id(): string {
    return this.device.id;
  }

  get name(): string | undefined {
    return this.device.name ?? undefined;
  }

  isConnected(): boolean {
    return !!this.device.gatt?.connected;
  }

  onDisconnect(cb: () => void): () => void {
    this.disconnectListeners.add(cb);
    return () => this.disconnectListeners.delete(cb);
  }

  private key(ref?: BleCharacteristicRef): { serviceUUID: string; characteristicUUID: string; key: string } {
    const serviceUUID = (ref?.serviceUUID ?? this.opts.serviceUUID).toLowerCase();
    const characteristicUUID = (ref?.characteristicUUID ?? this.opts.characteristicUUID).toLowerCase();
    return { serviceUUID, characteristicUUID, key: `${serviceUUID}/${characteristicUUID}` };
  }

  async attach(ref?: BleCharacteristicRef): Promise<void> {
    const { key } = this.key(ref);
    if (this.isConnected() && this.characteristics.has(key)) return;
    if (this.attaching) {
      await this.attaching;
      if (this.isConnected() && this.characteristics.has(key)) return;
    }
    this.attaching = this.doAttach(ref).finally(() => {
      this.attaching = null;
    });
    return this.attaching;
  }

  private async doAttach(ref?: BleCharacteristicRef): Promise<void> {
    const gatt = this.device.gatt;
    if (!gatt) throw new BleUnavailableError('Device has no GATT server');
    if (!gatt.connected) {
      this.opts.log('connecting', this.device.name ?? this.device.id);
      await gatt.connect();
    }
    const { serviceUUID, characteristicUUID, key } = this.key(ref);
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.opts.serviceRetries; attempt++) {
      try {
        const service = await gatt.getPrimaryService(serviceUUID);
        const characteristic = await service.getCharacteristic(characteristicUUID);
        this.characteristics.set(key, characteristic);
        return;
      } catch (e) {
        lastError = e;
        this.opts.log(`getPrimaryService attempt ${attempt} failed`, e);
        if (attempt < this.opts.serviceRetries) {
          await sleep(this.opts.retryBaseMs * attempt);
          if (!gatt.connected) await gatt.connect();
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error('getPrimaryService failed');
  }

  private characteristic(ref?: BleCharacteristicRef): BluetoothRemoteGATTCharacteristicLike {
    const { key } = this.key(ref);
    const c = this.characteristics.get(key);
    if (!c) throw new Error('BleSession: not attached');
    return c;
  }

  /**
   * Write one command. ≤ 512 B → single write; longer → fragmented when allowed, else `BleCommandTooLong`.
   * Writes are serialized per session so fragments from concurrent callers cannot interleave.
   */
  write(bytes: Uint8Array, ref?: BleCharacteristicRef): Promise<void> {
    if (bytes.length > BLE_MAX_WRITE_BYTES && !this.opts.allowChunkedWrites) {
      return Promise.reject(new BleCommandTooLong(bytes.length));
    }
    const run = async () => {
      await this.attach(ref);
      const c = this.characteristic(ref);
      const frames = fragmentCommand(bytes);
      for (const frame of frames) {
        const buf = toArrayBuffer(frame);
        if (c.writeValueWithResponse) await c.writeValueWithResponse(buf);
        else if (c.writeValue) await c.writeValue(buf);
        else throw new Error('BleSession: characteristic is not writable');
      }
    };
    const next = this.writeQueue.then(run, run);
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  async subscribe(handler: (value: Uint8Array) => void, ref?: BleCharacteristicRef): Promise<() => Promise<void>> {
    await this.attach(ref);
    const c = this.characteristic(ref);
    const listener = (ev: Event) => {
      const target = ev.target as { value?: DataView | null } | null;
      const dv = target?.value ?? c.value;
      if (!dv) return;
      handler(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength));
    };
    c.addEventListener('characteristicvaluechanged', listener);
    try {
      await c.startNotifications();
    } catch (e) {
      c.removeEventListener('characteristicvaluechanged', listener);
      throw e;
    }
    return async () => {
      c.removeEventListener('characteristicvaluechanged', listener);
      try {
        await c.stopNotifications();
      } catch {
        /* best effort */
      }
    };
  }

  /**
   * Re-attach without the chooser. When `watchAdvertisements` exists, wait (≤ timeoutMs) for the device to be
   * seen before connecting — connecting to an out-of-range device otherwise hangs for a long time.
   */
  async reconnect(opts: { timeoutMs?: number } = {}): Promise<void> {
    if (this.isConnected()) return;
    const device = this.device;
    if (typeof device.watchAdvertisements === 'function' && device.addEventListener && device.removeEventListener) {
      const controller = new AbortController();
      const seen = new Promise<void>((resolve) => {
        const onAdv = () => {
          device.removeEventListener?.('advertisementreceived', onAdv);
          resolve();
        };
        device.addEventListener?.('advertisementreceived', onAdv);
      });
      const timeout = sleep(opts.timeoutMs ?? 10_000);
      try {
        await device.watchAdvertisements({ signal: controller.signal });
        await Promise.race([seen, timeout]);
      } catch (e) {
        this.opts.log('watchAdvertisements failed; connecting directly', e);
      } finally {
        controller.abort();
      }
    }
    await this.attach();
  }

  async disconnect(): Promise<void> {
    this.characteristics.clear();
    try {
      this.device.gatt?.disconnect();
    } catch {
      /* ignore */
    }
  }
}

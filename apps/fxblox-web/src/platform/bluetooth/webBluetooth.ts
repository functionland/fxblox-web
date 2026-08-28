/**
 * BleSession â€” a Web Bluetooth GATT session for one Blox (the `BleManagerWrapper` replacement).
 *
 *  - `BleSession.pick()` runs `requestDevice({ filters: [{namePrefix:'fulatower'},{namePrefix:'fxblox'}],
 *    optionalServices: [00000001-â€¦] })` â€” must be called from a click handler (Chrome's chooser replaces the
 *    mobile device-selection sheet).
 *  - `attach()` connects GATT, retries `getPrimaryService` 3Ã— (services are not always enumerated right after
 *    connect), and caches the command characteristic.
 *  - `write()` enforces the 512-byte cap: whole write when â‰¤ 512 B; longer commands are fragmented
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

/**
 * One session per physical device â€” see `sessionForDevice`.
 *
 * Chrome hands back the SAME `BluetoothDevice` object for a given device and origin, so a second
 * `new BleSession(device)` puts a second `gattserverdisconnected` listener on it and, worse, a second
 * independent set of `attaching` / `writeQueue` guards over one radio. Observed in the field: the disconnect
 * line logged twice, then three times, two `doAttach` retry loops interleaving within the same second, and the
 * next write failing with `NotSupportedError: GATT operation failed for unknown reason` â€” which is Chrome
 * rejecting a GATT operation issued while another was already in flight on that device. Reusing the session
 * makes the existing per-instance guards effective per-device guards, which is what they were always meant
 * to be.
 */
const sessionsByDevice = new Map<string, BleSession>();

/**
 * The session for this device, creating it only the first time.
 *
 * `pick()` runs on every press of "Connect via Bluetooth", and the screens legitimately call it more than once
 * (`navigator.bluetooth.getDevices()` is behind a flag and unavailable on stock Chrome, so a remount cannot
 * silently restore the session and the user has to press Connect again). Repeated picks must therefore be
 * harmless rather than cumulative.
 */
export function sessionForDevice(device: BluetoothDeviceLike, opts: BleSessionOptions = {}): BleSession {
  const existing = sessionsByDevice.get(device.id);
  if (existing) {
    existing.applyOptions(opts);
    return existing;
  }
  const session = new BleSession(device, opts);
  sessionsByDevice.set(device.id, session);
  return session;
}

/** Test hook: forget every cached session so each test starts from a clean device map. */
export function _resetSessionsForTests(): void {
  for (const session of sessionsByDevice.values()) session.dispose();
  sessionsByDevice.clear();
}

export class BleSession implements BleTransport {
  readonly device: BluetoothDeviceLike;
  private readonly opts: Required<Pick<BleSessionOptions, 'allowChunkedWrites' | 'serviceUUID' | 'characteristicUUID' | 'serviceRetries' | 'retryBaseMs'>> & {
    log: (message: string, ...args: unknown[]) => void;
  };
  private characteristics = new Map<string, BluetoothRemoteGATTCharacteristicLike>();
  private disconnectListeners = new Set<() => void>();
  /** Serializes every GATT operation on this device — see `enqueue`. */
  private gattQueue: Promise<unknown> = Promise.resolve();
  /** Characteristic keys whose notifications are already enabled on the current connection. */
  private notifying = new Set<string>();
  /**
   * Bumped on every disconnect. `startNotifications()` is awaited, and the disconnect event can land WHILE it
   * is pending: the handler clears `notifying`, then the await resolves and would re-add the key — marking a
   * dead connection as already-notifying, so the next `subscribe()` would skip enabling notifications and the
   * session would never receive another frame. The epoch lets the continuation notice that happened.
   */
  private connectionEpoch = 0;
  private readonly onGattDisconnected: () => void;

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
    // Kept as a field so `dispose()` can remove it. An anonymous listener could never be detached, which is
    // half of why stacked sessions were unrecoverable.
    this.onGattDisconnected = () => {
      this.characteristics.clear();
      // The CCCD state died with the connection; the next attach must re-enable notifications.
      this.notifying.clear();
      this.connectionEpoch++;
      this.opts.log('disconnected', device.name ?? device.id);
      for (const cb of this.disconnectListeners) {
        try {
          cb();
        } catch {
          /* ignore */
        }
      }
    };
    device.addEventListener?.('gattserverdisconnected', this.onGattDisconnected);
  }

  /** Apply the caller-supplied options that may legitimately differ between call sites. */
  applyOptions(opts: BleSessionOptions): void {
    if (opts.allowChunkedWrites !== undefined) this.opts.allowChunkedWrites = opts.allowChunkedWrites;
    if (opts.serviceRetries !== undefined) this.opts.serviceRetries = opts.serviceRetries;
    if (opts.retryBaseMs !== undefined) this.opts.retryBaseMs = opts.retryBaseMs;
    if (opts.log) this.opts.log = opts.log;
  }

  /** Detach from the device. Only for teardown â€” a live session must stay listening. */
  dispose(): void {
    this.device.removeEventListener?.('gattserverdisconnected', this.onGattDisconnected);
    this.disconnectListeners.clear();
    this.characteristics.clear();
    this.notifying.clear();
  }

  /**
   * Chrome chooser â€” call from a user gesture. Returns the EXISTING session when this device already has one,
   * so pressing Connect twice cannot leave two sessions racing over one radio.
   */
  static async pick(opts: BleSessionOptions = {}): Promise<BleSession> {
    const api = bluetoothApi();
    if (!api?.requestDevice) throw new BleUnavailableError();
    const device = await api.requestDevice({
      filters: BLE_NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
      optionalServices: [opts.serviceUUID ?? BLE_SERVICE_UUID],
    });
    return sessionForDevice(device as unknown as BluetoothDeviceLike, opts);
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

  /**
   * Run one GATT operation with nothing else in flight on this device.
   *
   * Chrome does not queue GATT work: it hands each call to the OS Bluetooth stack, and Windows in particular
   * rejects a second operation issued while one is outstanding — surfacing as the opaque
   * `NotSupportedError: GATT operation failed for unknown reason`. Serializing writes alone was not enough,
   * because `attach()` and `subscribe()`/`startNotifications()` (a CCCD write, a real GATT operation) went
   * around that queue and could overlap a write issued by another screen.
   *
   * Everything that touches the radio goes through here. Callers already inside a slot must use the raw
   * helpers (`ensureCharacteristic`) rather than re-entering, or they would wait on a slot they hold.
   */
  private enqueue<T>(op: () => Promise<T>): Promise<T> {
    const run = () => op();
    const next = this.gattQueue.then(run, run);
    this.gattQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async attach(ref?: BleCharacteristicRef): Promise<void> {
    const { key } = this.key(ref);
    // Fast path: nothing to do and no radio traffic, so it need not take a queue slot.
    if (this.isConnected() && this.characteristics.has(key)) return;
    await this.enqueue(() => this.ensureCharacteristic(ref));
  }

  /**
   * The characteristic, connecting and resolving it if needed. Performs raw GATT calls, so it must only be
   * called from inside a queue slot.
   */
  private async ensureCharacteristic(
    ref?: BleCharacteristicRef,
  ): Promise<BluetoothRemoteGATTCharacteristicLike> {
    const { key } = this.key(ref);
    const cached = this.characteristics.get(key);
    if (this.isConnected() && cached) return cached;
    await this.doAttach(ref);
    const c = this.characteristics.get(key);
    if (!c) throw new Error('BleSession: not attached');
    return c;
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
          // A failure to reconnect must not escape: it would abandon the remaining attempts and surface the
          // connect error instead of the getPrimaryService one the retries exist for. The next attempt calls
          // getPrimaryService anyway, which fails cleanly if the link is still down.
          try {
            if (!gatt.connected) await gatt.connect();
          } catch (reconnectError) {
            this.opts.log('reconnect between attempts failed', reconnectError);
          }
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error('getPrimaryService failed');
  }

  /**
   * Write one command. ≤ 512 B → single write; longer → fragmented when allowed, else `BleCommandTooLong`.
   * The whole command holds one queue slot, so fragments cannot interleave with another caller's traffic.
   */
  write(bytes: Uint8Array, ref?: BleCharacteristicRef): Promise<void> {
    if (bytes.length > BLE_MAX_WRITE_BYTES && !this.opts.allowChunkedWrites) {
      return Promise.reject(new BleCommandTooLong(bytes.length));
    }
    return this.enqueue(async () => {
      const c = await this.ensureCharacteristic(ref);
      const frames = fragmentCommand(bytes);
      for (const frame of frames) {
        const buf = toArrayBuffer(frame);
        if (c.writeValueWithResponse) await c.writeValueWithResponse(buf);
        else if (c.writeValue) await c.writeValue(buf);
        else throw new Error('BleSession: characteristic is not writable');
      }
    });
  }

  /**
   * Listen for notifications. The disposer detaches this handler only.
   *
   * Notifications stay enabled on the characteristic once started, for the life of the connection.
   * `startNotifications()`/`stopNotifications()` write the peripheral's CCCD — they are real GATT operations,
   * and cycling them around every command bought nothing while adding radio traffic on the exact path that was
   * already failing. It also opened a window: anything the Blox sent between one command's stop and the next
   * command's start was dropped by the OS and lost for good. The Blox sends its reply as ~57 unacknowledged
   * notification frames, so that window mattered.
   */
  async subscribe(handler: (value: Uint8Array) => void, ref?: BleCharacteristicRef): Promise<() => Promise<void>> {
    const { key } = this.key(ref);
    const c = await this.enqueue(async () => {
      const characteristic = await this.ensureCharacteristic(ref);
      if (!this.notifying.has(key)) {
        const epoch = this.connectionEpoch;
        await characteristic.startNotifications();
        // Only record it if the connection we enabled it on is still the current one — a disconnect during
        // that await already cleared the set, and re-adding here would make the next subscribe() skip
        // enabling notifications on the NEW connection.
        if (epoch === this.connectionEpoch) this.notifying.add(key);
      }
      return characteristic;
    });

    const listener = (ev: Event) => {
      const target = ev.target as { value?: DataView | null } | null;
      const dv = target?.value ?? c.value;
      if (!dv) return;
      handler(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength));
    };
    c.addEventListener('characteristicvaluechanged', listener);

    return async () => {
      c.removeEventListener('characteristicvaluechanged', listener);
    };
  }

  /**
   * Re-attach without the chooser. When `watchAdvertisements` exists, wait (â‰¤ timeoutMs) for the device to be
   * seen before connecting â€” connecting to an out-of-range device otherwise hangs for a long time.
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
    this.notifying.clear();
    try {
      this.device.gatt?.disconnect();
    } catch {
      /* ignore */
    }
  }
}

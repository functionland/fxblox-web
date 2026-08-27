/**
 * Bluetooth platform interfaces. `ResponseAssembler` (the ported mobile framing logic) talks to a
 * `BleTransport`; `BleSession` implements it over Web Bluetooth; tests implement it in memory.
 */

export const BLE_SERVICE_UUID = '00000001-710e-4a5b-8d75-3e5b444bc3cf';
export const BLE_COMMAND_CHARACTERISTIC_UUID = '00000003-710e-4a5b-8d75-3e5b444bc3cf';
/** Chrome's chooser filter — the Blox advertises as `fulatower` / `fxblox-rk1` (+ `_new` suffix while unpaired). */
export const BLE_NAME_PREFIXES = ['fulatower', 'fxblox'] as const;
/** Web Bluetooth rejects characteristic writes longer than 512 bytes. */
export const BLE_MAX_WRITE_BYTES = 512;
/** Payload per `chunk <n>/<m> <payload>` fragment (prefix ≤ 16 bytes keeps each write ≤ 512). */
export const BLE_CHUNK_PAYLOAD_BYTES = 480;

export interface BleCharacteristicRef {
  serviceUUID?: string;
  characteristicUUID?: string;
}

export interface BlePeripheralInfo {
  id: string;
  name: string | undefined;
  connected: boolean;
}

export interface BleTransport {
  readonly id: string;
  readonly name: string | undefined;
  isConnected(): boolean;
  /** Ensure the GATT connection + characteristic are ready (idempotent). */
  attach(): Promise<void>;
  /** Write one command. Implementations own the 512-byte cap / fragmentation policy. */
  write(bytes: Uint8Array, ref?: BleCharacteristicRef): Promise<void>;
  /** Start notifications; returns an unsubscribe that also stops them (best effort). */
  subscribe(handler: (value: Uint8Array) => void, ref?: BleCharacteristicRef): Promise<() => Promise<void>>;
  disconnect(): Promise<void>;
}

export class BleCommandTooLong extends Error {
  readonly length: number;
  readonly max: number;
  constructor(length: number, max: number = BLE_MAX_WRITE_BYTES) {
    super(`BLE command is ${length} bytes; Web Bluetooth writes are capped at ${max} bytes (chunked writes disabled)`);
    this.name = 'BleCommandTooLong';
    this.length = length;
    this.max = max;
    Object.setPrototypeOf(this, BleCommandTooLong.prototype);
  }
}

export class BleUnavailableError extends Error {
  constructor(message = 'Web Bluetooth is not available in this browser') {
    super(message);
    this.name = 'BleUnavailableError';
    Object.setPrototypeOf(this, BleUnavailableError.prototype);
  }
}

export class BleNoDeviceError extends Error {
  constructor(message = 'No Bluetooth device is connected') {
    super(message);
    this.name = 'BleNoDeviceError';
    Object.setPrototypeOf(this, BleNoDeviceError.prototype);
  }
}

/**
 * utils/ble — compatibility surface for the ported callers of the mobile `utils/ble.ts`.
 *
 * `ResponseAssembler`, `BleStreamTimeoutError` and the frame types live in `platform/bluetooth`;
 * `safeGetConnectedPeripherals` maps to `BleRegistry.connectedPeripherals()` (only sessions this page opened
 * and that are still connected — Web Bluetooth cannot enumerate OS-level connections).
 */
import { BleRegistry, type BlePeripheralInfo } from '@/platform/bluetooth';

export {
  ResponseAssembler,
  BleStreamTimeoutError,
  BleCommandTooLong,
  BleSession,
  BleRegistry,
  type BleCommandWriter,
  type ChunkedResponse,
  type BleStreamFrame,
  type BleStreamResult,
  type BleTransport,
} from '@/platform/bluetooth';

export type Peripheral = BlePeripheralInfo;

export type DiscoveredDevice = {
  peripheral: Peripheral;
  rssi: number;
};

/**
 * Crash-safe `getConnectedPeripherals` replacement: connected Blox sessions known to this page, current first.
 */
export async function safeGetConnectedPeripherals(_serviceUUIDs: string[] = []): Promise<Peripheral[]> {
  try {
    return BleRegistry.connectedPeripherals();
  } catch (e) {
    console.log('[BLE] connectedPeripherals failed (returning []):', e);
    return [];
  }
}

/** Web Bluetooth needs no runtime permission beyond the chooser gesture. */
export async function hasBleConnectPermission(): Promise<boolean> {
  return true;
}

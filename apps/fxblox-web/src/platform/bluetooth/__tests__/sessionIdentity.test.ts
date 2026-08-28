/**
 * One BleSession per physical device.
 *
 * Chrome hands back the SAME `BluetoothDevice` object for a given device and origin, so every press of
 * "Connect via Bluetooth" used to build another `BleSession` over that one device. Each added its own
 * `gattserverdisconnected` listener and its own `attaching` / `writeQueue` guards, so the guards no longer
 * guarded anything: two sessions issued GATT operations at the same time on one radio.
 *
 * That is exactly what the field log showed — the disconnect line printed twice and then three times, two
 * `doAttach` retry loops interleaved within the same second, and the write that followed failed with
 * `NotSupportedError: GATT operation failed for unknown reason`, which is Chrome refusing a GATT operation
 * issued while another was in flight on that device.
 *
 * These tests pin the two properties that make repeated Connect presses harmless. They are the reason the
 * screens can keep offering a Connect button: `navigator.bluetooth.getDevices()` is behind a Chrome flag and
 * unavailable on stock Chrome, so a remount cannot restore a session silently and the user genuinely has to
 * press Connect again.
 */
import { beforeEach, describe, expect, test } from 'vitest';
import {
  BleSession,
  _resetSessionsForTests,
  sessionForDevice,
  type BluetoothDeviceLike,
} from '../webBluetooth';
import { BleRegistry } from '../registry';
import { createMemoryKvStore } from '@/platform/kvStore';

/** A device stub that records its listeners, the way Chrome's shared BluetoothDevice would see them. */
function deviceWithListenerCount(id = 'dev-1', name = 'fxblox-rk1') {
  const listeners: Record<string, Array<(ev: Event) => void>> = {};
  const gatt = {
    connected: true,
    connect: async () => gatt,
    disconnect: () => undefined,
    getPrimaryService: async () => ({
      getCharacteristic: async () => ({
        value: null,
        writeValueWithResponse: async () => undefined,
        startNotifications: async function () {
          return this;
        },
        stopNotifications: async function () {
          return this;
        },
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    }),
  };
  const device: BluetoothDeviceLike = {
    id,
    name,
    gatt: gatt as never,
    addEventListener: (type, listener) => {
      (listeners[type] ??= []).push(listener);
    },
    removeEventListener: (type, listener) => {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== listener);
    },
  };
  return {
    device,
    countOf: (type: string) => (listeners[type] ?? []).length,
    fire: (type: string) => {
      for (const l of [...(listeners[type] ?? [])]) l(new Event(type));
    },
  };
}

beforeEach(() => {
  _resetSessionsForTests();
  BleRegistry._resetForTests(createMemoryKvStore());
});

describe('BleSession identity', () => {
  test('the same device yields the same session, however many times it is picked', () => {
    const { device } = deviceWithListenerCount();
    const first = sessionForDevice(device);
    const second = sessionForDevice(device);
    const third = sessionForDevice(device);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  test('repeated picks add exactly one gattserverdisconnected listener', () => {
    const { device, countOf } = deviceWithListenerCount();
    sessionForDevice(device);
    sessionForDevice(device);
    sessionForDevice(device);
    // Two listeners is the bug: it is why the field log printed "[BLE] disconnected" twice and then 3x.
    expect(countOf('gattserverdisconnected')).toBe(1);
  });

  test('a disconnect notifies each subscriber once, not once per past Connect press', () => {
    const { device, fire } = deviceWithListenerCount();
    const session = sessionForDevice(device);
    let notified = 0;
    session.onDisconnect(() => {
      notified++;
    });
    sessionForDevice(device); // a second "Connect" press
    sessionForDevice(device); // and a third
    fire('gattserverdisconnected');
    expect(notified).toBe(1);
  });

  test('different devices still get their own sessions', () => {
    const a = deviceWithListenerCount('dev-a');
    const b = deviceWithListenerCount('dev-b');
    expect(sessionForDevice(a.device)).not.toBe(sessionForDevice(b.device));
  });

  test('options supplied on a later pick are applied to the existing session', async () => {
    const { device } = deviceWithListenerCount();
    sessionForDevice(device, { allowChunkedWrites: false });
    const session = sessionForDevice(device, { allowChunkedWrites: true });
    // A command over the 512-byte cap now fragments instead of being rejected outright.
    await expect(session.write(new Uint8Array(600))).resolves.toBeUndefined();
  });

  test('dispose detaches the listener so a torn-down session stops reacting', () => {
    const { device, countOf } = deviceWithListenerCount();
    const session = sessionForDevice(device);
    expect(countOf('gattserverdisconnected')).toBe(1);
    session.dispose();
    expect(countOf('gattserverdisconnected')).toBe(0);
  });
});

/**
 * Chrome does not queue GATT work — it passes each call to the OS stack, and Windows rejects a second
 * operation issued while one is outstanding, as `NotSupportedError: GATT operation failed for unknown reason`.
 * Serializing writes alone left `attach()` and `startNotifications()` (a CCCD write, a real GATT operation)
 * going around the queue.
 */
describe('per-device GATT serialization', () => {
  /** A device whose GATT calls record their overlap, so a concurrency violation is observable. */
  function trackingDevice(id = 'dev-q') {
    let inFlight = 0;
    let maxInFlight = 0;
    let startNotificationsCalls = 0;
    const track = async <T>(value: T): Promise<T> => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return value;
    };
    const characteristic = {
      value: null,
      writeValueWithResponse: async () => {
        await track(undefined);
      },
      startNotifications: async function () {
        startNotificationsCalls++;
        return track(this);
      },
      stopNotifications: async function () {
        return track(this);
      },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    const gatt = {
      connected: true,
      connect: async () => track(gatt),
      disconnect: () => undefined,
      getPrimaryService: async () => track({ getCharacteristic: async () => track(characteristic) }),
    };
    const device: BluetoothDeviceLike = {
      id,
      name: 'fxblox-rk1',
      gatt: gatt as never,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    return {
      device,
      peakConcurrency: () => maxInFlight,
      startNotificationsCalls: () => startNotificationsCalls,
    };
  }

  test('a write and a subscribe fired together never overlap on the radio', async () => {
    const { device, peakConcurrency } = trackingDevice();
    const session = sessionForDevice(device);
    await Promise.all([
      session.write(new Uint8Array([1, 2, 3])),
      session.subscribe(() => undefined),
      session.write(new Uint8Array([4, 5, 6])),
      session.attach(),
    ]);
    // >1 means two GATT operations were in flight at once — exactly what Chrome/Windows rejects.
    expect(peakConcurrency()).toBe(1);
  });

  test('notifications are enabled once and stay on across commands', async () => {
    const { device, startNotificationsCalls } = trackingDevice('dev-n');
    const session = sessionForDevice(device);
    const off1 = await session.subscribe(() => undefined);
    await off1();
    const off2 = await session.subscribe(() => undefined);
    await off2();
    await session.subscribe(() => undefined);
    // Cycling the CCCD per command dropped anything the Blox sent in between; it now writes it once.
    expect(startNotificationsCalls()).toBe(1);
  });

  test('a reconnect re-enables notifications, because the CCCD died with the old connection', async () => {
    const { device, startNotificationsCalls } = trackingDevice('dev-r');
    const session = sessionForDevice(device);
    await session.subscribe(() => undefined);
    expect(startNotificationsCalls()).toBe(1);
    await session.disconnect();
    await session.subscribe(() => undefined);
    expect(startNotificationsCalls()).toBe(2);
  });
});

describe('BleRegistry.register', () => {
  test('re-registering the same session does not stack change subscriptions', () => {
    const { device, fire } = deviceWithListenerCount();
    const session = sessionForDevice(device);
    let emitted = 0;
    BleRegistry.subscribe(() => {
      emitted++;
    });

    BleRegistry.register(session);
    BleRegistry.register(session); // the user pressed Connect again
    BleRegistry.register(session); // and again
    emitted = 0;

    fire('gattserverdisconnected');
    // One disconnect must be one change notification, not one per registration.
    expect(emitted).toBe(1);
  });

  test('a genuinely new session for the same device id still gets its subscription', () => {
    const { device, fire } = deviceWithListenerCount();
    BleRegistry.register(new BleSession(device));
    const replacement = new BleSession(device);
    BleRegistry.register(replacement);
    let emitted = 0;
    BleRegistry.subscribe(() => {
      emitted++;
    });
    fire('gattserverdisconnected');
    expect(emitted).toBeGreaterThan(0);
  });
});

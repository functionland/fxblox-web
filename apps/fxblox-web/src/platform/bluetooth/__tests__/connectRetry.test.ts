/**
 * `gatt.connect()` must be retried, because on Android a first connect routinely fails with GATT status 133.
 *
 * This was found by driving a real phone: the web app failed at `gatt.connect()` with a bare
 * `NetworkError: Connection attempt failed`, while the native app connected to the SAME Blox from the SAME
 * phone seconds later (`onSearchComplete status=0`). The only difference was that its BLE library retries the
 * connect and this did not — one attempt, no recovery, while `getPrimaryService` right beside it had three.
 */
import { describe, expect, test, vi } from 'vitest';
import {
  BleSession,
  BleSubscribeUnsupportedError,
  _resetSessionsForTests,
  type BluetoothDeviceLike,
  type BluetoothRemoteGATTCharacteristicLike,
} from '../webBluetooth';

function fakeDevice(opts: { failConnects?: number } = {}) {
  const characteristic = {
    writeValueWithResponse: vi.fn(async () => undefined),
    startNotifications: vi.fn(async () => characteristic),
    stopNotifications: vi.fn(async () => characteristic),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown as BluetoothRemoteGATTCharacteristicLike;

  let connected = false;
  let attempts = 0;
  const gatt = {
    get connected() {
      return connected;
    },
    connect: vi.fn(async () => {
      attempts += 1;
      if (attempts <= (opts.failConnects ?? 0)) {
        // Exactly what Chrome surfaces for Android's status 133.
        throw new Error('Connection Error: Connection attempt failed.');
      }
      connected = true;
      return gatt;
    }),
    disconnect: vi.fn(() => {
      connected = false;
    }),
    getPrimaryService: vi.fn(async () => ({ getCharacteristic: vi.fn(async () => characteristic) })),
  };
  const device: BluetoothDeviceLike = {
    id: `dev-${Math.random()}`,
    name: 'fulatower_dJpP7',
    gatt,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  return { device, gatt, attemptCount: () => attempts };
}

describe('BleSession connect retry', () => {
  test('a first connect that fails with 133 is retried, and succeeds', async () => {
    _resetSessionsForTests();
    const { device, gatt, attemptCount } = fakeDevice({ failConnects: 1 });
    const session = new BleSession(device, { retryBaseMs: 0, log: () => undefined });

    await expect(session.attach()).resolves.toBeUndefined();
    expect(attemptCount()).toBe(2);
    // The failed attempt is released before retrying: Android registers a GATT client interface per connect and
    // leaves it registered on failure, and exhausting them causes more 133s.
    expect(gatt.disconnect).toHaveBeenCalledTimes(1);
  });

  test('survives two failures, which is the shape seen on a real phone', async () => {
    _resetSessionsForTests();
    const { device, attemptCount } = fakeDevice({ failConnects: 2 });
    const session = new BleSession(device, { retryBaseMs: 0, log: () => undefined });

    await expect(session.attach()).resolves.toBeUndefined();
    expect(attemptCount()).toBe(3);
  });

  test('gives up after the configured attempts and surfaces the real error', async () => {
    _resetSessionsForTests();
    const { device, attemptCount } = fakeDevice({ failConnects: 99 });
    const session = new BleSession(device, { retryBaseMs: 0, connectRetries: 3, log: () => undefined });

    // The user still needs to see why, not a generic failure invented here.
    await expect(session.attach()).rejects.toThrow(/Connection attempt failed/);
    expect(attemptCount()).toBe(3);
  });

  test('a connect that works first time is not retried', async () => {
    _resetSessionsForTests();
    const { device, gatt, attemptCount } = fakeDevice();
    const session = new BleSession(device, { retryBaseMs: 0, log: () => undefined });

    await session.attach();
    expect(attemptCount()).toBe(1);
    expect(gatt.disconnect).not.toHaveBeenCalled();
  });
});

describe('subscribe on a Blox that will not accept a CCCD write', () => {
  test('NotSupportedError becomes a message that names the problem', async () => {
    // The real failure, isolated on a live Blox: connect/getService/getChar/write all succeed and only
    // startNotifications fails, four times out of four. Replies arrive on that characteristic alone, so the
    // command cannot ever complete — a generic GATT error would leave the user with an empty panel and no clue.
    _resetSessionsForTests();
    const characteristic = {
      writeValueWithResponse: vi.fn(async () => undefined),
      startNotifications: vi.fn(async () => {
        const err = new Error('GATT operation failed for unknown reason.');
        err.name = 'NotSupportedError';
        throw err;
      }),
      stopNotifications: vi.fn(async () => undefined),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as BluetoothRemoteGATTCharacteristicLike;
    let connected = false;
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
    const device: BluetoothDeviceLike = {
      id: 'dev-cccd',
      name: 'fulatower_dJpP7',
      gatt,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    const session = new BleSession(device, { retryBaseMs: 0, log: () => undefined });

    await expect(session.subscribe(() => undefined)).rejects.toBeInstanceOf(BleSubscribeUnsupportedError);
    await expect(session.subscribe(() => undefined)).rejects.toThrow(/subscribe for replies/);
  });

  test('any other subscribe failure is passed through unchanged', async () => {
    // Inventing a firmware diagnosis for an unrelated fault is how the wrong thing gets fixed.
    _resetSessionsForTests();
    const characteristic = {
      startNotifications: vi.fn(async () => {
        throw new DOMException('device is gone', 'NetworkError');
      }),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as BluetoothRemoteGATTCharacteristicLike;
    let connected = false;
    const gatt = {
      get connected() {
        return connected;
      },
      connect: vi.fn(async () => {
        connected = true;
        return gatt;
      }),
      disconnect: vi.fn(() => undefined),
      getPrimaryService: vi.fn(async () => ({ getCharacteristic: vi.fn(async () => characteristic) })),
    };
    const device: BluetoothDeviceLike = {
      id: 'dev-other',
      name: 'fulatower_dJpP7',
      gatt,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    const session = new BleSession(device, { retryBaseMs: 0, log: () => undefined });

    await expect(session.subscribe(() => undefined)).rejects.toThrow(/device is gone/);
  });
});
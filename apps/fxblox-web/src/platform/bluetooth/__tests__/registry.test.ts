import { beforeEach, describe, expect, test } from 'vitest';
import { BleRegistry, BLE_DEVICE_MAP_KEY } from '../registry';
import { BleSession, type BluetoothDeviceLike } from '../webBluetooth';
import { ResponseAssembler } from '../responseAssembler';
import { createMemoryKvStore } from '@/platform/kvStore';

function device(id: string, name = 'fulatower', connected = true): BluetoothDeviceLike {
  const gatt = {
    connected,
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
  return { id, name, gatt: gatt as never };
}

let mem = createMemoryKvStore();

beforeEach(() => {
  mem = createMemoryKvStore();
  BleRegistry._resetForTests(mem);
});

describe('BleRegistry', () => {
  test('register makes the session current; connectedPeripherals lists connected Blox sessions, current first', () => {
    const a = new BleSession(device('a', 'fulatower', true));
    const b = new BleSession(device('b', 'fxblox-rk1', true));
    const c = new BleSession(device('c', 'fulatower', false));
    BleRegistry.register(a, { makeCurrent: false });
    BleRegistry.register(b);
    BleRegistry.register(c, { makeCurrent: false });
    expect(BleRegistry.current()?.id).toBe('b');
    expect(BleRegistry.connectedPeripherals().map((p) => p.id)).toEqual(['b', 'a']);
  });

  test('bind/deviceIdFor persist the bloxPeerId → deviceId map under fx.bleDeviceMap.v1', async () => {
    await BleRegistry.bind('12D3KooWBlox', 'dev-9');
    expect(await BleRegistry.deviceIdFor('12D3KooWBlox')).toBe('dev-9');
    expect(JSON.parse(mem.dump()[BLE_DEVICE_MAP_KEY]!)).toEqual({ '12D3KooWBlox': 'dev-9' });
    await BleRegistry.unbind('12D3KooWBlox');
    expect(await BleRegistry.deviceIdFor('12D3KooWBlox')).toBeUndefined();
  });

  test('the map survives a registry reset (read back from the KV store)', async () => {
    await BleRegistry.bind('P', 'D');
    BleRegistry._resetForTests(mem);
    expect(await BleRegistry.deviceIdFor('P')).toBe('D');
  });

  test('sessionFor returns the registered session bound to the blox, null when unbound/unknown', async () => {
    const a = new BleSession(device('dev-a'));
    BleRegistry.register(a);
    await BleRegistry.bind('PEER_A', 'dev-a');
    expect(await BleRegistry.sessionFor('PEER_A')).toBe(a);
    expect(await BleRegistry.sessionFor('PEER_B')).toBeNull();
  });

  test('currentMismatches flags a current session bound to a different blox (audit H1)', async () => {
    BleRegistry.register(new BleSession(device('dev-a')));
    await BleRegistry.bind('PEER_A', 'dev-a');
    await BleRegistry.bind('PEER_B', 'dev-b');
    expect(await BleRegistry.currentMismatches('PEER_A')).toBe(false);
    expect(await BleRegistry.currentMismatches('PEER_B')).toBe(true);
    expect(await BleRegistry.currentMismatches('PEER_UNBOUND')).toBe(false);
  });

  test('a ResponseAssembler without an injected transport resolves the device through the registry', async () => {
    const a = new BleSession(device('dev-a'));
    BleRegistry.register(a);
    const assembler = new ResponseAssembler();
    // Resolves (attach succeeds) and then times out because the fake never answers — proves the lookup worked.
    await expect(assembler.writeToBLEAndWaitForResponse('x', 'dev-a', undefined, undefined, 20)).rejects.toThrow(/timed out/);
    BleRegistry.unregister('dev-a');
    await expect(new ResponseAssembler().writeToBLEAndWaitForResponse('x', 'dev-a')).rejects.toThrow(/No Bluetooth session/);
  });
});

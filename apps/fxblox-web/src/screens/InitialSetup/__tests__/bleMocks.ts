/**
 * Shared state for the `@/platform/bluetooth` partial mock used by the setup screen tests. Each test file does:
 *
 *   vi.mock('@/platform/bluetooth', async (importOriginal) => mockBluetoothModule(await importOriginal(), ble));
 *
 * `ble.pick` stands in for `BleSession.pick()` (the Chrome chooser) and `ble.responses` maps a BLE command to the
 * reply `ResponseAssembler.writeToBLEAndWaitForResponse` resolves with (a function → called, an Error → thrown).
 */
import { vi } from 'vitest';

export interface BleMockState {
  pick: ReturnType<typeof vi.fn>;
  supported: boolean;
  responses: Record<string, unknown>;
  written: string[];
}

export function createBleMockState(): BleMockState {
  return { pick: vi.fn(), supported: true, responses: {}, written: [] };
}

/** Reset IN PLACE — the mock module closes over the state object created when the module was first mocked. */
export function resetBleMockState(state: BleMockState): void {
  state.pick = vi.fn();
  state.supported = true;
  state.responses = {};
  state.written = [];
}

export function fakeSession(id = 'ble-device-1', name = 'fulatower') {
  return {
    id,
    name,
    isConnected: () => true,
    attach: vi.fn(async () => undefined),
    onDisconnect: () => () => true,
    write: vi.fn(async () => undefined),
    subscribe: vi.fn(async () => async () => undefined),
    disconnect: vi.fn(async () => undefined),
    reconnect: vi.fn(async () => undefined),
  };
}

export function mockBluetoothModule(actual: object, ble: BleMockState) {
  class FakeResponseAssembler {
    async writeToBLEAndWaitForResponse(command: string): Promise<unknown> {
      ble.written.push(command);
      const key = command.split(' ')[0] ?? command;
      const reply = ble.responses[command] ?? ble.responses[key];
      if (reply instanceof Error) throw reply;
      if (typeof reply === 'function') return (reply as (cmd: string) => unknown)(command);
      return reply ?? null;
    }
    cleanup(): void {}
    reset(): void {}
  }
  return {
    ...actual,
    BleSession: { pick: (...args: unknown[]) => ble.pick(...args), knownDevices: async () => [] },
    ResponseAssembler: FakeResponseAssembler,
    isWebBluetoothSupported: () => ble.supported,
  };
}

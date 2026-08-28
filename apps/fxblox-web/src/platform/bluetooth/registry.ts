/**
 * BleRegistry — the `safeGetConnectedPeripherals` replacement AND the bloxPeerId ↔ BLE device map that closes
 * audit H1 on web (`fx.bleDeviceMap.v1` in the KV store). Screens `pick()` a session, `register()` it (usually
 * as current), and `bind(bloxPeerId, deviceId)` once the pairing flow knows both ids; later calls resolve the
 * session for the SELECTED blox instead of "whatever is connected".
 */
import { kvStore, type KeyValueStore } from '../kvStore';
import type { BlePeripheralInfo, BleTransport } from './types';
import { BleSession, isFxBloxDeviceName, sessionForDevice, type BleSessionOptions } from './webBluetooth';
import { setDefaultTransportResolver } from './responseAssembler';

export const BLE_DEVICE_MAP_KEY = 'fx.bleDeviceMap.v1';

type DeviceMap = Record<string, string>; // bloxPeerId → deviceId

export class BleRegistryImpl {
  private sessions = new Map<string, BleSession>();
  private currentId: string | null = null;
  private map: DeviceMap | null = null;
  private listeners = new Set<() => void>();
  private kv: KeyValueStore;

  constructor(kv: KeyValueStore = kvStore) {
    this.kv = kv;
    setDefaultTransportResolver((id) => this.get(id) ?? (this.currentId === null ? null : null));
  }

  /** Test hook: swap the KV backing store and drop all state. */
  _resetForTests(kv?: KeyValueStore): void {
    this.sessions.clear();
    this.currentId = null;
    this.map = null;
    this.listeners.clear();
    if (kv) this.kv = kv;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const cb of this.listeners) {
      try {
        cb();
      } catch {
        /* ignore */
      }
    }
  }

  register(session: BleSession, opts: { makeCurrent?: boolean } = {}): BleSession {
    // `connectBle()` registers on every Connect press and now hands back the same session object, so the emit
    // subscription is added only the first time this exact session is seen. Re-adding it made `emit()` fire
    // once per past press — the same accumulating-listener bug that stacked sessions caused on the device.
    const alreadyKnown = this.sessions.get(session.id) === session;
    this.sessions.set(session.id, session);
    if (opts.makeCurrent ?? true) this.currentId = session.id;
    if (!alreadyKnown) session.onDisconnect(() => this.emit());
    this.emit();
    return session;
  }

  unregister(deviceId: string): void {
    this.sessions.delete(deviceId);
    if (this.currentId === deviceId) this.currentId = null;
    this.emit();
  }

  setCurrent(deviceId: string | null): void {
    this.currentId = deviceId && this.sessions.has(deviceId) ? deviceId : null;
    this.emit();
  }

  /** The active session (may be disconnected — check `isConnected()`), or null. */
  current(): BleSession | null {
    return this.currentId ? (this.sessions.get(this.currentId) ?? null) : null;
  }

  get(deviceId: string): BleTransport | undefined {
    return this.sessions.get(deviceId);
  }

  sessions_(): BleSession[] {
    return [...this.sessions.values()];
  }

  /** The `safeGetConnectedPeripherals([])` shape: only CONNECTED Blox sessions, current first. */
  connectedPeripherals(): BlePeripheralInfo[] {
    const list = [...this.sessions.values()].filter((s) => s.isConnected() && isFxBloxDeviceName(s.name ?? 'fulatower'));
    list.sort((a, b) => (a.id === this.currentId ? -1 : b.id === this.currentId ? 1 : 0));
    return list.map((s) => ({ id: s.id, name: s.name, connected: true }));
  }

  private async loadMap(): Promise<DeviceMap> {
    if (this.map) return this.map;
    try {
      const raw = await this.kv.getItem(BLE_DEVICE_MAP_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      this.map = parsed && typeof parsed === 'object' ? (parsed as DeviceMap) : {};
    } catch {
      this.map = {};
    }
    return this.map;
  }

  async bind(bloxPeerId: string, deviceId: string): Promise<void> {
    if (!bloxPeerId || !deviceId) return;
    const map = await this.loadMap();
    map[bloxPeerId] = deviceId;
    await this.kv.setItem(BLE_DEVICE_MAP_KEY, JSON.stringify(map));
  }

  async unbind(bloxPeerId: string): Promise<void> {
    const map = await this.loadMap();
    if (bloxPeerId in map) {
      delete map[bloxPeerId];
      await this.kv.setItem(BLE_DEVICE_MAP_KEY, JSON.stringify(map));
    }
  }

  async deviceIdFor(bloxPeerId: string): Promise<string | undefined> {
    const map = await this.loadMap();
    return map[bloxPeerId];
  }

  /**
   * Session for the selected blox: a registered session with the bound device id, else one rebuilt from
   * `getDevices()` (no chooser), else null — the caller then offers the explicit "Connect via Bluetooth" button.
   */
  async sessionFor(bloxPeerId: string, opts: BleSessionOptions = {}): Promise<BleSession | null> {
    const deviceId = await this.deviceIdFor(bloxPeerId);
    if (!deviceId) return null;
    const existing = this.sessions.get(deviceId);
    if (existing) return existing;
    const known = await BleSession.knownDevices();
    const device = known.find((d) => d.id === deviceId);
    if (!device) return null;
    // sessionForDevice, not `new BleSession`: two sessions over one device race each other's GATT operations.
    return this.register(sessionForDevice(device, opts), { makeCurrent: false });
  }

  /** True when the current session is bound to a DIFFERENT blox than `bloxPeerId` (surface the mismatch). */
  async currentMismatches(bloxPeerId: string): Promise<boolean> {
    const cur = this.current();
    if (!cur) return false;
    const bound = await this.deviceIdFor(bloxPeerId);
    return !!bound && bound !== cur.id;
  }
}

export const BleRegistry = new BleRegistryImpl();

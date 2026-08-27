/**
 * Persist envelope + migrations. Each case seeds a KV store with a blob recorded in the MOBILE format
 * (`{ state, version }` under the mobile key name), resets the module registry, imports the stores and asserts
 * the hydrated state — i.e. a phone's AsyncStorage export hydrates the web app 1:1.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryKvStore } from '@/platform/kvStore';
import { waitFor } from '@/test/helpers/waitFor';

vi.mock('@/lib/fula', () => ({
  fula: { isReady: vi.fn(async () => true), checkConnection: vi.fn(async () => true), logout: vi.fn(), shutdown: vi.fn(), newClient: vi.fn() },
  blockchain: {},
  fxblox: {},
  identity: {},
  configure: vi.fn(),
}));
vi.mock('@/platform/network', () => ({ isOnline: vi.fn(async () => true), onOnlineChange: () => () => undefined, connectionInfo: () => ({ online: true }), onConnectionChange: () => () => undefined }));

let mem = createMemoryKvStore();

async function loadStores() {
  const persist = await import('@/stores/persist/idbStorage');
  persist._setPersistBackingForTests(mem);
  const [{ useUserProfileStore }, { useBloxsStore }, { useSettingsStore }, { usePluginsStore }] = await Promise.all([
    import('@/stores/useUserProfileStore'),
    import('@/stores/useBloxsStore'),
    import('@/stores/useSettingsStore'),
    import('@/stores/usePluginsStore'),
  ]);
  await waitFor(() => useUserProfileStore.getState()._hasHydrated && useBloxsStore.getState()._hasHydrated && useSettingsStore.getState()._hasHydrated && usePluginsStore.getState()._hasHydrated, {
    label: 'hydration',
  });
  return { useUserProfileStore, useBloxsStore, useSettingsStore, usePluginsStore, PERSIST_KEYS: persist.PERSIST_KEYS };
}

beforeEach(() => {
  vi.resetModules();
  mem = createMemoryKvStore();
});

describe('persist envelope', () => {
  test('writes `{ state, version }` under the mobile key with ONLY the partialized fields', async () => {
    const { useSettingsStore, PERSIST_KEYS } = await loadStores();
    useSettingsStore.getState().setColorScheme('light');
    useSettingsStore.getState().setBloxStatusCheckInterval(480);
    await waitFor(() => (mem.dump()[PERSIST_KEYS.settings] ?? '').includes('"light"'));
    const blob = JSON.parse(mem.dump()[PERSIST_KEYS.settings]!);
    expect(blob.version).toBe(0);
    expect(Object.keys(blob.state).sort()).toEqual(['baseAuthorized', 'bloxStatusCheckInterval', 'colorScheme', 'debugMode', 'isAuto', 'preferBluetooth', 'selectedChain']);
    expect(blob.state.colorScheme).toBe('light');
    expect(blob.state).not.toHaveProperty('_hasHydrated');
    expect(blob.state).not.toHaveProperty('setColorScheme');
  });

  test('secrets never reach the persisted user profile; bloxs persist only the 4 documented keys', async () => {
    const { useUserProfileStore, useBloxsStore, PERSIST_KEYS } = await loadStores();
    useUserProfileStore.setState({ password: 'SECRET', signiture: '0xSIG', address: '0xADDR', walletId: 'w1', appPeerId: '12D3KooWApp' });
    useBloxsStore.getState().addBlox({ peerId: 'p1', name: 'Home' });
    useBloxsStore.setState({ bloxsConnectionStatus: { p1: 'CONNECTED' }, currentBloxPeerId: 'p1' });
    await waitFor(() => (mem.dump()[PERSIST_KEYS.userProfile] ?? '').includes('w1') && (mem.dump()[PERSIST_KEYS.bloxs] ?? '').includes('Home'));
    const up = JSON.parse(mem.dump()[PERSIST_KEYS.userProfile]!);
    expect(up.version).toBe(1);
    expect(JSON.stringify(up)).not.toContain('SECRET');
    expect(JSON.stringify(up)).not.toContain('0xSIG');
    expect(up.state.appPeerId).toBe('12D3KooWApp');
    const bx = JSON.parse(mem.dump()[PERSIST_KEYS.bloxs]!);
    expect(bx.version).toBe(3);
    expect(Object.keys(bx.state).sort()).toEqual(['bloxs', 'bloxsPropertyInfo', 'bloxsSpaceInfo', 'currentBloxPeerId'].sort());
    expect(bx.state).not.toHaveProperty('bloxsConnectionStatus');
  });

  test('plugins store persists NOTHING (per-blox live truth)', async () => {
    const { usePluginsStore, PERSIST_KEYS } = await loadStores();
    usePluginsStore.setState({ activePluginsByBlox: { p1: ['blox-ai'] } });
    await waitFor(() => mem.dump()[PERSIST_KEYS.plugins] !== undefined);
    expect(JSON.parse(mem.dump()[PERSIST_KEYS.plugins]!)).toEqual({ state: {}, version: 1 });
  });
});

describe('migrations on recorded mobile blobs', () => {
  test('userProfileSlice v0 → v1 seeds the bloxs store from bloxPeerIds (Blox Unit #n) and rewrites version 1', async () => {
    // Recorded shape of a 2023-era mobile install: v0 user profile with peer ids, no bloxsModelSlice yet.
    await mem.setItem(
      'userProfileSlice',
      JSON.stringify({
        state: { walletId: 'metamask', bloxPeerIds: ['12D3KooWBloxOne', '12D3KooWBloxTwo'], accounts: [], fulaReinitCount: 0 },
        version: 0,
      }),
    );
    const { useUserProfileStore, useBloxsStore } = await loadStores();
    expect(useUserProfileStore.getState().walletId).toBe('metamask');
    expect(useUserProfileStore.getState().bloxPeerIds).toEqual(['12D3KooWBloxOne', '12D3KooWBloxTwo']);
    expect(useBloxsStore.getState().bloxs).toEqual({
      '12D3KooWBloxOne': { peerId: '12D3KooWBloxOne', name: 'Blox Unit #0' },
      '12D3KooWBloxTwo': { peerId: '12D3KooWBloxTwo', name: 'Blox Unit #1' },
    });
    await waitFor(() => JSON.parse(mem.dump().userProfileSlice ?? '{}').version === 1);
  });

  test('bloxsModelSlice v1 → v3 lifts freeSpace/propertyInfo into the keyed maps and defaults clusterPeerId', async () => {
    const freeSpace = { device_count: 1, size: 1_000_000, avail: 400_000, used: 600_000, used_percentage: 60 };
    const propertyInfo = { hardwareID: 'hw-abc', ota_version: '2024.1', restartNeeded: 'false' };
    await mem.setItem(
      'bloxsModelSlice',
      JSON.stringify({
        state: {
          bloxs: { '12D3KooWBloxOne': { peerId: '12D3KooWBloxOne', name: 'Office', freeSpace, propertyInfo } },
          currentBloxPeerId: '12D3KooWBloxOne',
        },
        version: 1,
      }),
    );
    const { useBloxsStore } = await loadStores();
    const s = useBloxsStore.getState();
    expect(s.currentBloxPeerId).toBe('12D3KooWBloxOne');
    expect(s.bloxsSpaceInfo?.['12D3KooWBloxOne']).toEqual(freeSpace);
    expect(s.bloxsPropertyInfo?.['12D3KooWBloxOne']).toEqual(propertyInfo);
    expect(s.bloxs['12D3KooWBloxOne']?.clusterPeerId).toBe('12D3KooWBloxOne');
    await waitFor(() => JSON.parse(mem.dump().bloxsModelSlice ?? '{}').version === 3);
  });

  test('bloxsModelSlice v2 → v3 only defaults clusterPeerId (existing maps untouched)', async () => {
    await mem.setItem(
      'bloxsModelSlice',
      JSON.stringify({
        state: {
          bloxs: { A: { peerId: 'A', name: 'A' }, B: { peerId: 'B', name: 'B', clusterPeerId: '12D3KooWClusterB' } },
          bloxsSpaceInfo: { A: { device_count: 1, size: 1, avail: 1, used: 0, used_percentage: 0 } },
          bloxsPropertyInfo: {},
          currentBloxPeerId: 'B',
        },
        version: 2,
      }),
    );
    const { useBloxsStore } = await loadStores();
    const s = useBloxsStore.getState();
    expect(s.bloxs.A?.clusterPeerId).toBe('A');
    expect(s.bloxs.B?.clusterPeerId).toBe('12D3KooWClusterB');
    expect(s.getClusterPeerIdForBlox('A')).toBeUndefined(); // stale-migration default is not a real cluster id
    expect(s.getCurrentClusterPeerId()).toBe('12D3KooWClusterB');
    expect(s.bloxsSpaceInfo?.A?.size).toBe(1);
  });

  test('PluginsModelSlice v0 global list is dropped by migrate', async () => {
    await mem.setItem('PluginsModelSlice', JSON.stringify({ state: { activePlugins: ['stale-plugin'] }, version: 0 }));
    const { usePluginsStore } = await loadStores();
    expect(usePluginsStore.getState().activePluginsByBlox).toEqual({});
    expect(usePluginsStore.getState()).not.toHaveProperty('activePlugins');
  });
});

/**
 * Ported from apps/box/src/utils/__tests__/manualBloxIp.test.ts — AsyncStorage → KeyValueStore.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { loadManualBloxIp, saveManualBloxIp, removeManualBloxIp, _setStoreForTests } from '../manualBloxIp';
import { createMemoryKvStore, type KeyValueStore } from '@/platform/kvStore';

const KEY = (id: string) => `@blox-ai/manual-ip/v1/${id}`;
const PEER = 'QmBloxPeerOne';
const PEER2 = 'QmBloxPeerTwo';

let mem: ReturnType<typeof createMemoryKvStore>;
let spy: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> };

beforeEach(() => {
  mem = createMemoryKvStore();
  spy = {
    getItem: vi.fn((k: string) => mem.getItem(k)),
    setItem: vi.fn((k: string, v: string) => mem.setItem(k, v)),
    removeItem: vi.fn((k: string) => mem.removeItem(k)),
  };
  const store: KeyValueStore = {
    getItem: (k) => spy.getItem(k) as Promise<string | null>,
    setItem: (k, v) => spy.setItem(k, v) as Promise<void>,
    removeItem: (k) => spy.removeItem(k) as Promise<void>,
    getAllKeys: () => mem.getAllKeys(),
    clear: () => mem.clear(),
  };
  _setStoreForTests(store);
});

describe('loadManualBloxIp', () => {
  test('returns null when nothing is stored', async () => {
    await expect(loadManualBloxIp(PEER)).resolves.toBeNull();
  });

  test('returns null for an empty peer id without touching storage', async () => {
    await expect(loadManualBloxIp('')).resolves.toBeNull();
    expect(spy.getItem).not.toHaveBeenCalled();
  });

  test('returns the trimmed stored IP', async () => {
    await mem.setItem(KEY(PEER), '  192.168.1.50  ');
    await expect(loadManualBloxIp(PEER)).resolves.toBe('192.168.1.50');
  });

  test('returns null for a blank stored value', async () => {
    await mem.setItem(KEY(PEER), '   ');
    await expect(loadManualBloxIp(PEER)).resolves.toBeNull();
  });

  test('returns null and warns when getItem throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    spy.getItem.mockRejectedValueOnce(new Error('boom'));
    await expect(loadManualBloxIp(PEER)).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('saveManualBloxIp', () => {
  test('persists the trimmed IP under the per-blox key', async () => {
    await saveManualBloxIp(PEER, '  10.0.0.5  ');
    expect(mem.dump()[KEY(PEER)]).toBe('10.0.0.5');
  });

  test('keys IPs independently per blox', async () => {
    await saveManualBloxIp(PEER, '192.168.1.2');
    await saveManualBloxIp(PEER2, '192.168.1.3');
    await expect(loadManualBloxIp(PEER)).resolves.toBe('192.168.1.2');
    await expect(loadManualBloxIp(PEER2)).resolves.toBe('192.168.1.3');
  });

  test('is a no-op for an empty peer id', async () => {
    await saveManualBloxIp('', '192.168.1.2');
    expect(spy.setItem).not.toHaveBeenCalled();
    expect(spy.removeItem).not.toHaveBeenCalled();
  });

  test('clears the entry when given a blank IP', async () => {
    await mem.setItem(KEY(PEER), '192.168.1.9');
    await saveManualBloxIp(PEER, '   ');
    expect(spy.setItem).not.toHaveBeenCalled();
    expect(spy.removeItem).toHaveBeenCalledWith(KEY(PEER));
    expect(mem.dump()[KEY(PEER)]).toBeUndefined();
  });

  test('swallows setItem errors (never throws)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    spy.setItem.mockRejectedValueOnce(new Error('disk full'));
    await expect(saveManualBloxIp(PEER, '192.168.1.50')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('removeManualBloxIp', () => {
  test('removes the stored entry', async () => {
    await mem.setItem(KEY(PEER), '192.168.1.50');
    await removeManualBloxIp(PEER);
    expect(mem.dump()[KEY(PEER)]).toBeUndefined();
  });

  test('is a no-op for an empty peer id', async () => {
    await removeManualBloxIp('');
    expect(spy.removeItem).not.toHaveBeenCalled();
  });

  test('swallows removeItem errors (never throws)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    spy.removeItem.mockRejectedValueOnce(new Error('boom'));
    await expect(removeManualBloxIp(PEER)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

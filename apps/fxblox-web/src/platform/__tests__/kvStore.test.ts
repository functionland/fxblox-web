import { beforeEach, describe, expect, test } from 'vitest';
import { createIdbKvStore, createMemoryKvStore, kvStore } from '../kvStore';

describe('kvStore (idb-keyval over fake IndexedDB)', () => {
  beforeEach(async () => {
    await kvStore.clear();
  });

  test('round-trips strings, lists keys, removes and clears', async () => {
    expect(await kvStore.getItem('missing')).toBeNull();
    await kvStore.setItem('fx.relayCache.v1', '{"list":[]}');
    await kvStore.setItem('userLanguage', 'en');
    expect(await kvStore.getItem('fx.relayCache.v1')).toBe('{"list":[]}');
    expect((await kvStore.getAllKeys()).sort()).toEqual(['fx.relayCache.v1', 'userLanguage']);
    await kvStore.removeItem('userLanguage');
    expect(await kvStore.getItem('userLanguage')).toBeNull();
    await kvStore.clear();
    expect(await kvStore.getAllKeys()).toEqual([]);
  });

  test('two handles share the same database', async () => {
    const other = createIdbKvStore();
    await kvStore.setItem('k', 'v');
    expect(await other.getItem('k')).toBe('v');
  });
});

describe('createMemoryKvStore', () => {
  test('behaves like the IDB store and exposes dump()', async () => {
    const mem = createMemoryKvStore({ seeded: '1' });
    expect(await mem.getItem('seeded')).toBe('1');
    await mem.setItem('a', 'b');
    expect(mem.dump()).toEqual({ seeded: '1', a: 'b' });
    await mem.removeItem('seeded');
    expect(await mem.getAllKeys()).toEqual(['a']);
    await mem.clear();
    expect(mem.dump()).toEqual({});
  });
});

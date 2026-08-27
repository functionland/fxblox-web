/**
 * Ported from apps/box/src/utils/__tests__/aiSessionPersistence.test.ts — AsyncStorage → in-memory KeyValueStore.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  _resetForTests,
  clearPersistedSession,
  DEBOUNCE_EVERY_N,
  DEBOUNCE_MAX_MS,
  flushDebounce,
  loadPersistedSession,
  PERSISTED_SESSION_MAX_AGE_MS,
  schedulePersist,
  type PersistedSession,
} from '../aiSessionPersistence';
import { createMemoryKvStore } from '@/platform/kvStore';

const KEY = '@blox-ai/persisted-session/v1';
let mem = createMemoryKvStore();

const SAMPLE: PersistedSession = {
  sessionId: 'sess-test-1',
  lastEventSeq: 7,
  lastPrompt: 'why disconnected?',
  lastScenarioId: 'disconnected',
  savedAt: Date.now(),
};

beforeEach(() => {
  mem = createMemoryKvStore();
  _resetForTests(mem);
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('schedulePersist debounce', () => {
  test('coalesces N writes into a single setItem after DEBOUNCE_EVERY_N events', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < DEBOUNCE_EVERY_N; i++) {
      schedulePersist({ ...SAMPLE, lastEventSeq: i });
    }
    await Promise.resolve();
    await Promise.resolve();
    const raw = mem.dump()[KEY];
    expect(raw).toBeDefined();
    expect(JSON.parse(raw!).lastEventSeq).toBe(DEBOUNCE_EVERY_N - 1);
  });

  test('flushes via timer when below the event-count threshold', async () => {
    vi.useFakeTimers();
    schedulePersist({ ...SAMPLE, lastEventSeq: 3 });
    expect(mem.dump()[KEY]).toBeUndefined();
    vi.advanceTimersByTime(DEBOUNCE_MAX_MS);
    await Promise.resolve();
    await Promise.resolve();
    expect(mem.dump()[KEY]).toBeDefined();
  });

  test('repeated calls update pending state in place; only one write fires', async () => {
    vi.useFakeTimers();
    schedulePersist({ ...SAMPLE, lastEventSeq: 1 });
    schedulePersist({ ...SAMPLE, lastEventSeq: 2 });
    schedulePersist({ ...SAMPLE, lastEventSeq: 3 });
    vi.advanceTimersByTime(DEBOUNCE_MAX_MS);
    await Promise.resolve();
    await Promise.resolve();
    expect(JSON.parse(mem.dump()[KEY]!).lastEventSeq).toBe(3);
  });
});

describe('flushDebounce', () => {
  test('writes the pending state immediately + cancels the timer', async () => {
    vi.useFakeTimers();
    schedulePersist({ ...SAMPLE, lastEventSeq: 99 });
    expect(mem.dump()[KEY]).toBeUndefined();
    await flushDebounce();
    expect(mem.dump()[KEY]).toBeDefined();
    const beforeAdvance = mem.dump()[KEY];
    vi.advanceTimersByTime(DEBOUNCE_MAX_MS * 10);
    await Promise.resolve();
    expect(mem.dump()[KEY]).toBe(beforeAdvance);
  });

  test('no-op when nothing is pending', async () => {
    await expect(flushDebounce()).resolves.toBeUndefined();
    expect(mem.dump()[KEY]).toBeUndefined();
  });
});

describe('loadPersistedSession', () => {
  test('returns null when nothing is stored', async () => {
    await expect(loadPersistedSession()).resolves.toBeNull();
  });

  test('round-trips a valid snapshot', async () => {
    schedulePersist(SAMPLE);
    await flushDebounce();
    await expect(loadPersistedSession()).resolves.toEqual(SAMPLE);
  });

  test('discards snapshots older than PERSISTED_SESSION_MAX_AGE_MS + removes the key', async () => {
    await mem.setItem(KEY, JSON.stringify({ ...SAMPLE, savedAt: Date.now() - PERSISTED_SESSION_MAX_AGE_MS - 1000 }));
    await expect(loadPersistedSession()).resolves.toBeNull();
    expect(mem.dump()[KEY]).toBeUndefined();
  });

  test('discards corrupt JSON + removes the key', async () => {
    await mem.setItem(KEY, 'not-json{{{');
    await expect(loadPersistedSession()).resolves.toBeNull();
    expect(mem.dump()[KEY]).toBeUndefined();
  });

  test('discards schema-invalid blobs (missing required fields)', async () => {
    await mem.setItem(KEY, JSON.stringify({ sessionId: 'x', lastEventSeq: 1 }));
    await expect(loadPersistedSession()).resolves.toBeNull();
    expect(mem.dump()[KEY]).toBeUndefined();
  });
});

describe('clearPersistedSession', () => {
  test('removes the stored snapshot + cancels pending writes', async () => {
    vi.useFakeTimers();
    await mem.setItem(KEY, JSON.stringify(SAMPLE));
    schedulePersist({ ...SAMPLE, lastEventSeq: 42 });
    await clearPersistedSession();
    expect(mem.dump()[KEY]).toBeUndefined();
    vi.advanceTimersByTime(DEBOUNCE_MAX_MS * 10);
    await Promise.resolve();
    expect(mem.dump()[KEY]).toBeUndefined();
  });
});

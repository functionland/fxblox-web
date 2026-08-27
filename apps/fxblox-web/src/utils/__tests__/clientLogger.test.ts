/**
 * Ported from apps/box/src/utils/__tests__/phoneLogger.test.ts — AsyncStorage → KeyValueStore, NetInfo →
 * platform/network. The phone_context v1 field names and caps are unchanged.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/platform/network', () => {
  const listeners = new Set<() => void>();
  return {
    connectionInfo: vi.fn(() => ({ online: true, type: 'wifi', effectiveType: '4g' })),
    onConnectionChange: vi.fn((cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }),
    __fire: () => listeners.forEach((l) => l()),
  };
});

import * as network from '@/platform/network';
import { recordConnectionAttempt, recordNetworkChange, recordAppError, gatherContext, clearPhoneLogger, installNetworkLogger, _setStoreForTests, appendLog, getLogLines, clearLogLines, formatLogLines } from '../clientLogger';
import { createMemoryKvStore } from '@/platform/kvStore';

const fireChange = (network as unknown as { __fire: () => void }).__fire;
const onConnectionChange = network.onConnectionChange as unknown as ReturnType<typeof vi.fn>;
const connectionInfo = network.connectionInfo as unknown as ReturnType<typeof vi.fn>;

beforeEach(async () => {
  _setStoreForTests(createMemoryKvStore());
  onConnectionChange.mockClear();
  connectionInfo.mockReturnValue({ online: true, type: 'wifi', effectiveType: '4g' });
  await clearPhoneLogger();
  clearLogLines();
});

describe('clientLogger ring buffers', () => {
  test('connection_attempts caps at 20 (FIFO drop)', async () => {
    for (let i = 0; i < 25; i++) {
      await recordConnectionAttempt({ ts: `2026-05-24T07:${String(i).padStart(2, '0')}:00Z`, transport: 'libp2p', success: i % 2 === 0 });
    }
    const ctx = await gatherContext();
    expect(ctx.recent_connection_attempts).toHaveLength(20);
    expect(ctx.recent_connection_attempts![0]!.ts).toBe('2026-05-24T07:05:00Z');
    expect(ctx.recent_connection_attempts![19]!.ts).toBe('2026-05-24T07:24:00Z');
  });

  test('network_changes caps at 10', async () => {
    for (let i = 0; i < 15; i++) {
      await recordNetworkChange({ ts: `2026-05-24T07:${String(i).padStart(2, '0')}:00Z`, from: `prev-${i}`, to: `cur-${i}` });
    }
    const ctx = await gatherContext();
    expect(ctx.recent_network_changes).toHaveLength(10);
    expect(ctx.recent_network_changes![0]!.from).toBe('prev-5');
  });

  test('app_errors caps at 10', async () => {
    for (let i = 0; i < 12; i++) {
      await recordAppError({ ts: `2026-05-24T07:${String(i).padStart(2, '0')}:00Z`, screen: 'Diagnostics', error_summary: `error ${i}` });
    }
    const ctx = await gatherContext();
    expect(ctx.recent_app_errors).toHaveLength(10);
    expect(ctx.recent_app_errors![0]!.error_summary).toBe('error 2');
  });

  test('last_successful_blox_interaction_ts tracks only successful attempts', async () => {
    await recordConnectionAttempt({ ts: '2026-05-24T07:00:00Z', transport: 'libp2p', success: false });
    await recordConnectionAttempt({ ts: '2026-05-24T07:05:00Z', transport: 'libp2p', success: true });
    await recordConnectionAttempt({ ts: '2026-05-24T07:10:00Z', transport: 'libp2p', success: false });
    expect((await gatherContext()).last_successful_blox_interaction_ts).toBe('2026-05-24T07:05:00Z');
  });

  test('concurrent writes are serialised (no lost updates)', async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) => recordAppError({ ts: `t${i}`, error_summary: `e${i}` })));
    expect((await gatherContext()).recent_app_errors).toHaveLength(10);
  });
});

describe('clientLogger sanitization (caps in gatherContext)', () => {
  test('connection_attempt.target_blox_id truncated to 128 chars', async () => {
    await recordConnectionAttempt({ ts: 't', transport: 'libp2p', success: false, target_blox_id: 'A'.repeat(500) });
    expect((await gatherContext()).recent_connection_attempts![0]!.target_blox_id!.length).toBe(128);
  });

  test('connection_attempt.error truncated to 500 chars', async () => {
    await recordConnectionAttempt({ ts: 't', transport: 'libp2p', success: false, error: 'X'.repeat(1000) });
    expect((await gatherContext()).recent_connection_attempts![0]!.error!.length).toBe(500);
  });

  test('connection_attempt.duration_ms clamped to [0, 600000]', async () => {
    await recordConnectionAttempt({ ts: 't', transport: 'libp2p', success: false, duration_ms: 9999999 });
    expect((await gatherContext()).recent_connection_attempts![0]!.duration_ms).toBe(600000);
  });

  test('network_change.from/to truncated to 64 chars', async () => {
    await recordNetworkChange({ ts: 't', from: 'a'.repeat(100), to: 'b'.repeat(100) });
    const c = (await gatherContext()).recent_network_changes![0]!;
    expect(c.from!.length).toBe(64);
    expect(c.to!.length).toBe(64);
  });

  test('app_error.error_summary truncated to 500 chars', async () => {
    await recordAppError({ ts: 't', error_summary: 'Z'.repeat(1000) });
    expect((await gatherContext()).recent_app_errors![0]!.error_summary.length).toBe(500);
  });
});

describe('clientLogger.gatherContext shape', () => {
  test('returns minimal valid context when no data', async () => {
    const ctx = await gatherContext();
    expect(ctx).toHaveProperty('app_version');
    expect(ctx).toHaveProperty('os');
    expect(ctx).toHaveProperty('os_version');
    expect(['android', 'ios', 'web']).toContain(ctx.os);
    expect(ctx.app_version.length).toBeLessThanOrEqual(32);
    expect(ctx.os_version.length).toBeLessThanOrEqual(32);
    expect((ctx.device_model ?? '').length).toBeLessThanOrEqual(64);
    expect(ctx.recent_connection_attempts).toBeUndefined();
    expect(ctx.recent_network_changes).toBeUndefined();
    expect(ctx.recent_app_errors).toBeUndefined();
  });

  test('netinfo populated from connectionInfo', async () => {
    const ctx = await gatherContext();
    expect(ctx.netinfo).toBeDefined();
    expect(ctx.netinfo!.is_connected).toBe(true);
    expect(ctx.netinfo!.type).toBe('wifi');
  });

  test('clearPhoneLogger empties all rings', async () => {
    await recordConnectionAttempt({ ts: 't', transport: 'libp2p', success: true });
    await recordNetworkChange({ ts: 't' });
    await recordAppError({ ts: 't', error_summary: 'x' });
    await clearPhoneLogger();
    const ctx = await gatherContext();
    expect(ctx.recent_connection_attempts).toBeUndefined();
    expect(ctx.recent_network_changes).toBeUndefined();
    expect(ctx.recent_app_errors).toBeUndefined();
    expect(ctx.last_successful_blox_interaction_ts).toBeUndefined();
  });
});

describe('installNetworkLogger', () => {
  test('idempotent — second install does not double-subscribe; records a change on transition', async () => {
    const unsub1 = installNetworkLogger();
    const unsub2 = installNetworkLogger();
    expect(unsub2).toBe(unsub1);
    expect(onConnectionChange).toHaveBeenCalledTimes(1);

    connectionInfo.mockReturnValue({ online: false });
    fireChange();
    await new Promise((r) => setTimeout(r, 5));
    const ctx = await gatherContext();
    expect(ctx.recent_network_changes).toHaveLength(1);
    expect(ctx.recent_network_changes![0]!.from).toBe('wifi:4g');
    expect(ctx.recent_network_changes![0]!.to).toBe('none');
    unsub1();
  });
});

describe('diagnostics ring buffer', () => {
  test('appendLog keeps at most 500 lines and formats them', () => {
    for (let i = 0; i < 510; i++) appendLog('log', 'line', i, { i });
    expect(getLogLines()).toHaveLength(500);
    expect(getLogLines()[0]!.message).toBe('line 10 {"i":10}');
    expect(formatLogLines().split('\n')).toHaveLength(500);
  });
});

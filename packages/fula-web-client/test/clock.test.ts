import { describe, expect, it } from 'vitest';
import { ClockSync, normalizeServerTimestampMs } from '../src/core/clock.js';

describe('clock offset', () => {
  it('normalises second and millisecond server timestamps', () => {
    expect(normalizeServerTimestampMs(1756166400)).toBe(1756166400_000);
    expect(normalizeServerTimestampMs(1756166400123)).toBe(1756166400123);
    expect(normalizeServerTimestampMs('1756166400')).toBe(1756166400_000);
    expect(Number.isNaN(normalizeServerTimestampMs('abc'))).toBe(true);
    expect(Number.isNaN(normalizeServerTimestampMs(0))).toBe(true);
    expect(Number.isNaN(normalizeServerTimestampMs(undefined))).toBe(true);
  });

  it('learns the offset against the round-trip midpoint and signs with server time', () => {
    let local = 1_000_000_000_000;
    const clock = new ClockSync(() => local);
    expect(clock.isSynced).toBe(false);
    expect(clock.nowSeconds()).toBe(1_000_000_000);
    // server is 400 s ahead; RTT 200 ms
    const learned = clock.learn(1_000_000_400_100, local, local + 200);
    expect(learned).toBe(true);
    expect(clock.offsetSeconds).toBe(400);
    expect(clock.nowSeconds()).toBe(1_000_000_400);
    local += 5_000;
    expect(clock.nowSeconds()).toBe(1_000_000_405);
    expect(clock.ageMs).toBe(4_800);
    clock.reset();
    expect(clock.offsetSeconds).toBe(0);
    expect(clock.learn('garbage', local, local)).toBe(false);
  });
});

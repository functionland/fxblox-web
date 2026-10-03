import { describe, expect, it, vi } from 'vitest';
import { createMemoryKvStore } from '@/platform/kvStore';
import { clearJoinState, joinStateKey, loadJoinState, saveJoinState } from '../joinState';
import { errorMessage, shortAccount, truncateMiddle } from '../format';

describe('joinState (kv adapter, mobile AsyncStorage keys)', () => {
  it('uses the mobile key shape on SKALE and round-trips per pool + per Blox', async () => {
    const store = createMemoryKvStore();
    expect(joinStateKey('7', 'peerA', 'skale')).toBe('joinState_7_peerA');
    expect(await loadJoinState('7', 'peerA', 'skale', store)).toEqual({
      step1Complete: false,
      step2Complete: false,
    });
    await saveJoinState(
      '7',
      'peerA',
      'skale',
      { step1Complete: true, step2Complete: false, step2Error: 'x' },
      store,
    );
    expect(await loadJoinState('7', 'peerA', 'skale', store)).toEqual({
      step1Complete: true,
      step2Complete: false,
      step1Error: undefined,
      step2Error: 'x',
    });
    // A different Blox has its own state.
    expect((await loadJoinState('7', 'peerB', 'skale', store)).step1Complete).toBe(false);
    await clearJoinState('7', 'peerA', 'skale', store);
    expect((await loadJoinState('7', 'peerA', 'skale', store)).step1Complete).toBe(false);
  });

  it('keeps each chain separate: the same pool id on Base does not see SKALE progress', async () => {
    const store = createMemoryKvStore();
    expect(joinStateKey('1', 'peerA', 'base')).toBe('joinState_base_1_peerA');
    await saveJoinState('1', 'peerA', 'skale', { step1Complete: true, step2Complete: true }, store);
    expect(await loadJoinState('1', 'peerA', 'base', store)).toEqual({
      step1Complete: false,
      step2Complete: false,
    });
    await saveJoinState('1', 'peerA', 'base', { step1Complete: true, step2Complete: false }, store);
    await clearJoinState('1', 'peerA', 'skale', store);
    expect((await loadJoinState('1', 'peerA', 'base', store)).step1Complete).toBe(true);
    expect(store.dump()).toEqual({ joinState_base_1_peerA: expect.any(String) });
  });

  it('tolerates corrupt blobs', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = createMemoryKvStore({ joinState_1_p: '{not json' });
    expect(await loadJoinState('1', 'p', 'skale', store)).toEqual({
      step1Complete: false,
      step2Complete: false,
    });
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});

describe('format helpers', () => {
  it('truncateMiddle / shortAccount', () => {
    expect(truncateMiddle('0x1234567890abcdef', 6, 4)).toBe('0x1234…cdef');
    expect(truncateMiddle('short', 6, 4)).toBe('short');
    expect(shortAccount('0x1234567890abcdef')).toBe('0x1234...cdef');
  });

  it('errorMessage', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('text')).toBe('text');
    expect(errorMessage({ message: 'obj' })).toBe('obj');
    expect(errorMessage({}, 'fallback')).toBe('fallback');
    expect(errorMessage(undefined, 'fallback')).toBe('fallback');
  });
});

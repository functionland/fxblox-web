import { describe, expect, it, vi } from 'vitest';
import { resolveAppPeerId } from '../appPeerId';

describe('resolveAppPeerId()', () => {
  it('reuses a stored appPeerId WITHOUT calling initFn', async () => {
    const initFn = vi.fn().mockResolvedValue('SHOULD_NOT_BE_USED');
    expect(await resolveAppPeerId('12D3KooWStored', initFn)).toBe('12D3KooWStored');
    expect(initFn).not.toHaveBeenCalled();
  });

  it('falls back to initFn when no appPeerId is stored', async () => {
    const initFn = vi.fn().mockResolvedValue('12D3KooWFresh');
    expect(await resolveAppPeerId(undefined, initFn)).toBe('12D3KooWFresh');
    expect(initFn).toHaveBeenCalledTimes(1);
  });

  it('treats an empty-string appPeerId as absent (calls initFn)', async () => {
    const initFn = vi.fn().mockResolvedValue('12D3KooWFresh');
    expect(await resolveAppPeerId('', initFn)).toBe('12D3KooWFresh');
    expect(initFn).toHaveBeenCalledTimes(1);
  });
});

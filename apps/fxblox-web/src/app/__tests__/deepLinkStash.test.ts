import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEEP_LINK_STASH_KEY,
  DEEP_LINK_STASH_TTL_MS,
  clearDeepLinkStash,
  consumeDeepLinkStash,
  isDeepLinkPath,
  isStashableUrl,
  peekDeepLinkStash,
  stashDeepLink,
  subscribeDeepLinkStash,
} from '@/app/deepLinkStash';

describe('deepLinkStash', () => {
  beforeEach(() => sessionStorage.clear());

  it('recognises the two deep-link routes only', () => {
    expect(isDeepLinkPath('/autopin-pair')).toBe(true);
    expect(isDeepLinkPath('/connectdapp/a/b/c/d/e')).toBe(true);
    expect(isDeepLinkPath('/settings/autopin')).toBe(false);
    expect(isDeepLinkPath('/blox')).toBe(false);
    expect(isStashableUrl('/autopin-pair?token=1')).toBe(true);
    expect(isStashableUrl('//evil.example/autopin-pair')).toBe(false);
    expect(isStashableUrl('https://evil.example/autopin-pair')).toBe(false);
  });

  it('stashes, peeks without consuming, and consumes exactly once', () => {
    const cb = vi.fn();
    const off = subscribeDeepLinkStash(cb);
    expect(stashDeepLink('/autopin-pair?token=1')).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(peekDeepLinkStash()).toBe('/autopin-pair?token=1');
    expect(peekDeepLinkStash()).toBe('/autopin-pair?token=1');
    expect(consumeDeepLinkStash()).toBe('/autopin-pair?token=1');
    expect(peekDeepLinkStash()).toBeNull();
    expect(consumeDeepLinkStash()).toBeNull();
    off();
  });

  it('rejects non-deep-link URLs and ignores corrupt storage values', () => {
    expect(stashDeepLink('/settings/about')).toBe(false);
    expect(stashDeepLink('javascript:alert(1)')).toBe(false);
    expect(peekDeepLinkStash()).toBeNull();
    sessionStorage.setItem(DEEP_LINK_STASH_KEY, 'https://evil.example');
    expect(peekDeepLinkStash()).toBeNull();
    sessionStorage.setItem(
      DEEP_LINK_STASH_KEY,
      JSON.stringify({ url: 'https://evil.example/autopin-pair', at: Date.now() }),
    );
    expect(peekDeepLinkStash()).toBeNull();
    clearDeepLinkStash();
    expect(sessionStorage.getItem(DEEP_LINK_STASH_KEY)).toBeNull();
  });

  it('expires abandoned entries after the TTL', () => {
    const t0 = 1_000_000;
    expect(stashDeepLink('/autopin-pair?token=1', t0)).toBe(true);
    expect(peekDeepLinkStash(t0 + DEEP_LINK_STASH_TTL_MS)).toBe('/autopin-pair?token=1');
    expect(peekDeepLinkStash(t0 + DEEP_LINK_STASH_TTL_MS + 1)).toBeNull();
  });
});

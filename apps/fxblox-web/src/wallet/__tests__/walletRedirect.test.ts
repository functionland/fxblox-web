import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetRedirectCaptureForTests,
  captureAutoRedirect,
  isWalletRequestUrl,
  onceSessionRequestSent,
  requestLinkFrom,
} from '../walletRedirect';

const REQUEST_URL = 'metamask://wc?requestId=1756166400123&sessionTopic=abc123';

/** The shape `onceSessionRequestSent` reaches for: `UniversalProvider.client` is the SignClient. */
function providerWithClient() {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const client = {
    on: vi.fn((event: string, fn: (payload: unknown) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
    }),
    off: vi.fn((event: string, fn: (payload: unknown) => void) => {
      listeners.get(event)?.delete(fn);
    }),
  };
  return {
    provider: { client },
    client,
    emit(event: string, payload: unknown) {
      for (const fn of [...(listeners.get(event) ?? [])]) fn(payload);
    },
    listenerCount: (event: string) => listeners.get(event)?.size ?? 0,
  };
}

describe('isWalletRequestUrl', () => {
  it('matches the URL WalletConnect builds for a pending request', () => {
    expect(isWalletRequestUrl(REQUEST_URL)).toBe(true);
    expect(isWalletRequestUrl('https://metamask.app.link/wc?requestId=7&sessionTopic=t')).toBe(true);
  });

  it('matches the Telegram form, which hides the ids inside startapp', () => {
    expect(isWalletRequestUrl('https://t.me/wallet?startapp=cmVxdWVzdElkPTc')).toBe(true);
    expect(isWalletRequestUrl('https://t.me/wallet')).toBe(false);
  });

  it('leaves everything else alone', () => {
    // Anything the app itself opens during the signing window has to pass through untouched.
    expect(isWalletRequestUrl('https://docs.fx.land/fxblox-web/')).toBe(false);
    expect(isWalletRequestUrl('metamask://')).toBe(false);
    // A session topic without a request id is not a request hand-off.
    expect(isWalletRequestUrl('metamask://wc?sessionTopic=abc')).toBe(false);
  });
});

describe('captureAutoRedirect', () => {
  let open: ReturnType<typeof vi.fn>;
  const realOpen = window.open;

  beforeEach(() => {
    // The interceptor is a module-level singleton, so each test starts from a clean install state.
    __resetRedirectCaptureForTests();
    open = vi.fn(() => null);
    window.open = open as unknown as Window['open'];
  });
  afterEach(() => {
    __resetRedirectCaptureForTests();
    window.open = realOpen;
  });

  it('swallows the redirect and remembers where it pointed', () => {
    const capture = captureAutoRedirect();
    expect(capture.captured()).toBeNull();

    // What @walletconnect/utils does: window.open(url, '_self', 'noreferrer noopener').
    expect(window.open(REQUEST_URL, '_self', 'noreferrer noopener')).toBeNull();

    expect(capture.captured()).toBe(REQUEST_URL);
    // The page must NOT have navigated — that is the whole point: the publish needs the tab in the foreground.
    expect(open).not.toHaveBeenCalled();
    expect(capture.sawOpen()).toBe(false);
    capture.release();
  });

  it('passes unrelated opens straight through, and says so', () => {
    const capture = captureAutoRedirect();
    window.open('https://docs.fx.land/fxblox-web/', '_blank');
    expect(open).toHaveBeenCalledWith('https://docs.fx.land/fxblox-web/', '_blank', undefined);
    expect(capture.captured()).toBeNull();
    // The caller needs to tell "nothing navigated" from "something navigated in a shape I did not recognise":
    // the first is its cue to make the hop itself, the second would bounce the user twice.
    expect(capture.sawOpen()).toBe(true);
    capture.release();
  });

  it('reports no open at all when nothing tried to navigate', () => {
    const capture = captureAutoRedirect();
    expect(capture.captured()).toBeNull();
    expect(capture.sawOpen()).toBe(false);
    capture.release();
  });

  it('accepts a URL object, which window.open also accepts', () => {
    const capture = captureAutoRedirect();
    window.open(new URL('https://metamask.app.link/wc?requestId=9&sessionTopic=t'));
    expect(capture.captured()).toBe('https://metamask.app.link/wc?requestId=9&sessionTopic=t');
    capture.release();
  });

  it('restores the exact original, and release is idempotent', () => {
    const capture = captureAutoRedirect();
    expect(window.open).not.toBe(open);
    capture.release();
    expect(window.open).toBe(open);
    capture.release();
    expect(window.open).toBe(open);
  });

  it('does not clobber a replacement installed after it', () => {
    // Leaking an inert wrapper is better than tearing out someone else's patch.
    const capture = captureAutoRedirect();
    const other = vi.fn(() => null) as unknown as Window['open'];
    window.open = other;
    capture.release();
    expect(window.open).toBe(other);
  });

  describe('overlapping captures', () => {
    // `cancel()` sets the phase to idle synchronously, so the Sign button comes back at once and a retry can
    // start while the cancelled attempt still holds its interceptor through REDIRECT_GRACE_MS.

    it('hands the browser its own window.open back, however the releases interleave', () => {
      const first = captureAutoRedirect();
      const second = captureAutoRedirect();
      // Whichever order they unwind in, what is restored must be the browser's, never another interceptor.
      first.release();
      expect(window.open).not.toBe(open);
      second.release();
      expect(window.open).toBe(open);
    });

    it('stops swallowing wallet links once the last capture is released', () => {
      // The regression this guards: a nested capture used to leave an interceptor installed for the life of the
      // page, silently eating every wallet deep link long after the request that installed it was over.
      const first = captureAutoRedirect();
      const second = captureAutoRedirect();
      second.release();
      first.release();

      window.open(REQUEST_URL, '_self', 'noreferrer noopener');
      expect(open).toHaveBeenCalledWith(REQUEST_URL, '_self', 'noreferrer noopener');
    });

    it('reports the redirect to every capture that is live when it happens', () => {
      const first = captureAutoRedirect();
      const second = captureAutoRedirect();
      window.open(REQUEST_URL, '_self', 'noreferrer noopener');
      expect(first.captured()).toBe(REQUEST_URL);
      expect(second.captured()).toBe(REQUEST_URL);
      expect(open).not.toHaveBeenCalled();
      first.release();
      second.release();
    });

    it('does not report a redirect to a capture that had already released', () => {
      const first = captureAutoRedirect();
      const second = captureAutoRedirect();
      first.release();
      window.open(REQUEST_URL, '_self', 'noreferrer noopener');
      expect(first.captured()).toBeNull();
      expect(second.captured()).toBe(REQUEST_URL);
      second.release();
    });
  });
});

describe('onceSessionRequestSent', () => {
  it('fires once with the request id and topic, then unsubscribes', () => {
    const { provider, emit, listenerCount } = providerWithClient();
    const handler = vi.fn();
    onceSessionRequestSent(provider, handler);

    emit('session_request_sent', { topic: 'abc123', request: {}, chainId: 'eip155:1', id: 42 });
    emit('session_request_sent', { topic: 'abc123', request: {}, chainId: 'eip155:1', id: 43 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ id: 42, topic: 'abc123' });
    expect(listenerCount('session_request_sent')).toBe(0);
  });

  it('ignores a payload it cannot use rather than hopping to a broken link', () => {
    const { provider, emit } = providerWithClient();
    const handler = vi.fn();
    onceSessionRequestSent(provider, handler);

    emit('session_request_sent', undefined);
    emit('session_request_sent', { topic: 'abc' });
    emit('session_request_sent', { id: 1 });
    emit('session_request_sent', { id: 1, topic: '' });
    expect(handler).not.toHaveBeenCalled();

    emit('session_request_sent', { id: 1, topic: 'abc' });
    expect(handler).toHaveBeenCalledWith({ id: 1, topic: 'abc' });
  });

  it('unsubscribing before the event stops the handler', () => {
    const { provider, emit, listenerCount } = providerWithClient();
    const handler = vi.fn();
    const off = onceSessionRequestSent(provider, handler);
    off();
    expect(listenerCount('session_request_sent')).toBe(0);
    emit('session_request_sent', { id: 1, topic: 'abc' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('is inert for a wallet with no WalletConnect session', () => {
    // An injected/extension wallet raises its own popup and never leaves the page.
    const handler = vi.fn();
    expect(() => onceSessionRequestSent(undefined, handler)()).not.toThrow();
    expect(() => onceSessionRequestSent({ request: () => undefined }, handler)()).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('requestLinkFrom', () => {
  const event = { id: 42, topic: 'abc123' };
  const inert = { captured: () => null, sawOpen: () => false, release: () => undefined };

  it('prefers the URL the library built, which is by definition the shape the wallet expects', () => {
    const capture = { captured: () => REQUEST_URL, sawOpen: () => false, release: () => undefined };
    expect(requestLinkFrom(capture, 'metamask://', event)).toBe(REQUEST_URL);
  });

  it('reconstructs one when the library never redirected', () => {
    expect(requestLinkFrom(inert, 'metamask://', event)).toBe(
      'metamask://wc?requestId=42&sessionTopic=abc123',
    );
  });

  it('has nothing to offer without a wallet href', () => {
    expect(requestLinkFrom(inert, null, event)).toBeNull();
  });
});

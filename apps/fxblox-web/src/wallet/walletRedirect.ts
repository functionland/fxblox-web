/**
 * Taking WalletConnect's app-switch away from it, so it stops racing the request it is supposed to accompany.
 *
 * `@walletconnect/sign-client` sends a session request like this (de-minified from the shipped bundle):
 *
 *     Promise.all([
 *       (async () => {
 *         await sendRequest({ ...wc_sessionRequest... });
 *         events.emit('session_request_sent', { topic, request, chainId, id });
 *       })(),
 *       (async () => {
 *         if (!session.sessionConfig?.disableDeepLink) {
 *           const link = await getDeepLink(core.storage, 'WALLETCONNECT_DEEPLINK_CHOICE');
 *           await handleDeeplinkRedirect({ id, topic, wcDeepLink: link });
 *         }
 *       })(),
 *       deferredResult,
 *     ])
 *
 * The two arms run CONCURRENTLY. The deep link that brings the wallet to the front does not wait for the
 * publish to the relay to complete — and on Android that is fatal, because switching apps takes the network
 * away from the page. A phone log for this bug shows four `ERR_NAME_NOT_RESOLVED` retries against
 * `wss://relay.walletconnect.org`, every one of them between `visibilitychange -> hidden` and the return to
 * `visible`, on a network that answers that same host fine while Chrome is in front. So the app-switch cuts
 * off the very publish it exists to accompany: the wallet opens, asks the relay for the request, finds
 * nothing, and sits there. The user sees a wallet that hangs and has to be force-quit.
 *
 * ## Why this intercepts `window.open` rather than emptying the deep-link key
 *
 * `handleDeeplinkRedirect` bails out on a falsy link, so clearing what `getDeepLink` reads would also silence
 * it. It was rejected for two reasons. `getDeepLink` reads localStorage first and falls back to
 * `core.storage`, so both would have to be cleared and both restored — and if the tab is reloaded or killed
 * between the clear and the restore, the user permanently loses the wallet choice AppKit stored for them.
 * That trades a hang for data loss. Intercepting the one call the redirect ultimately makes is in-memory,
 * cannot outlive the page, and has the useful side effect of handing us the exact URL the library built —
 * including the request id — so nothing has to be reconstructed from its internals.
 */
import { walletRequestLink } from './walletLink';

const SESSION_REQUEST_SENT = 'session_request_sent';

/** The half of the `session_request_sent` payload that identifies the request to the wallet. */
export interface SessionRequestSent {
  id: number | string;
  topic: string;
}

interface SignClientLike {
  on(event: string, listener: (payload: unknown) => void): void;
  off(event: string, listener: (payload: unknown) => void): void;
}

/**
 * `UniversalProvider.client` is the SignClient itself (`this.client = opts.client || await SignClient.init(…)`),
 * and SignClient exposes `on`/`off` over its own emitter. Injected/extension wallets have neither, which is the
 * signal that none of this applies to them: they raise their own popup and never leave the page.
 */
function signClientFrom(provider: unknown): SignClientLike | null {
  const client = (provider as { client?: unknown } | undefined)?.client as Partial<SignClientLike> | undefined;
  if (!client || typeof client.on !== 'function' || typeof client.off !== 'function') return null;
  return client as SignClientLike;
}

/**
 * Fire `handler` once, when the engine has finished trying to publish the request.
 *
 * NOT a success signal, despite the name. The engine does
 *
 *     await this.sendRequest({ … }).catch(g => y(g)), this.client.events.emit('session_request_sent', …)
 *
 * and `.catch()` returns a RESOLVED promise, so the comma sequence reaches the emit whether the publish
 * succeeded or rejected — `y` being the deferred's reject. Callers that act on this event have to allow for the
 * request having already failed; see how WalletSigner defers its app-switch by a macrotask to find out.
 *
 * Returns an unsubscribe. Safe on a provider that is not WalletConnect-backed: there is no client to listen to,
 * so the caller never hears back and falls through to its manual affordance.
 */
export function onceSessionRequestSent(
  provider: unknown,
  handler: (event: SessionRequestSent) => void,
): () => void {
  const client = signClientFrom(provider);
  if (!client) return () => undefined;
  let settled = false;
  const listener = (payload: unknown) => {
    if (settled) return;
    const { id, topic } = (payload ?? {}) as Partial<SessionRequestSent>;
    if ((typeof id !== 'number' && typeof id !== 'string') || typeof topic !== 'string' || !topic) return;
    settled = true;
    client.off(SESSION_REQUEST_SENT, listener);
    handler({ id, topic });
  };
  client.on(SESSION_REQUEST_SENT, listener);
  return () => {
    if (settled) return;
    settled = true;
    client.off(SESSION_REQUEST_SENT, listener);
  };
}

/**
 * Is this the URL WalletConnect builds to hand a pending request to a wallet?
 *
 * Deliberately narrow. Anything else going through `window.open` during the signing window — an https link
 * opened from elsewhere in the app, say — must pass straight through untouched.
 */
export function isWalletRequestUrl(url: string): boolean {
  if (url.startsWith('https://t.me')) return url.includes('startapp=');
  return url.includes('requestId=') && url.includes('sessionTopic=');
}

export interface RedirectCapture {
  /** The URL WalletConnect wanted to open, or null if it has not tried (yet, or at all). */
  captured(): string | null;
  /**
   * Did an `open` go THROUGH to the browser while this was installed?
   *
   * The difference matters, because "we captured nothing" has two opposite meanings. Either nothing tried to
   * navigate — no deep-link choice was stored, or the publish announced itself before the redirect arm got
   * there — and the caller should make the hop itself; or something navigated in a shape this did not
   * recognise, and hopping again would bounce the user a second time.
   */
  sawOpen(): boolean;
  /** Hand `window.open` back. Idempotent. */
  release(): void;
}

const INERT_CAPTURE: RedirectCapture = {
  captured: () => null,
  sawOpen: () => false,
  release: () => undefined,
};

/**
 * Swallow WalletConnect's redirect and remember where it pointed, until `release()`.
 *
 * The library ignores `window.open`'s return value, so returning null costs it nothing — it believes it has
 * switched apps, and the page stays in front long enough to finish publishing.
 */
export function captureAutoRedirect(): RedirectCapture {
  if (typeof window === 'undefined' || typeof window.open !== 'function') return INERT_CAPTURE;

  // The original reference, not a bound copy, so `release()` puts back exactly what was there and repeated
  // capture/release cycles do not stack wrappers.
  const original = window.open;
  let captured: string | null = null;
  let passedThrough = false;
  let released = false;

  const patched = ((url?: string | URL, target?: string, features?: string): Window | null => {
    const href = typeof url === 'string' ? url : url instanceof URL ? url.href : '';
    if (href && isWalletRequestUrl(href)) {
      captured = href;
      return null;
    }
    passedThrough = true;
    return original.call(window, url, target, features);
  }) as Window['open'];

  window.open = patched;

  return {
    captured: () => captured,
    sawOpen: () => passedThrough,
    release: () => {
      if (released) return;
      released = true;
      // Only hand back if nothing replaced it meanwhile — clobbering another patch would be worse than leaking
      // this one, which is inert once `captured` is no longer read.
      if (window.open === patched) window.open = original;
    },
  };
}

/**
 * Where to send the user so their wallet shows the pending prompt.
 *
 * Prefers the URL the library itself built (captured above), because that is by definition the shape the
 * wallet expects. Falls back to reconstructing it, which matters when the library never redirected at all —
 * the deep-link choice is missing, for instance — and the user is otherwise left with no way into the wallet.
 */
export function requestLinkFrom(
  capture: RedirectCapture,
  href: string | null,
  event: SessionRequestSent,
): string | null {
  return capture.captured() ?? (href ? walletRequestLink(href, event.id, event.topic) : null);
}

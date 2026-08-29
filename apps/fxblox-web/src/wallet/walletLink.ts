/**
 * The connected wallet's own deep link, read off the WalletConnect session.
 *
 * Why this is needed at all: a `provider.request({ method: 'personal_sign' })` publishes the request to the
 * WalletConnect relay, but nothing brings the wallet app to the front — AppKit does that only for the flows it
 * drives through its own modal. On a phone the user is therefore left staring at the dapp while an unseen
 * prompt waits inside their wallet. The session tells us where that wallet lives, so we can offer to open it.
 *
 * It is also offered as a button, not only attempted automatically: an automatic hop is a navigation to another
 * app, which mobile browsers drop once the user gesture that authorised it has expired — precisely the case a
 * stuck user is in.
 *
 * Returns null for an injected/extension wallet (there is no session and no app to open — the extension
 * raises its own popup), which is also how the caller decides whether the affordance makes sense at all.
 */

interface SessionRedirect {
  native?: unknown;
  universal?: unknown;
}

interface ProviderWithSession {
  session?: { peer?: { metadata?: { redirect?: SessionRedirect } } };
}

const asLink = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export function connectedWalletLink(provider: unknown): string | null {
  const redirect = (provider as ProviderWithSession | undefined)?.session?.peer?.metadata?.redirect;
  if (!redirect) return null;
  // `native` (e.g. "metamask://") opens the app directly; `universal` is an https link the OS routes to it.
  return asLink(redirect.native) ?? asLink(redirect.universal);
}

/**
 * The URL that actually surfaces a pending request inside the wallet, mirroring `formatDeeplinkUrl` in
 * @walletconnect/utils.
 *
 * The request id is not decoration: opening a bare `metamask://` lands on the wallet's home screen with the
 * pending prompt still buried, which is indistinguishable from the wallet hanging. One trailing slash is
 * stripped first, so `metamask://` becomes `metamask://wc?…` and not `metamask:///wc?…`.
 *
 * Returns null for the `https://t.me` form the library also handles (a base64 `startapp=` payload for Telegram
 * wallets) rather than guessing at it — no Telegram wallet is in scope here, and the caller then falls back to
 * the plain link, which is what it would have used anyway.
 *
 * Only a fallback: `walletRedirect.ts` captures the URL the library built and prefers that.
 */
export function walletRequestLink(href: string, id: number | string, topic: string): string | null {
  if (href.startsWith('https://t.me')) return null;
  const base = href.endsWith('/') ? href.slice(0, -1) : href;
  return `${base}/wc?requestId=${id}&sessionTopic=${topic}`;
}

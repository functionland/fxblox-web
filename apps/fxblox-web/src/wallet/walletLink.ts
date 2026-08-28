/**
 * The connected wallet's own deep link, read off the WalletConnect session.
 *
 * Why this is needed at all: a `provider.request({ method: 'personal_sign' })` publishes the request to the
 * WalletConnect relay, but nothing brings the wallet app to the front — AppKit does that only for the flows it
 * drives through its own modal. On a phone the user is therefore left staring at the dapp while an unseen
 * prompt waits inside their wallet. The session tells us where that wallet lives, so we can offer to open it.
 *
 * It is offered as a button rather than done automatically: mobile browsers block navigation to another app
 * unless it happens in a real user gesture, so an automatic hop would silently fail exactly when it matters.
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

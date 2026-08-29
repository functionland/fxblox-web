import { describe, expect, it } from 'vitest';
import { connectedWalletLink, walletRequestLink } from '../walletLink';

const withRedirect = (redirect: unknown) => ({ session: { peer: { metadata: { redirect } } } });

describe('connectedWalletLink', () => {
  it('prefers the native scheme, which opens the wallet app directly', () => {
    expect(
      connectedWalletLink(
        withRedirect({ native: 'metamask://', universal: 'https://metamask.app.link' }),
      ),
    ).toBe('metamask://');
  });

  it('falls back to the universal link when there is no native scheme', () => {
    expect(connectedWalletLink(withRedirect({ universal: 'https://metamask.app.link' }))).toBe(
      'https://metamask.app.link',
    );
  });

  it('treats an empty or blank entry as absent', () => {
    // A dapp declares `native: ''` for itself (no custom scheme); a wallet can echo the same shape back.
    expect(connectedWalletLink(withRedirect({ native: '   ', universal: '' }))).toBeNull();
  });

  it('returns null for anything that is not a connected WalletConnect session', () => {
    // An injected/extension wallet has no session and no app to open — it raises its own popup. The caller
    // uses null to decide the "open your wallet" affordance would be a lie, and shows nothing.
    expect(connectedWalletLink(undefined)).toBeNull();
    expect(connectedWalletLink({ request: () => undefined })).toBeNull();
    expect(connectedWalletLink(withRedirect(undefined))).toBeNull();
    expect(connectedWalletLink(withRedirect({ native: 42 }))).toBeNull();
  });
});

describe('walletRequestLink', () => {
  it('carries the request id, which is what makes the wallet show the prompt', () => {
    expect(walletRequestLink('metamask://', 42, 'abc123')).toBe(
      'metamask://wc?requestId=42&sessionTopic=abc123',
    );
  });

  it('strips exactly one trailing slash, so the scheme keeps its own', () => {
    // "metamask://" must become "metamask://wc?…", not "metamask:///wc?…".
    expect(walletRequestLink('metamask://', 1, 't')).toContain('metamask://wc?');
    expect(walletRequestLink('https://metamask.app.link/', 1, 't')).toBe(
      'https://metamask.app.link/wc?requestId=1&sessionTopic=t',
    );
    expect(walletRequestLink('https://metamask.app.link', 1, 't')).toBe(
      'https://metamask.app.link/wc?requestId=1&sessionTopic=t',
    );
  });

  it('accepts a string id, since the wire format is a JSON-RPC id', () => {
    expect(walletRequestLink('metamask://', '1756166400123', 't')).toBe(
      'metamask://wc?requestId=1756166400123&sessionTopic=t',
    );
  });

  it('declines the Telegram form rather than guessing at its startapp payload', () => {
    expect(walletRequestLink('https://t.me/wallet', 1, 't')).toBeNull();
  });
});

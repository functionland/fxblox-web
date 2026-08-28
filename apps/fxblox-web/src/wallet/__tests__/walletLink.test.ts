import { describe, expect, it } from 'vitest';
import { connectedWalletLink } from '../walletLink';

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

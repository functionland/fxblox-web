/**
 * WalletConnect/Reown shows `providerMetadata.url` in the wallet's connection prompt and verifies it against
 * the origin actually making the request. A hardcoded host means every connect from anywhere else raises a
 * "cannot verify domain" warning — which reads like a phishing warning to the user.
 *
 * It was pinned to `https://blox.fx.land` while the app is served from `https://docs.fx.land/fxblox-web/`, so
 * the warning fired on every connect. These tests pin the property that fixes it: the URL describes wherever
 * the app is really running.
 */
import { describe, expect, it } from 'vitest';
import { providerMetadata } from '../chains';

describe('providerMetadata.url', () => {
  it('matches the origin the app is actually served from', () => {
    // jsdom serves the suite from a real origin; the metadata must agree with it rather than assert some
    // other host. This is the whole point — a wallet compares these.
    expect(providerMetadata.url.startsWith(window.location.origin)).toBe(true);
  });

  it('is not pinned to a hardcoded production host', () => {
    // The specific regression: a literal that stops being true the moment the app moves.
    expect(providerMetadata.url).not.toBe('https://blox.fx.land');
  });

  it('still identifies the app', () => {
    expect(providerMetadata.name).toBe('FxBlox');
    expect(providerMetadata.icons.length).toBeGreaterThan(0);
  });

  it('tells the wallet where to send the user back to', () => {
    // Without this the wallet has nothing to return to: a phone user approves, and is simply left sitting in
    // their wallet app having to find the browser again by hand.
    expect(providerMetadata.redirect.universal).toBe(providerMetadata.url);
    // A web app has no custom scheme of its own, and a non-empty native here would send the wallet nowhere.
    expect(providerMetadata.redirect.native).toBe('');
  });
});

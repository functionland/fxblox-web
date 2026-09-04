import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const wallet = vi.hoisted(() => ({
  state: {
    account: undefined as string | undefined,
    connected: false,
    connecting: false,
    chainId: undefined as string | undefined,
    provider: undefined as { request: (args: unknown) => Promise<unknown> } | undefined,
    open: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    switchNetwork: vi.fn(async () => undefined),
    sdk: { connect: vi.fn(), disconnect: vi.fn(), getProvider: () => undefined },
  },
  listeners: new Set<() => void>(),
  appkit: {
    initAppKit: vi.fn(),
    setAppKitTheme: vi.fn(),
    disconnectWallet: vi.fn(async () => undefined),
  },
}));

vi.mock('@/wallet/appkit', () => wallet.appkit);
vi.mock('@/wallet/useWallet', async () => {
  const React = await import('react');
  return {
    useWallet: () => {
      const [, force] = React.useState(0);
      React.useEffect(() => {
        const cb = () => force((n) => n + 1);
        wallet.listeners.add(cb);
        return () => {
          wallet.listeners.delete(cb);
        };
      }, []);
      return { ...wallet.state };
    },
  };
});
vi.mock('@/utils/helper', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/helper')>();
  return { ...actual, getMyDID: () => 'did:key:zTestIdentity', initFula: vi.fn() };
});
vi.mock('@/platform/linking', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/platform/linking')>();
  return { ...actual, assign: vi.fn() };
});

import { WALLET_NUDGE_MS, WALLET_STUCK_MS } from '@/components/setup/WalletSigner';
import { useUserProfileStore } from '@/stores/useUserProfileStore';
import * as linking from '@/platform/linking';
import * as secureStore from '@/platform/secureStore';
import { kvStore } from '@/platform/kvStore';
import { renderSetupAt, resetStores } from './renderSetup';

function connectWallet(signature = '0xdeadbeef') {
  wallet.state.account = '0xABCDEF';
  wallet.state.connected = true;
  wallet.state.provider = {
    request: vi.fn(async (args: unknown) => {
      const { method } = args as { method: string };
      if (method === 'personal_sign') return signature;
      throw new Error(`unexpected ${method}`);
    }),
  };
  for (const cb of wallet.listeners) cb();
}

async function fillPasswordAndConsent(
  user: ReturnType<typeof userEvent.setup>,
  withWalletBox = true,
) {
  await user.type(await screen.findByTestId('password-input'), 'my-secret');
  await user.click(screen.getByLabelText('I understand the risk of losing my password'));
  if (withWalletBox)
    await user.click(screen.getByLabelText('I already opened my Wallet app before clicking Sign'));
}

describe('LinkPassword', () => {
  beforeEach(async () => {
    resetStores();
    await secureStore.wipe();
    wallet.state.account = undefined;
    wallet.state.connected = false;
    wallet.state.provider = undefined;
    wallet.state.open.mockClear();
    wallet.state.disconnect.mockClear();
    wallet.appkit.initAppKit.mockReset();
    wallet.appkit.disconnectWallet.mockClear();
  });

  it('existing identity: shows the DID and Continue goes to Connect to Blox', async () => {
    resetStores({ identity: true });
    const { router } = await renderSetupAt('/setup/link-password');
    expect(await screen.findByTestId('did')).toHaveTextContent('did:key:zTestIdentity');
    expect(screen.getByText('Generated Identity')).toBeInTheDocument();
    expect(screen.queryByTestId('password-input')).toBeNull();
    await userEvent.click(screen.getByTestId('setup-continue'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/connect-blox'));
  });

  it('existing identity: the shortcuts route to Blox discovery and manual setup', async () => {
    resetStores({ identity: true });
    const { router } = await renderSetupAt('/setup/link-password');
    await userEvent.click(await screen.findByTestId('reconnect-existing'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/connect-existing'));
    await act(async () => {
      await router.navigate('/setup/link-password');
    });
    await userEvent.click(await screen.findByTestId('skip-manual-setup'));
    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        '/setup/set-authorizer?manual=1',
      ),
    );
  });

  it('Reset Identity clears the cached identity, disconnects the wallet and shows the form', async () => {
    resetStores({ identity: true });
    await renderSetupAt('/setup/link-password');
    await userEvent.click(await screen.findByTestId('reset-identity'));
    await waitFor(() => expect(useUserProfileStore.getState().password).toBeUndefined());
    expect(useUserProfileStore.getState().signiture).toBeUndefined();
    await waitFor(() => expect(wallet.appkit.disconnectWallet).toHaveBeenCalled());
    expect(await screen.findByTestId('password-input')).toBeInTheDocument();
    expect(await screen.findByText('Identity has been reset successfully')).toBeInTheDocument();
  });

  it('wallet path: connect, then a SECOND tap signs and stores password + signature', async () => {
    const user = userEvent.setup();
    await renderSetupAt('/setup/link-password');
    await fillPasswordAndConsent(user);
    const sign = await screen.findByTestId('sign-with-wallet');
    await waitFor(() => expect(sign).toBeEnabled());
    expect(wallet.appkit.initAppKit).toHaveBeenCalled(); // createAppKit ran before the hooks rendered

    await user.click(sign);
    await waitFor(() => expect(wallet.state.open).toHaveBeenCalledWith({ view: 'Connect' }));

    await act(async () => {
      connectWallet('0xsigned');
    });
    // Connecting does NOT sign. A phone browser blocks the app-switch a signature needs unless it happens
    // inside a real tap, so an auto-fired request would leave the user on a spinner while an unseen prompt
    // waits in a wallet that was never brought forward.
    expect(await screen.findByTestId('ready-to-sign')).toBeInTheDocument();
    expect(wallet.state.provider!.request).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('sign-with-wallet'));
    // Byte-identical personal_sign params (lowercase account) — this seeds the shared web/mobile identity.
    await waitFor(() => expect(useUserProfileStore.getState().signiture).toBe('0xsigned'), {
      timeout: 4000,
    });
    expect(useUserProfileStore.getState().password).toBe('my-secret');
    const request = wallet.state.provider!.request as ReturnType<typeof vi.fn>;
    const call = request.mock.calls[0]![0] as { method: string; params: [string, string] };
    expect(call.method).toBe('personal_sign');
    expect(call.params[0]).toMatch(/^0x[0-9a-f]+$/);
    expect(call.params[1]).toBe('0xabcdef');
    expect(await screen.findByTestId('did')).toBeInTheDocument();
    // Persisted in the secure store, not only in memory.
    const stored = await secureStore.load(secureStore.Service.Signiture);
    expect(stored && stored.password).toBe('0xsigned');
  });

  it('wallet path: a rejected signature shows the mobile error toast and keeps the form', async () => {
    const user = userEvent.setup();
    wallet.state.account = '0xABC';
    wallet.state.connected = true;
    wallet.state.provider = {
      request: vi.fn(async () => Promise.reject(new Error('User rejected'))),
    };
    await renderSetupAt('/setup/link-password');
    await fillPasswordAndConsent(user);
    const sign = await screen.findByTestId('sign-with-wallet');
    await waitFor(() => expect(sign).toBeEnabled());
    await user.click(sign);
    expect(await screen.findByText('Unable to sign the wallet address!')).toBeInTheDocument();
    expect(useUserProfileStore.getState().signiture).toBeUndefined();
    expect(screen.getByTestId('password-input')).toBeInTheDocument();
  });

  it('wallet path: a signature the wallet never answers offers a way into the wallet, and keeps waiting', async () => {
    const user = userEvent.setup();
    let approve: (sig: string) => void = () => undefined;
    wallet.state.account = '0xABC';
    wallet.state.connected = true;
    wallet.state.provider = {
      // Never settles on its own — the shape of the real bug: the request is on the relay, the wallet was
      // never brought forward, and the user is looking at a browser tab that appears to do nothing.
      request: vi.fn(() => new Promise<string>((resolve) => (approve = resolve))),
      session: { peer: { metadata: { redirect: { native: 'metamask://' } } } },
    } as never;
    await renderSetupAt('/setup/link-password');
    await fillPasswordAndConsent(user);
    await user.click(await screen.findByTestId('sign-with-wallet'));

    // The spinner's label, which is what a waiting user reads. "Connecting Wallet…" would be a lie here.
    expect(await screen.findByLabelText('Approve the request in your wallet…')).toBeInTheDocument();
    const open = await screen.findByTestId('open-wallet', undefined, {
      timeout: WALLET_NUDGE_MS + 4000,
    });
    await user.click(open);
    expect(linking.assign).toHaveBeenCalledWith('metamask://');

    // And, once it is clear the wallet came forward and then wedged, the way out of that. MetaMask on Android
    // sometimes sits on its splash screen without ever rendering the prompt; a full quit and a second hop is
    // the only known cure, and nothing on a web page can reach in and fix it.
    expect(
      await screen.findByTestId('wallet-stuck-hint', undefined, { timeout: WALLET_STUCK_MS + 4000 }),
    ).toBeInTheDocument();

    // The nudge must not abandon the request. A user who approves after switching apps by hand has their
    // signature accepted, rather than being told it timed out with the wallet prompt already signed.
    await act(async () => {
      approve('0xlate');
    });
    await waitFor(() => expect(useUserProfileStore.getState().signiture).toBe('0xlate'));
  });

  it('wallet path: the app-switch waits for the relay, and carries the request id', async () => {
    // The bug this guards. WalletConnect deep-links to the wallet from a promise that RACES the publish, so on
    // Android the app-switch takes the page's network away before the request is on the wire. The wallet then
    // opens on a request that was never sent, and hangs. See wallet/walletRedirect.ts.
    const user = userEvent.setup();
    const realOpen = window.open;
    const open = vi.fn(() => null);
    window.open = open as unknown as Window['open'];
    vi.mocked(linking.assign).mockClear();

    const listeners = new Set<(payload: unknown) => void>();
    let approve: (sig: string) => void = () => undefined;
    wallet.state.account = '0xABC';
    wallet.state.connected = true;
    wallet.state.provider = {
      request: vi.fn(() => {
        // The library's two concurrent arms, in the order they really occur: the deep link goes first (it only
        // reads storage), the publish completes after a network round-trip and only then announces itself.
        window.open('metamask://wc?requestId=42&sessionTopic=topic-1', '_self', 'noreferrer noopener');
        for (const fn of [...listeners])
          fn({ topic: 'topic-1', request: {}, chainId: 'eip155:1', id: 42 });
        return new Promise<string>((resolve) => (approve = resolve));
      }),
      session: { peer: { metadata: { redirect: { native: 'metamask://' } } } },
      client: {
        on: (_event: string, fn: (payload: unknown) => void) => listeners.add(fn),
        off: (_event: string, fn: (payload: unknown) => void) => listeners.delete(fn),
      },
    } as never;

    try {
      await renderSetupAt('/setup/link-password');
      await fillPasswordAndConsent(user);
      await user.click(await screen.findByTestId('sign-with-wallet'));

      // The library's redirect was swallowed, so the page stayed in front long enough to finish publishing.
      expect(open).not.toHaveBeenCalled();
      // We hop instead, once the relay has the request — and to the URL that opens THAT request, not to a bare
      // `metamask://` that lands on the wallet's home screen with the prompt still buried.
      await waitFor(() =>
        expect(linking.assign).toHaveBeenCalledWith('metamask://wc?requestId=42&sessionTopic=topic-1'),
      );
      // Offered as a button straight away too (well inside WALLET_NUDGE_MS): a navigation Chrome dropped for
      // lack of a live user gesture looks exactly like a wallet that hung.
      expect(await screen.findByTestId('open-wallet')).toBeInTheDocument();

      await act(async () => {
        approve('0xlate');
      });
      await waitFor(() => expect(useUserProfileStore.getState().signiture).toBe('0xlate'));
    } finally {
      window.open = realOpen;
    }
  });

  it('wallet path: hops by itself when the library never redirects at all', async () => {
    // With no stored deep-link choice WalletConnect's redirect arm does nothing — the reporter's log showed
    // exactly that (`deeplink choice: null`). Suppressing a redirect that was never going to happen would
    // leave the user on a button nobody told them to press, so the hop has to be ours in this case too.
    const user = userEvent.setup();
    vi.mocked(linking.assign).mockClear();
    const listeners = new Set<(payload: unknown) => void>();
    let approve: (sig: string) => void = () => undefined;
    wallet.state.account = '0xABC';
    wallet.state.connected = true;
    wallet.state.provider = {
      request: vi.fn(() => {
        // Note what is missing: no window.open. Nothing navigates unless we do.
        for (const fn of [...listeners])
          fn({ topic: 'topic-1', request: {}, chainId: 'eip155:1', id: 42 });
        return new Promise<string>((resolve) => (approve = resolve));
      }),
      session: { peer: { metadata: { redirect: { native: 'metamask://' } } } },
      client: {
        on: (_event: string, fn: (payload: unknown) => void) => listeners.add(fn),
        off: (_event: string, fn: (payload: unknown) => void) => listeners.delete(fn),
      },
    } as never;

    await renderSetupAt('/setup/link-password');
    await fillPasswordAndConsent(user);
    await user.click(await screen.findByTestId('sign-with-wallet'));

    // Reconstructed rather than captured, but the same URL the library would have built.
    await waitFor(() =>
      expect(linking.assign).toHaveBeenCalledWith('metamask://wc?requestId=42&sessionTopic=topic-1'),
    );
    await act(async () => {
      approve('0xlate');
    });
    await waitFor(() => expect(useUserProfileStore.getState().signiture).toBe('0xlate'));
  });

  it('wallet path: a dead relay socket keeps the user here and wakes the socket', async () => {
    // With the socket down the request is not on the relay — the engine queues a failed publish and retries.
    // Opening the wallet then is what produces a wallet sitting on its splash screen with nothing to show.
    const user = userEvent.setup();
    vi.mocked(linking.assign).mockClear();
    const transportOpen = vi.fn(async () => undefined);
    const listeners = new Set<(payload: unknown) => void>();
    let approve: (sig: string) => void = () => undefined;
    wallet.state.account = '0xABC';
    wallet.state.connected = true;
    wallet.state.provider = {
      request: vi.fn(() => {
        for (const fn of [...listeners])
          fn({ topic: 'topic-1', request: {}, chainId: 'eip155:1', id: 42 });
        return new Promise<string>((resolve) => (approve = resolve));
      }),
      session: { peer: { metadata: { redirect: { native: 'metamask://' } } } },
      client: {
        on: (_event: string, fn: (payload: unknown) => void) => listeners.add(fn),
        off: (_event: string, fn: (payload: unknown) => void) => listeners.delete(fn),
        core: { relayer: { connected: false, connecting: false, transportOpen } },
      },
    } as never;

    await renderSetupAt('/setup/link-password');
    await fillPasswordAndConsent(user);
    await user.click(await screen.findByTestId('sign-with-wallet'));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(linking.assign).not.toHaveBeenCalled();
    expect(transportOpen).toHaveBeenCalled();
    // The request is still live, so a signature that arrives once the socket recovers is still accepted.
    expect(await screen.findByTestId('open-wallet')).toBeInTheDocument();
    await act(async () => {
      approve('0xlate');
    });
    await waitFor(() => expect(useUserProfileStore.getState().signiture).toBe('0xlate'));
  });

  it('wallet path: a publish that failed does not send the user into the wallet', async () => {
    // `session_request_sent` is not a success signal. The engine does `await sendRequest(...).catch(reject)`
    // and then emits unconditionally, so a REJECTED publish announces itself just the same. Hopping on it
    // blindly would drop the user into a wallet with nothing waiting for it — the exact hang being fixed here.
    const user = userEvent.setup();
    vi.mocked(linking.assign).mockClear();
    const listeners = new Set<(payload: unknown) => void>();
    wallet.state.account = '0xABC';
    wallet.state.connected = true;
    wallet.state.provider = {
      request: vi.fn(async () => {
        for (const fn of [...listeners])
          fn({ topic: 'topic-1', request: {}, chainId: 'eip155:1', id: 42 });
        throw new Error('Failed to publish payload, please try again');
      }),
      session: { peer: { metadata: { redirect: { native: 'metamask://' } } } },
      client: {
        on: (_event: string, fn: (payload: unknown) => void) => listeners.add(fn),
        off: (_event: string, fn: (payload: unknown) => void) => listeners.delete(fn),
      },
    } as never;

    await renderSetupAt('/setup/link-password');
    await fillPasswordAndConsent(user);
    await user.click(await screen.findByTestId('sign-with-wallet'));

    expect(await screen.findByText('Unable to sign the wallet address!')).toBeInTheDocument();
    // Past the macrotask the hop is deferred by, so "not yet" cannot masquerade as "never".
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(linking.assign).not.toHaveBeenCalled();
  });

  it('wallet path: coming back with the request unanswered says so at once, and drops the request id', async () => {
    // The field report: MetaMask on Android wedges on its splash screen on the first hop after connecting,
    // every time, and only a force-quit clears it. Retried from a real tap, same URL, it hangs the same way —
    // so the fault is inside the wallet, not in how the page navigates.
    //
    // Two things follow, and this covers both. Returning to this page with the request still out is proof the
    // wallet showed nothing, so the recovery hint belongs on screen NOW rather than when a 12s timer that ran
    // while the user was inside the wallet finally expires. And the next tap must not repeat the link that
    // just failed: `…/wc?requestId=` is what puts the wallet into the route that waits for a request it never
    // received, so the retry asks only for the app.
    const user = userEvent.setup();
    vi.mocked(linking.assign).mockClear();
    const listeners = new Set<(payload: unknown) => void>();
    let approve: (sig: string) => void = () => undefined;
    wallet.state.account = '0xABC';
    wallet.state.connected = true;
    wallet.state.provider = {
      request: vi.fn(() => {
        for (const fn of [...listeners])
          fn({ topic: 'topic-1', request: {}, chainId: 'eip155:1', id: 42 });
        return new Promise<string>((resolve) => (approve = resolve));
      }),
      session: { peer: { metadata: { redirect: { native: 'metamask://' } } } },
      client: {
        on: (_event: string, fn: (payload: unknown) => void) => listeners.add(fn),
        off: (_event: string, fn: (payload: unknown) => void) => listeners.delete(fn),
      },
    } as never;

    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    try {
      await renderSetupAt('/setup/link-password');
      await fillPasswordAndConsent(user);
      await user.click(await screen.findByTestId('sign-with-wallet'));

      await waitFor(() =>
        expect(linking.assign).toHaveBeenCalledWith('metamask://wc?requestId=42&sessionTopic=topic-1'),
      );
      // Nothing has gone wrong yet: the wallet has only just been asked to come forward.
      expect(screen.queryByTestId('wallet-stuck-hint')).toBeNull();

      // Away to the wallet, and back with nothing to show for it.
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });

      // Immediately, and well inside WALLET_STUCK_MS.
      expect(await screen.findByTestId('wallet-stuck-hint')).toBeInTheDocument();

      vi.mocked(linking.assign).mockClear();
      await user.click(screen.getByTestId('open-wallet'));
      expect(linking.assign).toHaveBeenCalledWith('metamask://');

      // The request was never abandoned: a signature approved after all this still lands.
      await act(async () => {
        approve('0xlate');
      });
      await waitFor(() => expect(useUserProfileStore.getState().signiture).toBe('0xlate'));
    } finally {
      visibility.mockRestore();
    }
  });

  it('wallet path: a visibility change before any hop is not treated as a wedged wallet', async () => {
    // Tab switches happen for all sorts of reasons. Only a return from a wallet WE sent them to is evidence.
    const user = userEvent.setup();
    vi.mocked(linking.assign).mockClear();
    let approve: (sig: string) => void = () => undefined;
    wallet.state.account = '0xABC';
    wallet.state.connected = true;
    wallet.state.provider = {
      // No `client`, so nothing announces the publish and no hop is ever made.
      request: vi.fn(() => new Promise<string>((resolve) => (approve = resolve))),
      session: { peer: { metadata: { redirect: { native: 'metamask://' } } } },
    } as never;

    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    try {
      await renderSetupAt('/setup/link-password');
      await fillPasswordAndConsent(user);
      await user.click(await screen.findByTestId('sign-with-wallet'));
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      expect(screen.queryByTestId('wallet-stuck-hint')).toBeNull();
      await act(async () => {
        approve('0xlate');
      });
      await waitFor(() => expect(useUserProfileStore.getState().signiture).toBe('0xlate'));
    } finally {
      visibility.mockRestore();
    }
  });

  it('wallet path: dismissing the chooser leaves Sign available, not a stuck Cancel', async () => {
    const user = userEvent.setup();
    await renderSetupAt('/setup/link-password');
    await fillPasswordAndConsent(user);
    const sign = await screen.findByTestId('sign-with-wallet');
    await waitFor(() => expect(sign).toBeEnabled());

    // AppKit resolves open() when the modal is UP, not when it closes, so nothing else reports the dismissal.
    // Treating the screen as busy past that point strands anyone who backs out of the chooser.
    await user.click(sign);
    await waitFor(() => expect(wallet.state.open).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId('sign-with-wallet')).toHaveTextContent('Sign with Wallet'),
    );
    expect(screen.getByTestId('password-input')).toBeInTheDocument();
  });

  it('manual signature path: portal, pasted signature + address, Submit stores the identity', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const user = userEvent.setup();
    await renderSetupAt('/setup/link-password');
    await fillPasswordAndConsent(user, false);
    await user.click(screen.getByTestId('sign-manually'));
    // Mode 2: fields visible, the primary action opens the portal.
    const action = screen.getByTestId('manual-signature-action');
    expect(action).toHaveTextContent('Get Signature Manually');
    await user.click(action);
    expect(open).toHaveBeenCalledWith('https://fxblox.fx.land', '_blank', 'noopener,noreferrer');
    // Mode 3: signature entered → Submit (needs the wallet address).
    await user.type(screen.getByTestId('signature-input'), '0xmanualsig');
    expect(screen.getByTestId('manual-signature-action')).toHaveTextContent('Submit');
    expect(screen.getByTestId('manual-signature-action')).toBeDisabled();
    await user.type(screen.getByTestId('wallet-address-input'), '0x1234');
    await user.click(screen.getByTestId('manual-signature-action'));
    await waitFor(() => expect(useUserProfileStore.getState().signiture).toBe('0xmanualsig'));
    expect(useUserProfileStore.getState().manualSignatureWalletAddress).toBe('0x1234');
    expect(await screen.findByTestId('did')).toBeInTheDocument();
    open.mockRestore();
  });

  it('a failed wallet chunk falls back to the manual path', async () => {
    wallet.appkit.initAppKit.mockImplementation(() => {
      throw new Error('AppKit failed to load');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    await renderSetupAt('/setup/link-password');
    await fillPasswordAndConsent(user);
    expect(
      await screen.findByText(
        'The wallet module could not be loaded. You can still sign manually.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('sign-manually')).toBeEnabled();
    errorSpy.mockRestore();
  });

  it('Clear App Storage: confirm → wipe secure store + KV + localStorage + caches → reload', async () => {
    await secureStore.save('DIDPassword', 'old', secureStore.Service.DIDPassword);
    await kvStore.setItem('some-key', 'value');
    localStorage.setItem('fx.something', '1');
    const reload = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload },
    });
    try {
      await renderSetupAt('/setup/link-password');
      await userEvent.click(await screen.findByTestId('clear-app-storage'));
      const dialog = await screen.findByTestId('fx-confirm');
      expect(dialog).toHaveTextContent('Clear App Storage');
      await userEvent.click(screen.getByRole('button', { name: 'Clear and reload' }));
      await waitFor(() => expect(reload).toHaveBeenCalled());
      expect(await secureStore.load(secureStore.Service.DIDPassword)).toBe(false);
      expect(await kvStore.getItem('some-key')).toBeNull();
      expect(localStorage.getItem('fx.something')).toBeNull();
      expect(sessionStorage.getItem('fx.setup.storageCleared')).toBe('1');
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    }
  });
});

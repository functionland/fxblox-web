import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BACKGROUND_STINT_MS, useRelayWake, wakeRelay, WAKE_TIMEOUT_MS } from '../relayWake';

interface RelayerState {
  connected?: boolean;
  connecting?: boolean;
  /** Leave `transportOpen` pending for ever, the way a connect Android froze behaves. */
  wedged?: boolean;
  /** Flip `connected` to true once `transportOpen` resolves, the way a healthy dial behaves. */
  opensSuccessfully?: boolean;
  withRestart?: boolean;
  /**
   * Expose `onProviderDisconnect` — the relayer's own "socket closed, dial a fresh one" path. `fresh` says
   * whether that fresh dial comes up (after a short delay, like the real 100 ms reconnect timer) or never.
   */
  withFastDisconnect?: false | 'fresh' | 'never';
}

function providerWithRelayer(state: RelayerState = {}) {
  const {
    connected = false,
    connecting = false,
    wedged = false,
    opensSuccessfully = false,
    withRestart = true,
    withFastDisconnect = false,
  } = state;
  const relayer: Record<string, unknown> = { connected, connecting };
  const transportOpen = vi.fn(() =>
    wedged
      ? new Promise<void>(() => undefined)
      : Promise.resolve().then(() => {
          if (opensSuccessfully) relayer.connected = true;
        }),
  );
  const restartTransport = vi.fn(async () => {
    relayer.connected = true;
  });
  const onProviderDisconnect = vi.fn(async () => {
    relayer.connected = false;
    if (withFastDisconnect === 'fresh') setTimeout(() => (relayer.connected = true), 120);
  });
  relayer.transportOpen = transportOpen;
  if (withRestart) relayer.restartTransport = restartTransport;
  if (withFastDisconnect) relayer.onProviderDisconnect = onProviderDisconnect;
  return {
    transportOpen,
    restartTransport,
    onProviderDisconnect,
    relayer,
    provider: { client: { core: { relayer } } },
  };
}

/** jsdom reports 'visible' by default; this flips it for the duration of one assertion. */
function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true });
}

afterEach(() => {
  setVisibility('visible');
  vi.useRealTimers();
});

describe('wakeRelay', () => {
  it('reconnects a socket that Android killed while the tab was backgrounded', async () => {
    const { provider, transportOpen } = providerWithRelayer({ opensSuccessfully: true });
    await wakeRelay(provider);
    expect(transportOpen).toHaveBeenCalledTimes(1);
  });

  it('leaves a live socket alone', async () => {
    const { provider, transportOpen, restartTransport } = providerWithRelayer({ connected: true });
    await wakeRelay(provider);
    expect(transportOpen).not.toHaveBeenCalled();
    expect(restartTransport).not.toHaveBeenCalled();
  });

  it('does not believe "connected" after a background stint, and restarts the socket outright', async () => {
    // `relayer.connected` is `socket.readyState === OPEN`, and Android suspends the TCP connection underneath
    // a socket without telling it. Nothing in the library probes a browser socket, so a tab that comes back
    // and trusts OPEN sits there while the wallet's approval waits on the relay — the "Connecting Wallet…"
    // the user watches after they already approved. Restart, and let the resubscribe fetch what was queued.
    const { provider, transportOpen, restartTransport } = providerWithRelayer({ connected: true });
    await wakeRelay(provider, { afterBackground: true });
    expect(restartTransport).toHaveBeenCalledTimes(1);
    expect(transportOpen).not.toHaveBeenCalled();
  });

  it('after a background stint, prefers dropping the socket for a fresh one over a polite restart', async () => {
    // `restartTransport()` asks a dead socket to close and waits up to 2 s for a handshake a suspended TCP
    // connection never completes. `onProviderDisconnect()` is what the relayer runs when a socket's `close`
    // fires on its own: drop it and dial a fresh one 100 ms later — the truthful treatment of a socket that
    // is, in fact, gone. No two-second wait.
    const { provider, restartTransport, onProviderDisconnect, relayer } = providerWithRelayer({
      connected: true,
      withFastDisconnect: 'fresh',
    });
    await wakeRelay(provider, { afterBackground: true });
    expect(onProviderDisconnect).toHaveBeenCalledTimes(1);
    expect(restartTransport).not.toHaveBeenCalled();
    expect(relayer.connected).toBe(true);
  });

  it('falls back to the polite restart when the fresh socket does not come up within the bound', async () => {
    vi.useFakeTimers();
    const { provider, restartTransport, onProviderDisconnect, relayer } = providerWithRelayer({
      connected: true,
      withFastDisconnect: 'never',
    });
    const done = wakeRelay(provider, { afterBackground: true });
    await vi.advanceTimersByTimeAsync(WAKE_TIMEOUT_MS + 200);
    await done;
    expect(onProviderDisconnect).toHaveBeenCalledTimes(1);
    expect(restartTransport).toHaveBeenCalledTimes(1);
    expect(relayer.connected).toBe(true);
  });

  it('after a background stint, a socket that is honestly down takes the normal path', async () => {
    const { provider, transportOpen, restartTransport } = providerWithRelayer({ opensSuccessfully: true });
    await wakeRelay(provider, { afterBackground: true });
    expect(transportOpen).toHaveBeenCalledTimes(1);
    expect(restartTransport).not.toHaveBeenCalled();
  });

  it('after a background stint, a relayer without restartTransport is left alone rather than broken', async () => {
    const { provider, transportOpen } = providerWithRelayer({ connected: true, withRestart: false });
    await expect(wakeRelay(provider, { afterBackground: true })).resolves.toBeUndefined();
    expect(transportOpen).not.toHaveBeenCalled();
  });

  it('a restart that fails after a background stint is swallowed too', async () => {
    const { provider, restartTransport } = providerWithRelayer({ connected: true });
    restartTransport.mockRejectedValueOnce(new Error('relay unreachable'));
    await expect(wakeRelay(provider, { afterBackground: true })).resolves.toBeUndefined();
  });

  it('still wakes when the relayer claims to be connecting', async () => {
    // `get connecting()` is true whenever `connectPromise !== undefined`, and a connect Android froze leaves
    // that promise pending for ever. Guarding on it made the wake a no-op in the one case it exists for.
    const { provider, transportOpen } = providerWithRelayer({ connecting: true, opensSuccessfully: true });
    await wakeRelay(provider);
    expect(transportOpen).toHaveBeenCalledTimes(1);
  });

  it('escalates to restartTransport when transportOpen is awaiting a frozen attempt', async () => {
    vi.useFakeTimers();
    const { provider, transportOpen, restartTransport, relayer } = providerWithRelayer({ wedged: true });
    const done = wakeRelay(provider);
    await vi.advanceTimersByTimeAsync(WAKE_TIMEOUT_MS + 1);
    await done;
    expect(transportOpen).toHaveBeenCalledTimes(1);
    expect(restartTransport).toHaveBeenCalledTimes(1);
    expect(relayer.connected).toBe(true);
  });

  it('does not escalate when transportOpen got the socket up', async () => {
    const { provider, restartTransport } = providerWithRelayer({ opensSuccessfully: true });
    await wakeRelay(provider);
    expect(restartTransport).not.toHaveBeenCalled();
  });

  it('degrades to the polite path when the relayer has no restartTransport', async () => {
    // A shape change in the library must not throw here.
    const { provider, transportOpen } = providerWithRelayer({ withRestart: false });
    await expect(wakeRelay(provider)).resolves.toBeUndefined();
    expect(transportOpen).toHaveBeenCalledTimes(1);
  });

  it('swallows a failed reconnect instead of surfacing it', async () => {
    // An unreachable relay is not something the user can act on here, and the request they make next reports it
    // with the context of what they were actually trying to do.
    const { provider, restartTransport } = providerWithRelayer();
    provider.client.core.relayer.transportOpen = vi.fn(async () => {
      throw new Error("Couldn't establish socket connection to the relay server");
    });
    restartTransport.mockRejectedValueOnce(new Error('still down'));
    await expect(wakeRelay(provider)).resolves.toBeUndefined();
  });

  it('is inert for a wallet with no relay', async () => {
    // An injected/extension wallet has no socket to wake.
    await expect(wakeRelay(undefined)).resolves.toBeUndefined();
    await expect(wakeRelay({ request: () => undefined })).resolves.toBeUndefined();
    await expect(wakeRelay({ client: { core: {} } })).resolves.toBeUndefined();
  });
});

describe('useRelayWake', () => {
  it('wakes the socket when the tab comes back to the front', () => {
    const { provider, transportOpen } = providerWithRelayer();
    renderHook(() => useRelayWake(provider));

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(transportOpen).not.toHaveBeenCalled();

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(transportOpen).toHaveBeenCalledTimes(1);
  });

  it('restarts a socket that claims to be open when the tab was away long enough to have been in a wallet', () => {
    vi.useFakeTimers();
    const { provider, restartTransport, transportOpen } = providerWithRelayer({ connected: true });
    renderHook(() => useRelayWake(provider));

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(BACKGROUND_STINT_MS + 500);
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(restartTransport).toHaveBeenCalledTimes(1);
    expect(transportOpen).not.toHaveBeenCalled();
  });

  it('leaves an open socket alone after a mere flick between tabs', () => {
    // A desktop socket was never suspended; restarting it on every tab switch would be a reconnect for nothing.
    vi.useFakeTimers();
    const { provider, restartTransport } = providerWithRelayer({ connected: true });
    renderHook(() => useRelayWake(provider));

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(BACKGROUND_STINT_MS - 200);
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(restartTransport).not.toHaveBeenCalled();
  });

  it('a visible event with no preceding hidden is not treated as a return from the background', () => {
    const { provider, restartTransport } = providerWithRelayer({ connected: true });
    renderHook(() => useRelayWake(provider));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(restartTransport).not.toHaveBeenCalled();
  });

  it('uses the current provider, not the one it mounted with', () => {
    // The provider arrives after the wallet connects, which is later than this hook mounts.
    const first = providerWithRelayer();
    const second = providerWithRelayer();
    const { rerender } = renderHook(({ p }: { p: unknown }) => useRelayWake(p), {
      initialProps: { p: first.provider as unknown },
    });
    rerender({ p: second.provider as unknown });

    document.dispatchEvent(new Event('visibilitychange'));
    expect(first.transportOpen).not.toHaveBeenCalled();
    expect(second.transportOpen).toHaveBeenCalledTimes(1);
  });

  it('stops listening once unmounted', () => {
    const { provider, transportOpen } = providerWithRelayer();
    const { unmount } = renderHook(() => useRelayWake(provider));
    unmount();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(transportOpen).not.toHaveBeenCalled();
  });
});

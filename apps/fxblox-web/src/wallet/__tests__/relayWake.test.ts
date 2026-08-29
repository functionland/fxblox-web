import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRelayWake, wakeRelay } from '../relayWake';

function providerWithRelayer(state: { connected?: boolean; connecting?: boolean } = {}) {
  const transportOpen = vi.fn(async () => undefined);
  return {
    transportOpen,
    provider: {
      client: {
        core: {
          relayer: { connected: false, connecting: false, ...state, transportOpen },
        },
      },
    },
  };
}

/** jsdom reports 'visible' by default; this flips it for the duration of one assertion. */
function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true });
}

afterEach(() => {
  setVisibility('visible');
});

describe('wakeRelay', () => {
  it('reconnects a socket that Android killed while the tab was backgrounded', () => {
    const { provider, transportOpen } = providerWithRelayer({ connected: false });
    wakeRelay(provider);
    expect(transportOpen).toHaveBeenCalledTimes(1);
  });

  it('leaves a live socket alone', () => {
    const { provider, transportOpen } = providerWithRelayer({ connected: true });
    wakeRelay(provider);
    expect(transportOpen).not.toHaveBeenCalled();
  });

  it('does not race a connection attempt already in flight', () => {
    const { provider, transportOpen } = providerWithRelayer({ connecting: true });
    wakeRelay(provider);
    expect(transportOpen).not.toHaveBeenCalled();
  });

  it('swallows a failed reconnect instead of surfacing it', async () => {
    // An unreachable relay is not something the user can act on here, and the request they make next reports it
    // with the context of what they were actually trying to do.
    const { provider } = providerWithRelayer();
    provider.client.core.relayer.transportOpen = vi.fn(async () => {
      throw new Error("Couldn't establish socket connection to the relay server");
    });
    expect(() => wakeRelay(provider)).not.toThrow();
    await Promise.resolve();
  });

  it('is inert for a wallet with no relay', () => {
    // An injected/extension wallet has no socket to wake.
    expect(() => wakeRelay(undefined)).not.toThrow();
    expect(() => wakeRelay({ request: () => undefined })).not.toThrow();
    expect(() => wakeRelay({ client: { core: {} } })).not.toThrow();
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

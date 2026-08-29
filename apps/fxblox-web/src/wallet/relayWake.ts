/**
 * Wake the WalletConnect relay socket when the tab comes back to the front.
 *
 * Android takes the network away from a backgrounded Chrome, so the socket the session lives on dies while the
 * user is over in their wallet approving something. Nothing in `@walletconnect/core` watches for the return:
 * the shipped bundle registers no `visibilitychange` listener at all. So on the way back the page sits through
 * the library's own reconnect backoff before it notices anything — which is the 5-10 seconds of "connecting"
 * a user stares at after they have already approved.
 *
 * `transportOpen()` is the right lever. It awaits an in-flight connection attempt instead of racing a second
 * one, and it returns early when the client has no topics to subscribe to. `restartTransport()` would also
 * reconnect, but it tears the subscriber down first — far too much for a routine foreground. Poking the wallet
 * with a cheap RPC would work too, and on a phone that means waking the WALLET app; the socket is what needs
 * waking, not the user's wallet.
 */
import { useEffect, useRef } from 'react';

interface RelayerLike {
  /** True only when the underlying socket's readyState is OPEN. */
  connected: boolean;
  connecting: boolean;
  transportOpen(): Promise<void>;
}

function relayerFrom(provider: unknown): RelayerLike | null {
  const relayer = (provider as { client?: { core?: { relayer?: unknown } } } | undefined)?.client?.core
    ?.relayer as Partial<RelayerLike> | undefined;
  if (!relayer || typeof relayer.transportOpen !== 'function') return null;
  return relayer as RelayerLike;
}

/**
 * Is the relay socket actually open right now?
 *
 * `null` when there is no relay to ask — an injected/extension wallet, which needs no socket. Callers use this
 * to avoid sending someone into a wallet that has no way to collect what was sent: with the socket down, the
 * request is not on the relay, so the wallet opens onto nothing.
 */
export function isRelayConnected(provider: unknown): boolean | null {
  const relayer = relayerFrom(provider);
  return relayer ? relayer.connected === true : null;
}

/**
 * Reconnect the relay socket if it is down. No-op when it is already up, already dialling, or when this is not
 * a WalletConnect-backed provider at all (an extension wallet has no relay).
 */
export function wakeRelay(provider: unknown): void {
  const relayer = relayerFrom(provider);
  if (!relayer || relayer.connected || relayer.connecting) return;
  // Fire and forget. `transportOpen` throws when the relay is unreachable, which is neither something the
  // caller can act on nor something to interrupt the user with — the next actual request reports it properly,
  // with the context of what the user was trying to do.
  void relayer.transportOpen().catch(() => undefined);
}

/** Wake the socket every time this tab becomes visible again, for as long as the component is mounted. */
export function useRelayWake(provider: unknown): void {
  const latest = useRef(provider);
  latest.current = provider;
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') wakeRelay(latest.current);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);
}

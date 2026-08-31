/**
 * Wake the WalletConnect relay socket when the tab comes back to the front.
 *
 * Android takes the network away from a backgrounded Chrome, so the socket the session lives on dies while the
 * user is over in their wallet approving something. Nothing in `@walletconnect/core` watches for the return:
 * the shipped bundle registers no `visibilitychange` listener at all. So on the way back the page sits through
 * the library's own reconnect backoff before it notices anything — which is the 5-10 seconds of "connecting"
 * a user stares at after they have already approved.
 *
 * ## Why this is not just `transportOpen()`
 *
 * `transportOpen()` is the polite lever, and it is the right first move: it returns early when the client has
 * no topics, and it AWAITS an in-flight attempt instead of racing a second one.
 *
 * That last property is also its failure mode. From the shipped `@walletconnect/core@2.23.7`:
 *
 *     async transportOpen(e){
 *       if(!this.subscriber.hasAnyTopics){ … return }
 *       if(this.connectPromise){ await this.connectPromise }
 *       else { this.connectPromise = new Promise(async(res,rej)=>{
 *                await this.connect(e).then(res).catch(rej).finally(()=>{ this.connectPromise = undefined }) });
 *              await this.connectPromise }
 *       if(!this.connected) throw new Error("Couldn't establish socket connection…")
 *     }
 *
 * When Android freezes a connect attempt mid-flight, `connectPromise` is left pending with no socket behind it
 * and no rejection coming. `transportOpen()` then awaits that same dead promise for ever, and so does every
 * later call. This is exactly the state a returning tab is in, so the polite lever alone can hang precisely
 * when it is needed.
 *
 * This used to guard on `relayer.connecting` and give up when it was true. That guard was strictly harmful:
 * `get connecting()` is `socket.readyState === 0 || this.connectPromise !== undefined`, so a wedged
 * `connectPromise` made it permanently true and the wake permanently a no-op — in the one case it exists for.
 *
 * So: try `transportOpen()`, but bounded. If the socket is still not up when the bound expires, escalate to
 * `restartTransport()`, which is the library's OWN recovery for a stalled connection (it is what the
 * `connection_stalled` handler calls) and which tears the transport down before dialling again.
 *
 * ## Why not `transportClose()` + `transportOpen()`
 *
 * Rejected after reading it. `transportClose()` sets `transportExplicitlyClosed = true` — the flag every
 * auto-reconnect path checks before doing anything — and its `resetTransport()` calls `subscriber.stop()`.
 * Hand-rolling that pair means owning the ordering that clears the flag again, and getting it wrong leaves a
 * session that will never reconnect on its own. `restartTransport()` already sequences the same teardown
 * correctly (`confirmOnlineStateOrThrow` → `resetTransport` → `transportOpen`), and `connect()` clears the
 * flag on the way in. Use the library's version.
 */
import { useEffect, useRef } from 'react';

/**
 * How long to let the polite `transportOpen()` run before assuming it is awaiting a frozen attempt.
 *
 * A healthy dial over mobile data is well inside this. It is a floor on nothing — if `transportOpen()` wins
 * the race the escalation never happens — so the cost of it being generous is only a slower recovery in the
 * wedged case, and the cost of it being too tight is tearing down a connection that was about to succeed.
 */
export const WAKE_TIMEOUT_MS = 2500;

interface RelayerLike {
  /** True only when the underlying socket's readyState is OPEN. */
  connected: boolean;
  connecting: boolean;
  transportOpen(): Promise<void>;
  /** Present since core 2.x; guarded anyway so a shape change degrades to the polite path. */
  restartTransport?(): Promise<void>;
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

const settleAfter = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Reconnect the relay socket if it is down.
 *
 * No-op when it is already up, or when this is not a WalletConnect-backed provider at all (an extension wallet
 * has no relay). Never rejects: a relay that cannot be reached is not something the caller can act on, and the
 * next real request reports it properly, with the context of what the user was trying to do.
 */
export async function wakeRelay(provider: unknown): Promise<void> {
  const relayer = relayerFrom(provider);
  if (!relayer || relayer.connected) return;
  // Bounded, because this call awaits any in-flight attempt — including one Android froze (see header).
  await Promise.race([relayer.transportOpen().catch(() => undefined), settleAfter(WAKE_TIMEOUT_MS)]);
  if (relayer.connected || typeof relayer.restartTransport !== 'function') return;
  await relayer.restartTransport().catch(() => undefined);
}

/** Wake the socket every time this tab becomes visible again, for as long as the component is mounted. */
export function useRelayWake(provider: unknown): void {
  const latest = useRef(provider);
  latest.current = provider;
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void wakeRelay(latest.current);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);
}

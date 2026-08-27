/**
 * Adapted from react-native-fula/src/protocols/fula.ts (1.58.x). Behaviour preserved; differences:
 *   - logs go to the ring buffer and NEVER include the identity string (mobile console.logs it);
 *   - `init` (WNFS filesystem) is not available in the browser → rejects with UNSUPPORTED_ACTION;
 *   - `setAuth` and `registerLifecycleListener` are no-ops (the mobile app calls a `fula.setAuth` that does not
 *     exist in react-native-fula either — plan §WS3 removes that call; keeping a no-op here is belt and braces).
 */
import Fula from '../core/nativeShim.js';
import { createLogger } from '../core/log.js';

const log = createLogger('fula');

/**
 * Register the app's lifecycle listeners to handle foreground, background, and termination states.
 * No-op on the web (visibility handling lives inside the client).
 */
export const registerLifecycleListener = (): Promise<void> => {
  log.debug('called registerLifecycleListener (no-op on web)');
  return Fula.registerLifecycleListener();
};

/**
 * Initializes the Fula client and connects to a blox node, including the WNFS filesystem.
 * Not supported in the browser (no datastore) — rejects with UNSUPPORTED_ACTION.
 */
export const init = (
  identity: string,
  storePath: string,
  bloxAddr: string,
  exchange: string,
  autoFlush: boolean = false,
  rootCid: string | null = null,
  useRelay: boolean = true,
  refresh: boolean = false,
): Promise<{ peerId: string; rootCid: string }> => {
  log.debug('init in fula-web-client started', { storePath, bloxAddr, exchange, autoFlush, useRelay, refresh });
  return Fula.initFula(identity, storePath, bloxAddr, exchange, autoFlush, rootCid, useRelay, refresh);
};

/**
 * Creates a new Fula client without initializing the filesystem.
 * @param identity - privateKey of did identity (the 64-byte secretKey as a comma-joined string)
 * @param storePath - local store path (ignored on web)
 * @param bloxAddr - Blox multiaddr (must end with /p2p/<blox peer id>)
 * @param exchange - exchange protocol (set to 'noop' for testing)
 * @param autoFlush - ignored on web
 * @param useRelay - ignored on web (the browser always dials through the relay)
 * @param refresh - force a new client even if one with the same identity/bloxAddr is running
 * @returns peerId as string
 */
export const newClient = (
  identity: string,
  storePath: string,
  bloxAddr: string,
  exchange: string,
  autoFlush: boolean = false,
  useRelay: boolean = true,
  refresh: boolean = false,
): Promise<string> => {
  log.info('newClient in fula-web-client started', { storePath, bloxAddr, exchange, autoFlush, useRelay, refresh });
  return Fula.newClient(identity, storePath, bloxAddr, exchange, autoFlush, useRelay, refresh);
};

/**
 * Logs out and removes all local data.
 * @returns boolean indicating success
 */
export const logout = (identity: string, storePath: string): Promise<boolean> => {
  return Fula.logout(identity, storePath);
};

/**
 * Checks the connection to the blox node (`/x/fula-ping`, falling back to a libp2p ping).
 * @param timeout - timeout in seconds (default 20)
 * @returns boolean indicating connection status
 */
export const checkConnection = (timeout: number = 20): Promise<boolean> => {
  return Fula.checkConnection(timeout);
};

/**
 * Ping sends libp2p pings to the blox peer and returns results.
 * @param timeout - timeout in seconds (default 60)
 * @returns {success, successes, avg_rtt_ms, errors}
 */
export const ping = (
  timeout: number = 60,
): Promise<{
  success: boolean;
  successes: number;
  avg_rtt_ms: number;
  errors: string[];
}> => {
  return Fula.ping(timeout).then((res: string) => JSON.parse(res));
};

/**
 * Shutdown closes all resources used by Client.
 * After calling this function Client must be discarded.
 */
export const shutdown = (): Promise<void> => {
  return Fula.shutdown();
};

/**
 * isReady checks if the connection is ready to be used.
 * @param filesystemCheck - ignored on web
 * @returns boolean indicating readiness
 */
export const isReady = (filesystemCheck: boolean = true): Promise<boolean> => {
  return Fula.isReady(filesystemCheck);
};

/**
 * No-op kept for API compatibility with callers that expect a `setAuth` on the fula namespace (apps/box calls it
 * with `(peerId, allow)`, go-fula's signature is `(on, subject, allow)` — both are accepted and ignored).
 */
export const setAuth = (..._args: unknown[]): Promise<boolean> => {
  return Promise.resolve(true);
};

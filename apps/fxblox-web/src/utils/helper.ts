import { HDKEY, DID } from '@functionland/fula-sec-web';
import { fula } from '@/lib/fula';
import * as Constants from './constants';
import { findBox as discoveryFindBox, refreshRelayCache as discoveryRefreshRelayCache } from '@/services/discoveryClient';

// ─── Discovery API integration ─────────────────────────────────────────────
// Moved to services/discoveryClient.ts (logic verbatim); re-exported here so the ported callers and the
// ported helper tests keep their import path.
export const refreshRelayCache = discoveryRefreshRelayCache;
export const findBox = discoveryFindBox;

/**
 * Normalise the fula-sec-web keypair so `secretKey` is a plain Uint8Array: `Uint8Array.prototype.toString()`
 * is `join(',')`, which is exactly the identity string go-fula hashes (`sha256("d0,d1,…,d63")`). A Buffer
 * subclass would stringify differently, so it is converted via `Uint8Array.from`.
 */
export const identityStringFromSecretKey = (secretKey: Uint8Array): string => Array.from(Uint8Array.from(secretKey)).join(',');

export const getMyDID = (password: string, signiture: string): string => {
  const ed = new HDKEY(password);
  const keyPair = ed.createEDKeyPair(signiture);
  const did = new DID(Uint8Array.from(keyPair.secretKey));
  return did.did();
};

export const getMyDIDKeyPair = (
  password: string,
  signiture: string,
): {
  secretKey: Uint8Array;
  pubKey: Uint8Array;
} => {
  const ed = new HDKEY(password);
  const keyPair = ed.createEDKeyPair(signiture);
  return { secretKey: Uint8Array.from(keyPair.secretKey), pubKey: Uint8Array.from(keyPair.publicKey) };
};

let initFulaPromise: Promise<string | undefined> | null = null; // Shared promise to track execution
let initFulaTimeout: ReturnType<typeof setTimeout> | null = null; // Timeout for cleanup
let initFulaGen = 0; // Generation counter so stale finally/timeout don't clear a newer promise

// Cleanup function to reset promise and timeout
const cleanupInitFula = () => {
  if (initFulaTimeout) {
    clearTimeout(initFulaTimeout);
    initFulaTimeout = null;
  }
  initFulaPromise = null;
};

// Allow a new initFula to start by clearing the promise guard.
// The old client call may still be running — the new initFula's logout+shutdown will clean it up.
export const resetInitFula = () => {
  initFulaGen++; // prevent old finally/timeout from clearing new state
  if (initFulaTimeout) {
    clearTimeout(initFulaTimeout);
    initFulaTimeout = null;
  }
  initFulaPromise = null;
};

/**
 * Client lifecycle epoch. `initFulaGen` bumps on EVERY client lifecycle change — both `resetInitFula()` and
 * the start of each `initFula()`. Async store ops capture this before their client call and re-check it after
 * the await: a mismatch means the underlying `fula` client was reset/recreated mid-call, so any result is stale
 * and must not be attributed to the captured blox. Single authoritative epoch for cross-blox mis-attribution
 * guarding (audit M2/M3).
 */
export const getInitFulaGen = (): number => initFulaGen;

// ─── Sweep coordination (audit M1) ──────────────────────────────────────────
// The single shared `fula` client is cycled (reset + re-init per peerId) by the foreground
// `useBloxsStore.checkAllBloxStatus` and by the foreground `bloxStatusMonitor` (there is no headless task on
// web). A module-level async mutex serializes them over the one client.

let fulaSweepLock: Promise<void> = Promise.resolve();

/**
 * Run `fn` with exclusive ownership of the shared client against any other sweep also using this lock.
 * Standard single-threaded-JS async mutex; ALWAYS released in `finally`. Callees a sweep invokes internally
 * (`switchToBlox`, `checkBloxConnection`) must NOT take this lock, or the sweep would deadlock on itself.
 */
export const withFulaSweepLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  const prev = fulaSweepLock;
  let release!: () => void;
  fulaSweepLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
};

// Set true by a sweep once it has reset/re-inited the client off the selected blox; consumed by the app on
// foreground to decide whether it must reclaim the client (re-init for currentBloxPeerId).
let sweepMovedClient = false;

export const markSweepMovedClient = (moved: boolean): void => {
  sweepMovedClient = moved;
};

export const consumeSweepMovedClient = (): boolean => {
  const moved = sweepMovedClient;
  sweepMovedClient = false;
  return moved;
};

const isCancellation = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && typeof (e as { message?: unknown }).message === 'string' && (e as { message: string }).message.includes('cancelled');

export const initFula = async ({
  password,
  signiture,
  bloxAddr = undefined,
  bloxPeerId,
  shouldCancel,
}: {
  password: string;
  signiture: string;
  bloxAddr?: string;
  bloxPeerId?: string;
  conAddr?: string;
  shouldCancel?: () => boolean;
}): Promise<string | undefined> => {
  // If a previous call is in progress, wait for it to finish
  if (initFulaPromise) {
    console.log('initFula is already running. Waiting for the previous call...');
    return initFulaPromise;
  }

  // Create a new promise for this execution
  const myGen = ++initFulaGen;
  // `timedOut` is observable by the retry loop so an orphaned iteration doesn't continue after the outer reject.
  let timedOut = false;
  initFulaPromise = new Promise((resolve, reject) => {
    // 90 seconds covers up to 5 candidate addresses at ~15s each, plus logout/shutdown overhead between attempts.
    initFulaTimeout = setTimeout(() => {
      console.warn('initFula timeout reached, cleaning up...');
      timedOut = true;
      if (initFulaGen === myGen) {
        cleanupInitFula();
      }
      reject(new Error('initFula operation timed out'));
    }, 90000);

    (async () => {
      try {
        if (!password || !signiture) {
          throw new Error('Password and signature are required to initialize Fula.');
        }

        // Determine candidate Blox addresses.
        //   - If bloxAddr is provided explicitly: use exactly that one.
        //   - If bloxPeerId is provided: ask the Discovery API for the box's current circuit addresses.
        //   - Otherwise: empty string (no specific blox target).
        let bloxAddresses: string[];
        if (bloxAddr) {
          bloxAddresses = [bloxAddr];
        } else if (bloxPeerId) {
          bloxAddresses = await findBox(bloxPeerId);
        } else {
          bloxAddresses = [''];
        }

        const keyPair = getMyDIDKeyPair(password, signiture);
        const identity = identityStringFromSecretKey(keyPair.secretKey);

        // Log without sensitive keyPair data
        console.log('initFula helper.ts', {
          candidateCount: bloxAddresses.length,
          firstCandidate: bloxAddresses[0],
          bloxPeerId,
          keyPairGenerated: !!keyPair,
        });

        try {
          // Attempt to logout and shutdown any previous Fula client
          await fula.logout(identity, '');
          if (shouldCancel?.()) {
            throw new Error('initFula cancelled — switch superseded after logout');
          }
          await fula.shutdown();
          console.log('Previous Fula client shutdown successfully.');
        } catch (shutdownError) {
          // Re-throw cancellation errors
          if (isCancellation(shutdownError)) throw shutdownError;
          console.warn('Failed to shutdown previous Fula client:', shutdownError);
        }

        // Bail out before the expensive newClient call if superseded
        if (shouldCancel?.()) {
          throw new Error('initFula cancelled — switch superseded before newClient');
        }

        // Iterate candidate Blox addresses until one connects. Clean client state between attempts.
        let peerId: string | undefined;
        let lastError: unknown;
        for (let i = 0; i < bloxAddresses.length; i++) {
          const candidate = bloxAddresses[i] ?? '';
          if (timedOut) {
            throw new Error('initFula aborted — outer timeout fired');
          }
          if (shouldCancel?.()) {
            throw new Error('initFula cancelled — switch superseded during retry');
          }
          if (i > 0) {
            try {
              await fula.logout(identity, '');
              await fula.shutdown();
            } catch (cleanupErr) {
              if (isCancellation(cleanupErr)) throw cleanupErr;
              console.warn('Pre-retry cleanup failed (non-fatal):', cleanupErr);
            }
            if (shouldCancel?.()) {
              throw new Error('initFula cancelled — switch superseded during retry cleanup');
            }
          }
          try {
            peerId = await fula.newClient(
              identity, // Private key of DID identity in string format
              '', // Leave empty to use the default temp one
              candidate,
              candidate ? '' : 'noop', // Leave empty for testing without a backend node
              true, // Enable IPFS storage
              true, // Enable IPFS networking
              true, // Enable IPFS pubsub
            );
            console.log('Fula initialized via', candidate, 'with peerId:', peerId);
            break;
          } catch (newClientError) {
            // Cancellation must propagate immediately — don't try further candidates.
            if (isCancellation(newClientError)) throw newClientError;
            console.warn(`newClient failed for candidate ${candidate}:`, newClientError);
            lastError = newClientError;
          }
        }
        if (peerId === undefined) {
          throw lastError ?? new Error('initFula: all blox addresses failed');
        }

        resolve(peerId);
      } catch (error) {
        console.error('initFula failed:', error);
        reject(error);
      } finally {
        console.log('Resetting initFulaPromise');
        // Only clean up if we're still the active generation — resetInitFula() may have already cleared us.
        if (initFulaGen === myGen) {
          // Delay cleanup by one microtick so concurrent awaiters see the resolved/rejected promise rather than null
          await Promise.resolve().then(() => cleanupInitFula());
        }
      }
    })();
  });

  return initFulaPromise;
};

export const waitForFulaInit = async (): Promise<void> => {
  if (initFulaPromise) {
    try {
      await initFulaPromise;
    } catch {
      // Ignore errors - we just need to wait for init to complete
    }
  }
};

export { generateUniqueId } from './uniqueId';

export { Constants };

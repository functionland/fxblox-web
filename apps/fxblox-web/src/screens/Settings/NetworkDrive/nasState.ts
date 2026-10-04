/**
 * Maps a failed `blockchain.nasCredentials()` call to something a non-technical user can act on.
 *
 * go-fula answers 401 both for "not the owner" and for "this firmware does not know the action yet", so a 401 is
 * only shown as owner-only when the app knows the Blox's owner and it is someone else.
 */
export type NasErrorKind = 'notProvisioned' | 'ownerOnly' | 'needsUpdate' | 'reconnect' | 'busy' | 'offline' | 'generic';

/** Transport failures: the Blox could not be reached at all. */
const OFFLINE_CODES = new Set([
  'NO_CANDIDATES',
  'NO_CERTHASH',
  'DIAL_TIMEOUT',
  'DIAL_FAILED',
  'NO_RESERVATION',
  'RELAY_LIMIT',
  'CIRCUIT_DATA_CAP',
  'TIMEOUT',
  'CLIENT_CLOSED',
  'STREAM_ERROR',
  'NOT_INITIALIZED',
  'UNSUPPORTED_PROTOCOL',
]);

/** Same duck-typing as `isFulaWebError` in `@/lib/fula` (the class lives in the lazily loaded client chunk). */
function fulaError(e: unknown): { code: string; status?: number } | null {
  if (typeof e !== 'object' || e === null) return null;
  const { name, code, status } = e as { name?: unknown; code?: unknown; status?: unknown };
  if (name !== 'FulaWebError' || typeof code !== 'string') return null;
  return typeof status === 'number' ? { code, status } : { code };
}

export function nasErrorKind(e: unknown, ctx: { authorizer?: string | undefined; appPeerId?: string | undefined }): NasErrorKind {
  const err = fulaError(e);
  if (!err) return 'generic';
  if (err.code === 'NOT_AUTHORIZED') {
    return ctx.authorizer && ctx.appPeerId && ctx.authorizer !== ctx.appPeerId ? 'ownerOnly' : 'needsUpdate';
  }
  if (err.code === 'HTTP_ERROR') {
    if (err.status === 404) return 'notProvisioned';
    if (err.status === 400) return 'reconnect';
    if (err.status === 503) return 'busy';
    return 'generic';
  }
  return OFFLINE_CODES.has(err.code) ? 'offline' : 'generic';
}

/** Which errors offer a retry button (owner-only never changes by retrying). */
export function nasErrorRetryable(kind: NasErrorKind): boolean {
  return kind !== 'ownerOnly';
}

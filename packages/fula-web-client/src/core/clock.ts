/**
 * Server clock offset learned from `/x/fula-ping`.
 *
 * go-fula verifies `X-Fula-Timestamp` against its own clock with a ±300 s window
 * (`blockchain/auth_signed.go: maxTimestampSkew = 5 * time.Minute`). A browser whose clock is off by more than
 * that would get 401 on every signed request, so we learn `serverTime - localTime` from the ping server's
 * `timestamp` field and apply it when signing.
 *
 * NOTE: `blockchain/ping_server.go` fills `timestamp` with `time.Now().UnixMilli()` (milliseconds), while the
 * signed header itself is unix *seconds*. `normalizeServerTimestampMs` accepts both seconds and milliseconds so
 * an older/newer firmware that switches units keeps working.
 */
export function normalizeServerTimestampMs(value: number | string | undefined | null): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return Number.NaN;
  // Anything below 1e11 cannot be a millisecond timestamp for a date after 1973 → treat as seconds.
  return n < 1e11 ? n * 1000 : n;
}

export class ClockSync {
  private offsetMs = 0;
  private syncedAt: number | undefined;

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** Offset in whole seconds (server − local). */
  get offsetSeconds(): number {
    return Math.round(this.offsetMs / 1000);
  }

  get isSynced(): boolean {
    return this.syncedAt !== undefined;
  }

  /** Milliseconds since the last successful sync (Infinity when never synced). */
  get ageMs(): number {
    return this.syncedAt === undefined ? Number.POSITIVE_INFINITY : this.now() - this.syncedAt;
  }

  /**
   * Learn the offset from a server timestamp. `sentAt`/`receivedAt` (local ms) bracket the round trip; the server
   * time is compared against the midpoint, so a slow relay path does not bias the offset by the full RTT.
   * Returns false when the timestamp was unusable.
   */
  learn(serverTimestamp: number | string | undefined | null, sentAt: number, receivedAt: number): boolean {
    const serverMs = normalizeServerTimestampMs(serverTimestamp);
    if (Number.isNaN(serverMs)) return false;
    const midpoint = (sentAt + receivedAt) / 2;
    this.offsetMs = serverMs - midpoint;
    this.syncedAt = receivedAt;
    return true;
  }

  /** Unix seconds as the server sees them — what goes into `X-Fula-Timestamp`. */
  nowSeconds(): number {
    return Math.floor((this.now() + this.offsetMs) / 1000);
  }

  reset(): void {
    this.offsetMs = 0;
    this.syncedAt = undefined;
  }
}

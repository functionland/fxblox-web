export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Poll `predicate` until true (or throw after `timeoutMs`). Real timers only. */
export async function waitFor(
  predicate: () => boolean,
  opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<void> {
  const { timeoutMs = 5000, intervalMs = 10, label = 'condition' } = opts;
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs)
      throw new Error(`waitFor: ${label} not met within ${timeoutMs} ms`);
    await sleep(intervalMs);
  }
}

/** Flush pending microtasks a few times. */
export async function flushMicrotasks(rounds = 5): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

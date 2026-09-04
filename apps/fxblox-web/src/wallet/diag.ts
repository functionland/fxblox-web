/**
 * Wallet / relay diagnostics that a user can actually hand back.
 *
 * Every theory about the "connecting for seconds after I approved" delay and the "MetaMask sits on its splash
 * screen" hang has so far been argued from code reading, because the only evidence was `console.log` lines
 * on a phone nobody had a debugger attached to. This routes the same lines into the `clientLogger` ring
 * buffer, timestamped relative to the moment the tab came back to the front — which is the moment every one
 * of those seconds is counted from — so the debug-mode banner can copy them out in one tap.
 *
 * Always on. The ring buffer is 500 lines in memory and costs nothing; gating this on debug mode would mean
 * the one report that matters was taken with it off.
 */
import { appendLog } from '@/utils/clientLogger';

let returnedAt: number | null = null;

/** The tab just came back to the front. Subsequent lines carry "+Nms since return". */
export function markReturn(): void {
  returnedAt = Date.now();
}

function sinceReturn(): string {
  return returnedAt === null ? '' : ` (+${Date.now() - returnedAt}ms since return)`;
}

function render(a: unknown): string {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return `${a.name}: ${a.message}`;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

/** Log to the console AND the shareable ring buffer. */
export function diag(...args: unknown[]): void {
  const line = args.map(render).join(' ') + sinceReturn();
  console.log(line);
  appendLog('log', line);
}

/**
 * BackgroundTasks — react-native-background-fetch replacement. The browser has no headless execution, so this is
 * a documented no-op; periodic work runs in the foreground (`services/bloxStatusMonitor`). Kept so Settings can
 * explain "keep this tab open" and so call sites port 1:1.
 */

export const BACKGROUND_TASKS_SUPPORTED = false;

export async function configure(_intervalMinutes: number): Promise<void> {
  /* no-op on web */
}

export async function stop(): Promise<void> {
  /* no-op on web */
}

export const backgroundTasks = { supported: BACKGROUND_TASKS_SUPPORTED, configure, stop };

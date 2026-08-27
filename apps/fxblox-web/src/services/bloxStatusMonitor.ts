/**
 * bloxStatusMonitor — the foreground replacement for `services/backgroundBloxCheck.ts` (react-native-background-
 * fetch + notifee). The browser has no headless execution, so the periodic sweep is a `setInterval` gated on
 * `document.visibilityState`, driven by `useSettingsStore.bloxStatusCheckInterval` (minutes; 0 = off). The
 * body is `useBloxsStore.checkAllBloxStatus()`, which already runs under `withFulaSweepLock` and re-uses the
 * switch/check generation guards (audit M1–M4). No notifee, no headless task.
 */
import { useBloxsStore } from '@/stores/useBloxsStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { isForeground, onVisibilityChange } from '@/platform/visibility';
import { showNotification as osNotify } from '@/platform/notifications';

export interface BloxStatusMonitorState {
  intervalMinutes: number;
  running: boolean;
  lastRunAt: number | null;
  lastResult: { disconnected: string[] } | null;
}

type Listener = (state: BloxStatusMonitorState) => void;

const state: BloxStatusMonitorState = { intervalMinutes: 0, running: false, lastRunAt: null, lastResult: null };
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | null = null;
let unsubscribeVisibility: (() => void) | null = null;
let unsubscribeSettings: (() => void) | null = null;
let pendingWhileHidden = false;

function emit(): void {
  for (const l of listeners) {
    try {
      l({ ...state });
    } catch {
      /* ignore */
    }
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getState(): BloxStatusMonitorState {
  return { ...state };
}

/** Run one sweep now (skipped when hidden or already running). */
export async function runNow(): Promise<void> {
  if (!isForeground()) {
    pendingWhileHidden = true;
    return;
  }
  const bloxs = useBloxsStore.getState();
  if (bloxs._isCheckingAllStatus || Object.keys(bloxs.bloxs).length === 0) return;
  state.running = true;
  emit();
  try {
    await bloxs.checkAllBloxStatus();
    const after = useBloxsStore.getState();
    const disconnected = Object.entries(after.bloxsConnectionStatus)
      .filter(([, status]) => status === 'DISCONNECTED')
      .map(([peerId]) => after.bloxs[peerId]?.name || peerId);
    state.lastResult = { disconnected };
    if (disconnected.length > 0) {
      osNotify('Blox Status Alert', `Disconnected: ${disconnected.join(', ')}`, { tag: 'blox-status' });
    }
  } catch (e) {
    console.warn('[bloxStatusMonitor] sweep failed', e);
  } finally {
    state.running = false;
    state.lastRunAt = Date.now();
    emit();
  }
}

function clearTimer(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Configure (or stop) the periodic foreground sweep. */
export function configure(intervalMinutes: number): void {
  clearTimer();
  state.intervalMinutes = intervalMinutes;
  if (intervalMinutes > 0) {
    timer = setInterval(() => {
      void runNow();
    }, intervalMinutes * 60_000);
  }
  emit();
}

/** Wire to the settings store + visibility; call once at boot. Returns a teardown. */
export function start(): () => void {
  configure(useSettingsStore.getState().bloxStatusCheckInterval);
  unsubscribeSettings?.();
  unsubscribeSettings = useSettingsStore.subscribe((s, prev) => {
    if (s.bloxStatusCheckInterval !== prev.bloxStatusCheckInterval) configure(s.bloxStatusCheckInterval);
  });
  unsubscribeVisibility?.();
  unsubscribeVisibility = onVisibilityChange((visible) => {
    if (visible && pendingWhileHidden) {
      pendingWhileHidden = false;
      void runNow();
    }
  });
  return stop;
}

export function stop(): void {
  clearTimer();
  state.intervalMinutes = 0;
  unsubscribeSettings?.();
  unsubscribeSettings = null;
  unsubscribeVisibility?.();
  unsubscribeVisibility = null;
  pendingWhileHidden = false;
  emit();
}

export const bloxStatusMonitor = { start, stop, configure, runNow, subscribe, getState };

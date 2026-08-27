/**
 * aiSessionPersistence — debounced KV glue for AI-session resume after the tab is hidden OR reloaded.
 *
 * One key (single atomic write) holds the minimal state needed to reattach to a blox-ai container session via
 * `httpAiClient.resume(sessionId, lastEventSeq)`. Debounce: write every DEBOUNCE_EVERY_N events OR
 * DEBOUNCE_MAX_MS, whichever fires first. On 404 from the server the caller MUST `flushDebounce()` +
 * `clearPersistedSession()` before rendering the error so the next foreground doesn't retry the dead session.
 */
import { kvStore, type KeyValueStore } from '@/platform/kvStore';

const STORAGE_KEY = '@blox-ai/persisted-session/v1';

export const DEBOUNCE_EVERY_N = 10;
export const DEBOUNCE_MAX_MS = 500;
export const PERSISTED_SESSION_MAX_AGE_MS = 25 * 60 * 1000;

export interface PersistedSession {
  sessionId: string;
  lastEventSeq: number;
  lastPrompt: string;
  lastScenarioId: string;
  savedAt: number;
}

let store: KeyValueStore = kvStore;
let pendingState: PersistedSession | null = null;
let pendingCount = 0;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimer(): void {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

async function flushNow(): Promise<void> {
  const toWrite = pendingState;
  pendingState = null;
  pendingCount = 0;
  clearTimer();
  if (toWrite === null) return;
  try {
    await store.setItem(STORAGE_KEY, JSON.stringify(toWrite));
  } catch (e) {
    console.warn('aiSessionPersistence: setItem failed', e);
  }
}

export function schedulePersist(state: PersistedSession): void {
  pendingState = state;
  pendingCount += 1;
  if (pendingCount >= DEBOUNCE_EVERY_N) {
    void flushNow();
    return;
  }
  if (pendingTimer === null) {
    pendingTimer = setTimeout(() => {
      void flushNow();
    }, DEBOUNCE_MAX_MS);
  }
}

export async function flushDebounce(): Promise<void> {
  await flushNow();
}

export async function loadPersistedSession(): Promise<PersistedSession | null> {
  let raw: string | null;
  try {
    raw = await store.getItem(STORAGE_KEY);
  } catch (e) {
    console.warn('aiSessionPersistence: getItem failed', e);
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await clearPersistedSession();
    return null;
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    typeof (parsed as PersistedSession).sessionId !== 'string' ||
    typeof (parsed as PersistedSession).lastEventSeq !== 'number' ||
    typeof (parsed as PersistedSession).lastPrompt !== 'string' ||
    typeof (parsed as PersistedSession).lastScenarioId !== 'string' ||
    typeof (parsed as PersistedSession).savedAt !== 'number'
  ) {
    await clearPersistedSession();
    return null;
  }
  const state = parsed as PersistedSession;
  const age = Date.now() - state.savedAt;
  if (age > PERSISTED_SESSION_MAX_AGE_MS) {
    await clearPersistedSession();
    return null;
  }
  return state;
}

export async function clearPersistedSession(): Promise<void> {
  pendingState = null;
  pendingCount = 0;
  clearTimer();
  try {
    await store.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('aiSessionPersistence: removeItem failed', e);
  }
}

/** Test-only: reset the debounce state (and optionally swap the store). */
export const _resetForTests = (s?: KeyValueStore): void => {
  pendingState = null;
  pendingCount = 0;
  clearTimer();
  if (s) store = s;
};

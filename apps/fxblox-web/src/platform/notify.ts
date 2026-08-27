/**
 * notify — the UI-free toast port. The data layer (hooks, services, stores) calls `notify.toast(...)`; WS4 wires
 * the fx-ui ToastProvider with `setToastSink`. Until then toasts go to the console (and are buffered so a late
 * sink can replay the last few).
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  type: ToastType;
  title: string;
  message?: string;
  /** Milliseconds; provider default when omitted. */
  duration?: number;
}

export type ToastSink = (toast: ToastMessage) => void;

const BUFFER_MAX = 5;
let sink: ToastSink | null = null;
const buffered: ToastMessage[] = [];

export function setToastSink(next: ToastSink | null, opts: { replayBuffered?: boolean } = {}): void {
  sink = next;
  if (next && opts.replayBuffered) {
    for (const t of buffered.splice(0)) next(t);
  } else if (next) {
    buffered.length = 0;
  }
}

export function toast(t: ToastMessage): void {
  if (sink) {
    try {
      sink(t);
    } catch (e) {
      console.warn('[notify] toast sink threw', e);
    }
    return;
  }
  buffered.push(t);
  if (buffered.length > BUFFER_MAX) buffered.shift();
  const line = `[toast:${t.type}] ${t.title}${t.message ? ` — ${t.message}` : ''}`;
  if (t.type === 'error') console.error(line);
  else if (t.type === 'warning') console.warn(line);
  else console.info(line);
}

export const notify = { toast, setToastSink };

/** `useToast()` shim so ported hooks keep their `const { queueToast } = useToast()` line. */
export function useToast(): { queueToast: (t: ToastMessage) => void } {
  return { queueToast: toast };
}

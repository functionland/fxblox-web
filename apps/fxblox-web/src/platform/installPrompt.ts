/**
 * The PWA install prompt, captured so a screen can offer it later.
 *
 * This exists to give the persistent-storage ask something that actually works. Chrome decides
 * `navigator.storage.persist()` from engagement heuristics and refuses silently when they are not met, so the
 * "keep my data" button could do nothing and could only explain why — "install this app or bookmark it" is
 * advice, not an action. Installing IS the reliable route, and Chrome will run that dialog on request.
 *
 * `beforeinstallprompt` fires once, early, and only if the app is installable and not already installed. It
 * must be captured at boot or it is missed, and calling `preventDefault()` is what stops Chrome showing its own
 * mini-infobar and lets us decide where to offer it.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

const notify = (): void => {
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      /* a subscriber must not break the others */
    }
  }
};

/** Call once at boot. Idempotent. */
export function watchInstallPrompt(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    // It can only be used once, and there is nothing left to install.
    deferred = null;
    notify();
  });
}

/** Whether an install can be offered right now (false when installed, ineligible, or not Chromium). */
export function canInstall(): boolean {
  return deferred !== null;
}

/** Re-render hook for components that show the install affordance. */
export function onInstallAvailabilityChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Show the install dialog. Must run in a user gesture.
 *
 * Resolves to whether the user accepted. The captured event is single-use, so it is dropped either way — a
 * second call would throw.
 */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  notify();
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome === 'accepted';
  } catch {
    return false;
  }
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canInstall,
  onInstallAvailabilityChange,
  promptInstall,
  watchInstallPrompt,
} from '../installPrompt';

/** The shape Chrome fires: a normal event plus `prompt()` and `userChoice`. */
function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  // Cancelable, like Chrome's: preventDefault() is a no-op otherwise and the assertion below would be empty.
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  event.prompt = vi.fn(async () => undefined);
  event.userChoice = Promise.resolve({ outcome });
  window.dispatchEvent(event);
  return event;
}

describe('installPrompt', () => {
  beforeEach(() => {
    watchInstallPrompt();
  });

  it('offers nothing until Chrome says the app is installable', () => {
    expect(canInstall()).toBe(false);
  });

  it('captures the event, suppressing Chrome’s own infobar, and notifies subscribers', () => {
    const seen = vi.fn();
    const off = onInstallAvailabilityChange(seen);
    const event = fireBeforeInstallPrompt();
    // preventDefault is what stops the mini-infobar and lets the app choose where to offer it.
    expect(event.defaultPrevented).toBe(true);
    expect(canInstall()).toBe(true);
    expect(seen).toHaveBeenCalled();
    off();
  });

  it('runs the dialog once and reports acceptance', async () => {
    const event = fireBeforeInstallPrompt('accepted');
    await expect(promptInstall()).resolves.toBe(true);
    expect(event.prompt).toHaveBeenCalledTimes(1);
    // Single-use: a second call would throw in Chrome, so the offer is withdrawn.
    expect(canInstall()).toBe(false);
    await expect(promptInstall()).resolves.toBe(false);
  });

  it('reports a dismissal as not installed', async () => {
    fireBeforeInstallPrompt('dismissed');
    await expect(promptInstall()).resolves.toBe(false);
  });

  it('withdraws the offer once the app is installed', () => {
    fireBeforeInstallPrompt();
    expect(canInstall()).toBe(true);
    window.dispatchEvent(new Event('appinstalled'));
    expect(canInstall()).toBe(false);
  });
});

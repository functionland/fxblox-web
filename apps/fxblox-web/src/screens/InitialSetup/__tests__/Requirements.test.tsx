/**
 * Requirements used to print four explanatory cards and a capability table to everyone, always — a wall of
 * technical text about things the app can check itself, shown before the user even has a Blox.
 *
 * It now says nothing when there is nothing to do, and when there IS something, it offers the action rather
 * than a description of the action. These tests pin both halves: silence when healthy, and a real control
 * when not.
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderSetupAt, resetStores } from './renderSetup';

/**
 * jsdom reports a non-Chromium user agent, which is a real state this screen handles — but it is not the one
 * most of these tests are about, so it is set explicitly per test rather than left to the environment.
 */
function stubChromium(isChromium: boolean) {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: isChromium
      ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
      : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  });
}

/** jsdom has no Permissions/mediaDevices; install just enough to drive each state. */
function stubBrowser({
  lna,
  hasCamera = true,
  chromium = true,
}: {
  lna?: PermissionState;
  hasCamera?: boolean;
  chromium?: boolean;
} = {}) {
  stubChromium(chromium);
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: {
      query: vi.fn(async ({ name }: { name: string }) => {
        if (name === 'local-network-access') return { state: lna ?? 'granted' };
        throw new Error(`unexpected permission ${name}`);
      }),
    },
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: hasCamera ? { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) } : undefined,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Requirements', () => {
  beforeEach(() => resetStores());

  it('says nothing to do when the browser is healthy, and continues to Link password', async () => {
    stubBrowser({ lna: 'granted' });
    const { router } = await renderSetupAt('/setup/requirements');
    expect(await screen.findByRole('heading', { name: 'Before you start' })).toBeInTheDocument();

    // The whole point: no lecture. None of the old cards, and no capability table.
    await screen.findByTestId('requirements-ok');
    expect(screen.queryByTestId('requirement-browser')).toBeNull();
    expect(screen.queryByTestId('requirement-lna')).toBeNull();
    expect(screen.queryByTestId('requirement-camera')).toBeNull();
    expect(screen.queryByTestId('browser-status')).toBeNull();
    // The Chromium requirement is checked, not announced.
    expect(screen.queryByText(/Chrome or Edge required/i)).toBeNull();

    expect(screen.getByTestId('language-dropdown')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');
    await userEvent.click(screen.getByTestId('setup-continue'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/link-password'));
  });

  it('never asks for the camera — nothing in setup uses one', async () => {
    // The camera is only for Auto-Pin QR pairing, which lives in Settings and raises its own prompt when the
    // scanner opens. Asking here spent a permission decision on a feature the user had not met yet, and put a
    // camera request in front of someone who came to set up a Blox.
    stubBrowser({ lna: 'granted' });
    await renderSetupAt('/setup/requirements');
    await screen.findByTestId('requirements-ok');

    expect(screen.queryByTestId('requirement-camera')).toBeNull();
    expect(screen.queryByTestId('camera-allow')).toBeNull();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    // Not even silently queried: a permissions.query for 'camera' would throw in stubBrowser above.
    const query = navigator.permissions.query as ReturnType<typeof vi.fn>;
    expect(query.mock.calls.flat()).not.toContainEqual(expect.objectContaining({ name: 'camera' }));
  });

  it('shows the settings path only when local network access is actually BLOCKED', async () => {
    stubBrowser({ lna: 'denied' });
    await renderSetupAt('/setup/requirements');
    await screen.findByTestId('requirement-lna');
    expect(
      screen.getAllByText('chrome://settings/content/localNetworkAccess').length,
    ).toBeGreaterThan(0);
  });

  it('stays silent about local network access in the normal "will ask" state', async () => {
    // `prompt` is the state before first contact. Chrome raises its own dialog at that moment, and the
    // connect screens own the retry — so surfacing anything here would be noise the user cannot act on.
    stubBrowser({ lna: 'prompt' });
    await renderSetupAt('/setup/requirements');
    await screen.findByTestId('requirements-ok');
    expect(screen.queryByTestId('requirement-lna')).toBeNull();
  });

  it('warns — and only then — when the browser is not Chromium', async () => {
    stubBrowser({ lna: 'granted', chromium: false });
    await renderSetupAt('/setup/requirements');
    await screen.findByTestId('requirement-browser');
    // The warning replaces the all-clear rather than sitting beside it.
    expect(screen.queryByTestId('requirements-ok')).toBeNull();
  });

  it('Back on a direct load falls back to Welcome', async () => {
    stubBrowser();
    const { router } = await renderSetupAt('/setup/requirements');
    await userEvent.click(await screen.findByTestId('setup-back'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/welcome'));
  });
});

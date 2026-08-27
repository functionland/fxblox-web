import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isDebugModeActive, useSettingsStore } from '@/stores/useSettingsStore';
import { renderSetupAt, resetStores } from './renderSetup';

describe('Welcome', () => {
  beforeEach(() => {
    resetStores();
    useSettingsStore.setState({
      debugMode: { uniqueId: 'id', endDate: new Date(Date.now() - 1000) },
    });
  });

  it('renders the mobile copy and continues to Requirements', async () => {
    const { router } = await renderSetupAt('/setup/welcome');
    expect(await screen.findByText('Hello Functionlander!')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Blox App' })).toBeInTheDocument();
    expect(screen.getByText(/By using this product you agree/)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull(); // progress 0 hides the bar
    await userEvent.click(screen.getByTestId('setup-continue'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/requirements'));
  });

  it('opens the terms in a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await renderSetupAt('/setup/welcome');
    await userEvent.click(await screen.findByTestId('terms'));
    expect(open).toHaveBeenCalledWith('https://fx.land/terms', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });

  it('toggles debug mode from the explicit hidden button and from a 3 s press-and-hold', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await renderSetupAt('/setup/welcome');
      const button = await screen.findByTestId('toggle-debug-mode');
      expect(isDebugModeActive(useSettingsStore.getState().debugMode)).toBe(false);
      await act(async () => {
        button.click();
      });
      expect(isDebugModeActive(useSettingsStore.getState().debugMode)).toBe(true);

      // Press-and-hold on the picture for 3 s toggles it back off.
      const hero = screen.getByTestId('welcome-hero');
      await act(async () => {
        hero.dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 1, clientY: 1 }),
        );
      });
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(isDebugModeActive(useSettingsStore.getState().debugMode)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

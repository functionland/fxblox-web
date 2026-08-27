import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderSetupAt, resetStores } from './renderSetup';

describe('Requirements', () => {
  beforeEach(() => resetStores());

  it('explains LNA, Bluetooth, camera and the Chromium requirement, then continues to Link password', async () => {
    const { router } = await renderSetupAt('/setup/requirements');
    expect(await screen.findByRole('heading', { name: 'Before you start' })).toBeInTheDocument();
    for (const key of ['lna', 'bluetooth', 'camera', 'chromium']) {
      expect(screen.getByTestId(`requirement-${key}`)).toBeInTheDocument();
    }
    expect(
      screen.getAllByText('chrome://settings/content/localNetworkAccess').length,
    ).toBeGreaterThan(0);
    expect(screen.getByTestId('browser-status')).toBeInTheDocument();
    expect(screen.getByTestId('language-dropdown')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');
    await userEvent.click(screen.getByTestId('setup-continue'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/link-password'));
  });

  it('Back on a direct load falls back to Welcome', async () => {
    const { router } = await renderSetupAt('/setup/requirements');
    await userEvent.click(await screen.findByTestId('setup-back'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/setup/welcome'));
  });
});

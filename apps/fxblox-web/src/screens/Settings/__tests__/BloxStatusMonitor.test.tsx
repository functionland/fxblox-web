import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const monitor = vi.hoisted(() => {
  const listeners = new Set<(s: unknown) => void>();
  const state = {
    intervalMinutes: 0,
    running: false,
    lastRunAt: null as number | null,
    lastResult: null,
  };
  return {
    state,
    listeners,
    runNow: vi.fn(async () => undefined),
    emit(next: Partial<typeof state>) {
      Object.assign(state, next);
      for (const l of listeners) l({ ...state });
    },
  };
});

vi.mock('@/services/bloxStatusMonitor', () => ({
  bloxStatusMonitor: {
    getState: () => ({ ...monitor.state }),
    subscribe: (l: (s: unknown) => void) => {
      monitor.listeners.add(l);
      return () => monitor.listeners.delete(l);
    },
    runNow: monitor.runNow,
  },
}));

import BloxStatusMonitor from '@/screens/Settings/BloxStatusMonitor';
import { useSettingsStore } from '@/stores';
import { renderRoute, resetSettingsStores } from './testUtils';

const routes = [{ path: '/settings/blox-status-monitor', element: <BloxStatusMonitor /> }];

describe('BloxStatusMonitor', () => {
  beforeEach(() => {
    resetSettingsStores();
    monitor.emit({ running: false, lastRunAt: null });
    monitor.runNow.mockClear();
  });

  it('offers the three intervals and writes the choice to the settings store (drives the monitor)', () => {
    renderRoute(routes, '/settings/blox-status-monitor');
    expect(screen.getByRole('radio', { name: 'Disabled' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Every 8 hours' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Every 24 hours' })).not.toBeChecked();
    expect(screen.getByText(/only run while this tab is open/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Every 8 hours' }));
    expect(useSettingsStore.getState().bloxStatusCheckInterval).toBe(480);
    expect(screen.getByRole('radio', { name: 'Every 8 hours' })).toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: 'Every 24 hours' }));
    expect(useSettingsStore.getState().bloxStatusCheckInterval).toBe(1440);
  });

  it('"Check now" runs a sweep and reflects the monitor state (running → last run)', async () => {
    renderRoute(routes, '/settings/blox-status-monitor');
    expect(screen.getByTestId('blox-status-last-run')).toHaveTextContent('No check has run yet');
    fireEvent.click(screen.getByTestId('blox-status-run-now'));
    expect(monitor.runNow).toHaveBeenCalledTimes(1);

    await act(async () => monitor.emit({ running: true }));
    expect(screen.getByTestId('blox-status-run-now')).toHaveTextContent('Checking…');

    await act(async () => monitor.emit({ running: false, lastRunAt: Date.UTC(2026, 0, 2, 3, 4) }));
    expect(screen.getByTestId('blox-status-last-run')).toHaveTextContent('Last check:');
    expect(screen.getByTestId('blox-status-run-now')).toHaveTextContent('Check now');
  });
});

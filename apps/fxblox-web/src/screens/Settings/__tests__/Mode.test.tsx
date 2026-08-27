import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const i18nMock = vi.hoisted(() => ({ changeLanguage: vi.fn(async () => true) }));
vi.mock('@/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/i18n')>()),
  changeLanguage: i18nMock.changeLanguage,
}));

import Mode from '@/screens/Settings/Mode';
import { isDebugModeActive, useSettingsStore } from '@/stores';
import { renderRoute, resetSettingsStores } from './testUtils';

const routes = [{ path: '/settings/mode', element: <Mode /> }];

describe('Mode', () => {
  beforeEach(() => {
    resetSettingsStores();
    i18nMock.changeLanguage.mockClear();
  });

  it('color scheme radios follow "Automatic dark mode" and write the store', () => {
    renderRoute(routes, '/settings/mode');
    const light = screen.getByRole('radio', { name: 'Light' });
    const dark = screen.getByRole('radio', { name: 'Dark' });
    // Auto is on by default → the radios are disabled.
    expect(light).toBeDisabled();
    expect(dark).toBeDisabled();
    expect(dark).toBeChecked();
    expect(screen.getByAltText('Light mode preview')).toBeInTheDocument();

    const auto = screen.getByRole('switch', { name: 'Automatic dark mode' });
    expect(auto).toBeChecked();
    fireEvent.click(auto);
    expect(useSettingsStore.getState().isAuto).toBe(false);
    expect(screen.getByRole('radio', { name: 'Light' })).toBeEnabled();

    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(useSettingsStore.getState().colorScheme).toBe('light');
  });

  it('language, debug mode and the web-only Prefer Bluetooth switch', () => {
    renderRoute(routes, '/settings/mode');
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: '中文 (Chinese)' }));
    expect(i18nMock.changeLanguage).toHaveBeenCalledWith('zh');

    const debug = screen.getByRole('switch', { name: 'Debug mode' });
    expect(debug).not.toBeChecked();
    fireEvent.click(debug);
    expect(isDebugModeActive(useSettingsStore.getState().debugMode)).toBe(true);

    const ble = screen.getByRole('switch', { name: 'Prefer Bluetooth' });
    expect(ble).not.toBeChecked();
    fireEvent.click(ble);
    expect(useSettingsStore.getState().preferBluetooth).toBe(true);
    expect(screen.getByRole('switch', { name: 'Prefer Bluetooth' })).toBeChecked();
  });
});

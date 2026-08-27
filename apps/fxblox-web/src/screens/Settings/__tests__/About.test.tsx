import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import About, { readStoragePersistence } from '@/screens/Settings/About';
import { renderRoute } from './testUtils';

const routes = [{ path: '/settings/about', element: <About /> }];

function stubPersisted(value: boolean | Error | undefined) {
  const storage =
    value === undefined
      ? undefined
      : {
          persist: async () => false,
          persisted: value instanceof Error ? async () => Promise.reject(value) : async () => value,
        };
  Object.defineProperty(navigator, 'storage', { configurable: true, value: storage });
}

describe('About', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist: async () => false, persisted: async () => false },
    });
    vi.restoreAllMocks();
  });

  it('renders the privacy text, the terms link, the version and a warning when storage is not persisted', async () => {
    stubPersisted(false);
    renderRoute(routes, '/settings/about');
    expect(screen.getByRole('heading', { name: 'Privacy' })).toBeInTheDocument();
    expect(
      screen.getByText(/FxBlox hardware is managed and used by the File Sync and Blox apps/),
    ).toBeInTheDocument();
    const link = screen.getByTestId('about-terms-link');
    expect(link).toHaveAttribute('href', 'https://fx.land/terms');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByTestId('app-version')).toHaveTextContent('App version 0.0.1-test #test');
    expect(await screen.findByTestId('about-storage-notPersisted')).toHaveTextContent(
      'has not granted persistent storage',
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows the persisted note when granted, and "unknown" when the API is missing or throws', async () => {
    stubPersisted(true);
    const { unmount } = renderRoute(routes, '/settings/about');
    expect(await screen.findByTestId('about-storage-persisted')).toBeInTheDocument();
    unmount();

    stubPersisted(undefined);
    expect(await readStoragePersistence()).toBe('unknown');
    stubPersisted(new Error('nope'));
    expect(await readStoragePersistence()).toBe('unknown');
  });
});

/**
 * Settings > About reported "This browser has not granted persistent storage…" and offered nothing to press.
 * Losing IndexedDB costs the user their identity, linked wallet and Blox list, so the state has to come with a
 * way to fix it — the same shape as the local-network-access affordance.
 *
 * Chrome grants `persist()` from engagement heuristics rather than by prompting, so a refusal is a normal
 * outcome and must read as "not yet", never as an error.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoragePersistenceCard } from '../StoragePersistenceCard';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';

const originalStorage = Object.getOwnPropertyDescriptor(navigator, 'storage');

function mockStorage(impl: Partial<StorageManager> | undefined) {
  Object.defineProperty(navigator, 'storage', { value: impl, configurable: true, writable: true });
}

afterEach(() => {
  if (originalStorage) Object.defineProperty(navigator, 'storage', originalStorage);
  vi.restoreAllMocks();
});

describe('StoragePersistenceCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('already persisted → reports it and shows no button', async () => {
    mockStorage({ persisted: vi.fn().mockResolvedValue(true), persist: vi.fn() } as unknown as StorageManager);
    renderWithProviders(<StoragePersistenceCard />);
    await screen.findByTestId('storage-persistence-persisted');
    expect(screen.queryByTestId('storage-persist-enable')).toBeNull();
  });

  it('not persisted → offers the button, and a grant flips the card without a reload', async () => {
    const persisted = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(false);
    const persist = vi.fn().mockResolvedValue(true);
    mockStorage({ persisted, persist } as unknown as StorageManager);

    renderWithProviders(<StoragePersistenceCard />);
    const button = await screen.findByTestId('storage-persist-enable');
    await userEvent.click(button);

    await screen.findByTestId('storage-persistence-persisted');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('storage-persist-enable')).toBeNull();
  });

  it('the browser declines silently → says so instead of leaving the button looking inert', async () => {
    mockStorage({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(false),
    } as unknown as StorageManager);

    renderWithProviders(<StoragePersistenceCard />);
    await userEvent.click(await screen.findByTestId('storage-persist-enable'));

    await screen.findByTestId('storage-persist-declined');
    // Still actionable: Chrome may grant it later as engagement grows.
    expect(screen.getByTestId('storage-persist-enable')).toBeInTheDocument();
  });

  it('no Storage API → unknown, and never claims the data is safe', async () => {
    mockStorage(undefined);
    renderWithProviders(<StoragePersistenceCard />);
    await screen.findByTestId('storage-persistence-unknown');
    expect(screen.queryByTestId('storage-persistence-persisted')).toBeNull();
  });

  it('banner variant is an action item: nothing at all once storage is durable', async () => {
    mockStorage({ persisted: vi.fn().mockResolvedValue(true), persist: vi.fn() } as unknown as StorageManager);
    const { container } = renderWithProviders(<StoragePersistenceCard variant="banner" />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid^="storage-persistence-"]')).toBeNull();
    });
  });

  it('banner variant shows the ask while the grant is missing', async () => {
    mockStorage({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(true),
    } as unknown as StorageManager);
    renderWithProviders(<StoragePersistenceCard variant="banner" />);
    await screen.findByTestId('storage-persist-enable');
  });

  it('a caller-supplied testIdPrefix is honoured (About keeps its original ids)', async () => {
    mockStorage({ persisted: vi.fn().mockResolvedValue(false), persist: vi.fn() } as unknown as StorageManager);
    renderWithProviders(<StoragePersistenceCard testIdPrefix="about-storage" />);
    await screen.findByTestId('about-storage-notPersisted');
  });

  it('a throwing Storage API is reported as unknown, not crashed on', async () => {
    mockStorage({
      persisted: vi.fn().mockRejectedValue(new Error('denied')),
      persist: vi.fn(),
    } as unknown as StorageManager);
    renderWithProviders(<StoragePersistenceCard />);
    await screen.findByTestId('storage-persistence-unknown');
  });
});

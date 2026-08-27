import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast, type UseToastHook } from '../src/overlays/toast/index.js';

function Harness({ onApi }: { onApi: (api: UseToastHook) => void }) {
  onApi(useToast());
  return null;
}

function setup() {
  let api!: UseToastHook;
  render(
    <ToastProvider>
      <Harness onApi={(a) => (api = a)} />
    </ToastProvider>,
  );
  return () => api;
}

/** The live region is always mounted; the toast element appears inside it. */
const region = () => screen.getByRole('status');
const toast = () => screen.queryByTestId('fx-toast');

describe('Toast queue semantics (provider ported verbatim)', () => {
  it('mounts a persistent aria-live region before any toast is shown', () => {
    setup();
    expect(region()).toHaveAttribute('aria-live', 'polite');
    expect(toast()).toBeNull();
  });

  it('queue → show → auto-hide → next', () => {
    vi.useFakeTimers();
    const api = setup();
    act(() => {
      api().queueToast({ title: 'A', message: 'first' });
      api().queueToast({ title: 'B' });
    });
    expect(region()).toHaveTextContent('A');
    expect(toast()).toHaveAttribute('data-visible', 'true');

    act(() => vi.advanceTimersByTime(5000)); // autoHideDuration default
    expect(region()).toHaveTextContent('B');
    expect(screen.queryByText('A')).toBeNull();

    act(() => vi.advanceTimersByTime(5000));
    act(() => vi.advanceTimersByTime(100)); // exit transition → unmount
    expect(toast()).toBeNull();
  });

  it('showToast jumps the queue and replaces the visible toast', () => {
    vi.useFakeTimers();
    const api = setup();
    act(() => {
      api().queueToast({ title: 'A' });
      api().queueToast({ title: 'B' });
    });
    act(() => api().showToast({ title: 'C' }));
    expect(region()).toHaveTextContent('C');
    // A was dropped (shift + unshift); B is still queued behind C.
    act(() => api().hideToast());
    expect(region()).toHaveTextContent('B');
  });

  it('each toast gets its own auto-hide timer (a toast shown late is not cut short)', () => {
    vi.useFakeTimers();
    const api = setup();
    act(() => api().queueToast({ title: 'A' }));
    act(() => vi.advanceTimersByTime(4000));
    act(() => api().showToast({ title: 'C' }));
    act(() => vi.advanceTimersByTime(1500)); // 5.5 s after A appeared, 1.5 s after C
    expect(region()).toHaveTextContent('C');
    act(() => vi.advanceTimersByTime(3500));
    act(() => vi.advanceTimersByTime(100));
    expect(toast()).toBeNull();
  });

  it('hideToast shows the next toast; clearToastQueue purges everything', () => {
    vi.useFakeTimers();
    const api = setup();
    act(() => {
      api().queueToast({ title: 'A' });
      api().queueToast({ title: 'B' });
      api().queueToast({ title: 'C' });
    });
    act(() => api().hideToast());
    expect(region()).toHaveTextContent('B');
    act(() => api().clearToastQueue());
    act(() => vi.advanceTimersByTime(100));
    expect(toast()).toBeNull();
  });

  it('autoHideDuration per toast and onShow callback', () => {
    vi.useFakeTimers();
    const onShow = vi.fn();
    const api = setup();
    act(() => api().queueToast({ title: 'A', autoHideDuration: 1000, onShow }));
    expect(onShow).toHaveBeenCalledWith(expect.objectContaining({ title: 'A' }));
    act(() => vi.advanceTimersByTime(999));
    expect(region()).toHaveTextContent('A');
    act(() => vi.advanceTimersByTime(1));
    act(() => vi.advanceTimersByTime(100));
    expect(toast()).toBeNull();
  });

  it('renders the type and a Dismiss button', () => {
    const api = setup();
    act(() => api().queueToast({ type: 'error', title: 'Oops', message: 'Failed' }));
    expect(toast()).toHaveAttribute('data-type', 'error');
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    act(() => screen.getByRole('button', { name: 'Dismiss' }).click());
    expect(toast()).toHaveAttribute('data-visible', 'false');
  });
});

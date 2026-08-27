import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FxSheet, type FxSheetMethods, useFxSheet } from '../src/overlays/index.js';
import { setMediaState } from './media.js';

function Inner() {
  const { close, inSheet } = useFxSheet();
  return (
    <button type="button" onClick={close}>
      inner close {String(inSheet)}
    </button>
  );
}

describe('FxSheet', () => {
  it('imperative present()/close() + onDismiss (desktop dialog)', async () => {
    setMediaState({ desktop: true });
    const ref = createRef<FxSheetMethods>();
    const onDismiss = vi.fn();
    render(
      <FxSheet ref={ref} title="Blox info" onDismiss={onDismiss}>
        <Inner />
      </FxSheet>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(ref.current?.isOpen()).toBe(false);

    act(() => ref.current!.present());
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('data-fx-sheet', 'dialog');
    expect(screen.getByText('Blox info')).toBeInTheDocument();
    expect(ref.current?.isOpen()).toBe(true);
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => ref.current!.close());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('useFxSheet().close() closes from inside; dismiss() is an alias of close()', async () => {
    setMediaState({ desktop: true });
    const user = userEvent.setup();
    const ref = createRef<FxSheetMethods>();
    render(
      <FxSheet ref={ref} title="T">
        <Inner />
      </FxSheet>,
    );
    act(() => ref.current!.present());
    await user.click(await screen.findByText('inner close true'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    act(() => ref.current!.present());
    await screen.findByRole('dialog');
    act(() => ref.current!.dismiss());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('controlled open/onOpenChange and desktopMode="side"', async () => {
    setMediaState({ desktop: true });
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <FxSheet open={false} onOpenChange={onOpenChange} title="Side" desktopMode="side">
        <span>body</span>
      </FxSheet>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(
      <FxSheet open onOpenChange={onOpenChange} title="Side" desktopMode="side">
        <span>body</span>
      </FxSheet>,
    );
    expect(await screen.findByRole('dialog')).toHaveAttribute('data-fx-sheet', 'side');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders a vaul drawer below 900px', async () => {
    setMediaState({ desktop: false });
    const ref = createRef<FxSheetMethods>();
    render(
      <FxSheet ref={ref} title="Drawer">
        <span>drawer body</span>
      </FxSheet>,
    );
    act(() => ref.current!.present());
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('data-fx-sheet', 'drawer');
    expect(screen.getByText('drawer body')).toBeInTheDocument();
  });

  it('Escape closes and restores focus to the opener (focus trap/restore by Radix)', async () => {
    setMediaState({ desktop: true });
    const user = userEvent.setup();
    const ref = createRef<FxSheetMethods>();
    render(
      <>
        <button type="button" onClick={() => ref.current?.present()}>
          open
        </button>
        <FxSheet ref={ref} title="T">
          <button type="button">inside</button>
        </FxSheet>
      </>,
    );
    const opener = screen.getByText('open');
    await user.click(opener);
    const dialog = await screen.findByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Radix FocusScope restores focus in a setTimeout(0) after unmount.
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });
});

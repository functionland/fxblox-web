import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FxConfirmProvider, useConfirm, type ConfirmApi } from '../src/overlays/index.js';

function Harness({ onApi }: { onApi: (api: ConfirmApi) => void }) {
  onApi(useConfirm());
  return null;
}

function setup() {
  let api!: ConfirmApi;
  render(
    <FxConfirmProvider>
      <Harness onApi={(a) => (api = a)} />
    </FxConfirmProvider>,
  );
  return () => api;
}

describe('useConfirm', () => {
  it('confirm() resolves true on OK', async () => {
    const user = userEvent.setup();
    const api = setup();
    let p!: Promise<boolean>;
    act(() => {
      p = api().confirm({ title: 'Reboot?', message: 'Takes a minute.' });
    });
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Reboot?');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await expect(p).resolves.toBe(true);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('confirm() resolves false on Cancel and on Escape', async () => {
    const user = userEvent.setup();
    const api = setup();
    let p!: Promise<boolean>;
    act(() => {
      p = api().confirm({ title: 'Delete?', destructive: true, confirmText: 'Delete' });
    });
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await expect(p).resolves.toBe(false);

    let q!: Promise<boolean>;
    act(() => {
      q = api().confirm({ title: 'Again?' });
    });
    await screen.findByRole('alertdialog');
    await user.keyboard('{Escape}');
    await expect(q).resolves.toBe(false);
  });

  it('alert() resolves when dismissed', async () => {
    const user = userEvent.setup();
    const api = setup();
    let p!: Promise<void>;
    act(() => {
      p = api().alert({ title: 'Saved', okText: 'Got it' });
    });
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    await expect(p).resolves.toBeUndefined();
  });

  it('choose() resolves the option value, or null on cancel', async () => {
    const user = userEvent.setup();
    const api = setup();
    let p!: Promise<'join' | 'leave' | null>;
    act(() => {
      p = api().choose({
        title: 'Pool',
        options: [
          { label: 'Join', value: 'join' as const },
          { label: 'Leave', value: 'leave' as const, destructive: true },
        ],
      });
    });
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    await expect(p).resolves.toBe('leave');

    let q!: Promise<number | null>;
    act(() => {
      q = api().choose({ title: 'Pick', options: [{ label: 'One', value: 1 }] });
    });
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await expect(q).resolves.toBeNull();
  });

  it('queues concurrent requests and settles each exactly once', async () => {
    const user = userEvent.setup();
    const api = setup();
    let a!: Promise<boolean>;
    let b!: Promise<boolean>;
    act(() => {
      a = api().confirm({ title: 'First' });
      b = api().confirm({ title: 'Second' });
    });
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('First');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await expect(a).resolves.toBe(true);
    // The Radix Action also emits onOpenChange(false); it must NOT cancel "Second".
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Second');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await expect(b).resolves.toBe(false);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('restores focus to the element that called confirm()', async () => {
    const user = userEvent.setup();
    let api!: ConfirmApi;
    let result: boolean | undefined;
    const Opener = () => {
      api = useConfirm();
      return (
        <button
          type="button"
          onClick={async () => {
            result = await api.confirm({ title: 'Sure?' });
          }}
        >
          ask
        </button>
      );
    };
    render(
      <FxConfirmProvider>
        <Opener />
      </FxConfirmProvider>,
    );
    const opener = screen.getByText('ask');
    await user.click(opener);
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(result).toBe(true));
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('throws outside the provider', () => {
    const Bad = () => {
      useConfirm();
      return null;
    };
    expect(() => render(<Bad />)).toThrow(/FxConfirmProvider/);
  });
});

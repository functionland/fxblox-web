import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FxCopyButton } from '../src/components/copy-button/FxCopyButton.js';

// fireEvent, not userEvent: userEvent.setup() installs its own clipboard stub over navigator.clipboard.
function mockClipboard() {
  const writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

describe('FxCopyButton', () => {
  it('copies even without an onCopied callback (regression: optional-call skipped the copy)', async () => {
    const writeText = mockClipboard();
    render(<FxCopyButton value="abc-123" label="Copy it" copiedLabel="Copied" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy it' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('abc-123'));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('reports the result to onCopied', async () => {
    const writeText = mockClipboard();
    const onCopied = vi.fn();
    render(<FxCopyButton value="x" label="Copy it" onCopied={onCopied} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy it' }));
    await waitFor(() => expect(onCopied).toHaveBeenCalledWith(true));
    expect(writeText).toHaveBeenCalledWith('x');
  });
});

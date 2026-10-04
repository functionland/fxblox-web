import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TestProviders } from '@/test/helpers/renderWithProviders';
import { CopyRow } from '@/components/main/CopyRow';

const SECRET = 'k3g5j-428r9-q57th-j9w5h';

describe('CopyRow secret', () => {
  // fireEvent, not userEvent: userEvent.setup() installs its own clipboard stub over navigator.clipboard.
  it('keeps the value out of the page until revealed, and Copy still copies the real value', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { container } = render(
      <TestProviders>
        <CopyRow label="Password" value={SECRET} secret revealLabel="Show password" hideLabel="Hide password" copyLabel="Copy password" />
      </TestProviders>,
    );
    expect(container.innerHTML).not.toContain(SECRET);

    fireEvent.click(screen.getByRole('button', { name: 'Copy password' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SECRET));
    expect(container.innerHTML).not.toContain(SECRET);

    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(screen.getByText(SECRET)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
    // still no title / data-value copies of the secret
    expect(container.querySelector('[data-value]')).toBeNull();
    expect(container.querySelector(`[title="${SECRET}"]`)).toBeNull();
  });

  it('a normal row keeps title / data-value as before', () => {
    const { container } = render(
      <TestProviders>
        <CopyRow label="Peer" value="12D3KooWabcdef" />
      </TestProviders>,
    );
    expect(container.querySelector('[data-value="12D3KooWabcdef"]')).not.toBeNull();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FxDropdown } from '../src/components/dropdown/FxDropdown.js';

const options = [
  { label: 'SKALE Europa', value: 2046399126 },
  { label: 'Base', value: 8453 },
  { label: 'Empty', value: '' },
];

describe('FxDropdown', () => {
  it('shows the selected label and reports (value, index) on selection', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <FxDropdown
        caption="Chain"
        options={options}
        selectedValue={2046399126}
        onValueChange={onValueChange}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Chain' });
    expect(trigger).toHaveTextContent('SKALE Europa');

    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'Base' }));
    expect(onValueChange).toHaveBeenCalledWith(8453, 1);
  });

  it('supports empty-string values (Radix forbids them natively)', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <FxDropdown
        caption="Chain"
        options={options}
        selectedValue={8453}
        onValueChange={onValueChange}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Empty' }));
    expect(onValueChange).toHaveBeenCalledWith('', 2);
  });

  it('keyboard: opens with Enter, ArrowDown moves, Enter selects', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <FxDropdown
        title="Chain"
        options={options}
        selectedValue={2046399126}
        onValueChange={onValueChange}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Chain' });
    trigger.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('listbox');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onValueChange).toHaveBeenCalledWith(8453, 1);
  });

  it('falls back to the first label when nothing is selected; error and disabled states', () => {
    const { rerender } = render(<FxDropdown caption="Chain" options={options} error />);
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('SKALE Europa');
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    rerender(<FxDropdown caption="Chain" options={options} disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});

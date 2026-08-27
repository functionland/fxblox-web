import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FxRadioButton, FxRadioButtonWithLabel } from '../src/components/radio-button/index.js';

describe('FxRadioButton.Group', () => {
  it('single value → Radix radiogroup; click and arrow keys map back to the original (number) values', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <FxRadioButton.Group value={1} onValueChange={onValueChange} aria-label="Chain">
        <FxRadioButtonWithLabel value={1} label="SKALE" />
        <FxRadioButtonWithLabel value={2} label="Base" />
        <FxRadioButtonWithLabel value={3} label="Other" disabled />
      </FxRadioButton.Group>,
    );
    expect(screen.getByRole('radiogroup', { name: 'Chain' })).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[1]).toHaveAttribute('aria-checked', 'false');
    expect(radios[2]).toBeDisabled();

    await user.click(radios[1]!);
    expect(onValueChange).toHaveBeenCalledWith(2);
    expect(typeof onValueChange.mock.calls[0]?.[0]).toBe('number');

    radios[0]!.focus();
    await user.keyboard('{ArrowDown}');
    expect(onValueChange).toHaveBeenLastCalledWith(2);
  });

  it('array value → checkboxes; toggles membership (handlePress ported verbatim)', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <FxRadioButton.Group value={['terms']} onValueChange={onValueChange} aria-label="Consent">
        <FxRadioButtonWithLabel value="terms" label="Terms" />
        <FxRadioButtonWithLabel value="privacy" label="Privacy" />
      </FxRadioButton.Group>,
    );
    expect(screen.getByRole('group', { name: 'Consent' })).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes[0]).toHaveAttribute('aria-checked', 'true');
    expect(boxes[1]).toHaveAttribute('aria-checked', 'false');

    await user.click(boxes[1]!);
    expect(onValueChange).toHaveBeenLastCalledWith(['terms', 'privacy']);
    await user.click(boxes[0]!);
    expect(onValueChange).toHaveBeenLastCalledWith([]);
  });

  it('standalone: status + onPress', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(<FxRadioButton value="x" status="checked" onPress={onPress} aria-label="Solo" />);
    const control = screen.getByRole('checkbox', { name: 'Solo' });
    expect(control).toHaveAttribute('aria-checked', 'true');
    await user.click(control);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('label click activates the control', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <FxRadioButton.Group value="a" onValueChange={onValueChange}>
        <FxRadioButtonWithLabel value="a" label="Alpha" />
        <FxRadioButtonWithLabel value="b" label="Beta" />
      </FxRadioButton.Group>,
    );
    await user.click(screen.getByText('Beta'));
    expect(onValueChange).toHaveBeenCalledWith('b');
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FxTextArea } from '../src/components/input/FxTextArea.js';
import { FxTextInput } from '../src/components/input/FxTextInput.js';

describe('FxTextInput', () => {
  it('caption labels the field; onChangeText receives the text', async () => {
    const user = userEvent.setup();
    const onChangeText = vi.fn();
    render(<FxTextInput caption="Blox name" onChangeText={onChangeText} />);
    const input = screen.getByLabelText('Blox name');
    await user.type(input, 'ab');
    expect(onChangeText).toHaveBeenLastCalledWith('ab');
  });

  it('secureTextEntry: password by default, reveal toggle flips the type', async () => {
    const user = userEvent.setup();
    render(<FxTextInput caption="Password" secureTextEntry defaultValue="hunter2" />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(input).toHaveAttribute('type', 'text');
    const hide = screen.getByRole('button', { name: 'Hide password' });
    expect(hide).toHaveAttribute('aria-pressed', 'true');
    await user.click(hide);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('error / errorMessage / disabled / mono / keyboardType', () => {
    render(
      <FxTextInput
        caption="Peer"
        error
        errorMessage="Required"
        mono
        keyboardType="numeric"
        disabled
      />,
    );
    const input = screen.getByLabelText('Peer');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toBeDisabled();
    expect(input.className).toContain('fx-input-mono');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
    expect(input).toHaveAttribute('aria-describedby', screen.getByRole('alert').id);
  });

  it('Enter triggers onSubmitEditing on single-line fields', async () => {
    const user = userEvent.setup();
    const onSubmitEditing = vi.fn();
    render(<FxTextInput caption="SSID" onSubmitEditing={onSubmitEditing} />);
    await user.type(screen.getByLabelText('SSID'), 'x{Enter}');
    expect(onSubmitEditing).toHaveBeenCalledTimes(1);
  });

  it('FxTextArea renders a textarea', () => {
    render(<FxTextArea caption="Notes" />);
    expect(screen.getByLabelText('Notes').tagName).toBe('TEXTAREA');
  });
});

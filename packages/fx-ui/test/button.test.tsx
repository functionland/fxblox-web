import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FxButton } from '../src/components/button/FxButton.js';
import { FxIconButton } from '../src/components/icon-button/FxIconButton.js';
import { FxPlusIcon } from '../src/icons/generated/FxPlusIcon.js';

describe('FxButton', () => {
  it('renders a real <button> and fires onPress', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(<FxButton onPress={onPress}>Go</FxButton>);
    const btn = screen.getByRole('button', { name: 'Go' });
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).toHaveAttribute('type', 'button');
    expect(btn.className).toContain('bg-green-base');
    await user.click(btn);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['inverted', 'border-primary'],
    ['pressed', 'bg-green-pressed'],
    ['destructive', 'bg-error-base'],
  ] as const)('variant %s applies its class map', (variant, cls) => {
    render(<FxButton variant={variant}>V</FxButton>);
    expect(screen.getByRole('button').className).toContain(cls);
  });

  it('sizes: defaults 40, large 60, small 32', () => {
    const { rerender } = render(<FxButton>S</FxButton>);
    expect(screen.getByRole('button').className).toContain('h-10');
    rerender(<FxButton size="large">S</FxButton>);
    expect(screen.getByRole('button').className).toContain('h-[60px]');
    rerender(<FxButton size="small">S</FxButton>);
    expect(screen.getByRole('button').className).toContain('h-8');
  });

  it('disabled: disabled look, no click', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(
      <FxButton disabled variant="destructive" onPress={onPress}>
        Nope
      </FxButton>,
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn.className).toContain('bg-background-secondary');
    await user.click(btn);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('loading: aria-busy, blocks clicks, shows a spinner, keeps the variant colours', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(
      <FxButton loading onPress={onPress}>
        Saving
      </FxButton>,
    );
    const btn = screen.getByRole('button', { name: /Saving/ });
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toBeDisabled();
    expect(btn.className).toContain('bg-green-base');
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    await user.click(btn);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('restyle props resolve to inline style; icon-only button keeps an accessible name', () => {
    render(<FxButton width={40} marginTop="16" aria-label="Add" icon={<FxPlusIcon />} />);
    const btn = screen.getByRole('button', { name: 'Add' });
    expect(btn.style.width).toBe('40px');
    expect(btn.style.marginTop).toBe('16px');
    expect(btn.querySelector('svg')).toHaveAttribute('fill', 'var(--fx-white)');
  });
});

describe('FxIconButton', () => {
  it('is a 40px target with a required aria-label', () => {
    render(<FxIconButton aria-label="Refresh" icon={<FxPlusIcon />} />);
    const btn = screen.getByRole('button', { name: 'Refresh' });
    expect(btn.style.width).toBe('40px');
    expect(btn.style.height).toBe('40px');
  });
});

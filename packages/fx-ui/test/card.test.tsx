import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FxCard } from '../src/components/card/FxCard.js';
import { FxIconButton } from '../src/components/icon-button/FxIconButton.js';
import { FxPlusIcon } from '../src/icons/generated/FxPlusIcon.js';

describe('FxCard', () => {
  it('is a static container without press handlers', () => {
    render(
      <FxCard testID="card">
        <FxCard.Title>Static</FxCard.Title>
      </FxCard>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('card').style.backgroundColor).toBe('var(--fx-background-primary)');
  });

  it('pressable: one hit-area button named by the title; nested controls stay independent', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    const onKebab = vi.fn();
    render(
      <FxCard onPress={onPress}>
        <FxCard.Title>Blox 1</FxCard.Title>
        <FxCard.Row>
          <FxCard.Row.Title>Status</FxCard.Row.Title>
          <FxCard.Row.Data>online</FxCard.Row.Data>
        </FxCard.Row>
        <FxIconButton aria-label="More" icon={<FxPlusIcon />} onPress={onKebab} />
      </FxCard>,
    );
    const hit = screen.getByRole('button', { name: 'Blox 1' });
    const kebab = screen.getByRole('button', { name: 'More' });
    expect(hit.contains(kebab)).toBe(false);
    expect(kebab.contains(hit)).toBe(false);

    await user.click(kebab);
    expect(onKebab).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();

    await user.click(hit);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('accessibilityLabel names the hit area; disabled blocks presses', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    render(
      <FxCard onPress={onPress} accessibilityLabel="Open device" disabled>
        <span>content</span>
      </FxCard>,
    );
    const hit = screen.getByRole('button', { name: 'Open device' });
    expect(hit).toBeDisabled();
    await user.click(hit);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('href renders a link hit area', () => {
    render(
      <FxCard href="/blox/1">
        <FxCard.Title>Go</FxCard.Title>
      </FxCard>,
    );
    expect(screen.getByRole('link', { name: 'Go' })).toHaveAttribute('href', '/blox/1');
  });
});

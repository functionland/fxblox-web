import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TestProviders } from '@/test/helpers/renderWithProviders';
import { UsageBar } from '@/components/UsageBar';

describe('UsageBar', () => {
  it('is a static two-tone progressbar sized by the division percent', () => {
    render(
      <TestProviders>
        <UsageBar divisionPercent={30} totalCapacity={2_000_000_000} />
      </TestProviders>,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '30');
    expect(bar).toHaveAttribute('aria-label', '30% of 2.00 GB used');
    expect(screen.getByTestId('usage-bar-used').style.width).toBe('30%');
  });

  it('clamps out-of-range / NaN values and sizes usage segments against the capacity', () => {
    render(
      <TestProviders>
        <UsageBar divisionPercent={Number.NaN} totalCapacity={1000} usages={[[], [{ usage: 500, color: 'red' }]]} />
      </TestProviders>,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    const free = screen.getByTestId('usage-bar-free');
    expect((free.firstElementChild as HTMLElement).style.width).toBe('50%');
  });
});

import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ThemeProvider, useColorScheme, useFxTheme } from '../src/theme/index.js';
import { setMediaState } from './media.js';

function Probe() {
  const t = useFxTheme();
  const scheme = useColorScheme();
  return (
    <span data-testid="probe">
      {t.mode}:{t.resolved}:{t.colors.backgroundApp}:{scheme}
    </span>
  );
}

const html = () => document.documentElement;
const metaColor = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content');

describe('ThemeProvider', () => {
  it('light: sets data-theme, color-scheme and <meta theme-color>', () => {
    render(
      <ThemeProvider mode="light">
        <Probe />
      </ThemeProvider>,
    );
    expect(html().dataset.theme).toBe('light');
    expect(metaColor()).toBe('#FFFFFF');
    expect(screen.getByTestId('probe')).toHaveTextContent('light:light:#FFFFFF');
  });

  it('dark: applies the dark palette', () => {
    render(
      <ThemeProvider mode="dark">
        <Probe />
      </ThemeProvider>,
    );
    expect(html().dataset.theme).toBe('dark');
    expect(metaColor()).toBe('#212529');
    expect(screen.getByTestId('probe')).toHaveTextContent('dark:dark:#212529');
  });

  it('auto: follows prefers-color-scheme live', () => {
    render(
      <ThemeProvider mode="auto">
        <Probe />
      </ThemeProvider>,
    );
    expect(html().dataset.theme).toBe('light');
    expect(screen.getByTestId('probe')).toHaveTextContent('auto:light:#FFFFFF:light');
    act(() => setMediaState({ dark: true }));
    expect(html().dataset.theme).toBe('dark');
    expect(metaColor()).toBe('#212529');
    expect(screen.getByTestId('probe')).toHaveTextContent('auto:dark:#212529:dark');
  });

  it('custom themeColor overrides the meta value', () => {
    render(<ThemeProvider mode="dark" themeColor={{ dark: '#000000' }} />);
    expect(metaColor()).toBe('#000000');
  });

  it('useFxTheme without a provider reads <html data-theme> (default dark)', () => {
    html().dataset.theme = 'light';
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('light:light:#FFFFFF');
    delete html().dataset.theme;
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useConsumeOnce } from '@/hooks/useConsumeOnce';

function Probe() {
  const scenario = useConsumeOnce('scenario');
  const { search, pathname } = useLocation();
  return (
    <div>
      <span data-testid="value">{scenario ?? 'null'}</span>
      <span data-testid="search">{search}</span>
      <span data-testid="pathname">{pathname}</span>
    </div>
  );
}

describe('useConsumeOnce', () => {
  it('returns the param once and strips it from the URL, keeping other params', async () => {
    render(
      <MemoryRouter initialEntries={['/blox-ai?scenario=disconnected&keep=1']}>
        <Routes>
          <Route path="/blox-ai" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('value')).toHaveTextContent('disconnected');
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('?keep=1'));
    expect(screen.getByTestId('search').textContent).not.toContain('scenario');
    expect(screen.getByTestId('pathname')).toHaveTextContent('/blox-ai');
    // The consumed value stays available to the screen after the strip.
    expect(screen.getByTestId('value')).toHaveTextContent('disconnected');
  });

  it('two consumers of different params converge (each keeps its value, both params are stripped)', async () => {
    function Two() {
      const a = useConsumeOnce('a');
      const b = useConsumeOnce('b');
      const { search } = useLocation();
      return (
        <div>
          <span data-testid="a">{a ?? 'null'}</span>
          <span data-testid="b">{b ?? 'null'}</span>
          <span data-testid="search">{search}</span>
        </div>
      );
    }
    render(
      <MemoryRouter initialEntries={['/x?a=1&b=2&keep=3']}>
        <Routes>
          <Route path="/x" element={<Two />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent(/^\?keep=3$/));
    expect(screen.getByTestId('a')).toHaveTextContent('1');
    expect(screen.getByTestId('b')).toHaveTextContent('2');
  });

  it('returns null when the param is absent and leaves the URL alone', async () => {
    render(
      <MemoryRouter initialEntries={['/blox-ai?keep=1']}>
        <Routes>
          <Route path="/blox-ai" element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('value')).toHaveTextContent('null');
    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('?keep=1'));
  });
});

/**
 * Regression guard for the render loop that made the app impossible to navigate away from the Blox dashboard.
 *
 * `useTasksLogic` derives its effect dependency (`generateTasks`) from the caller's `navigateToPools`. When a
 * caller passed an inline arrow (TasksCard did), that dependency changed on every render and the effect's
 * unconditional `setState` allocated a fresh state object each time — an endless render loop. It produced
 * identical DOM, so nothing looked wrong, but it starved React's low-priority work and route transitions never
 * committed: clicking any tab changed the URL while the screen stayed on Blox forever.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

const poolsState = vi.hoisted(() => ({ userIsMemberOfAnyPool: false, userActiveRequests: [] as string[] }));
vi.mock('@/hooks/usePoolsWithFallback', () => ({
  usePoolsWithFallback: () => poolsState,
}));
vi.mock('@/hooks/useWalletConnection', () => ({
  useWalletConnection: () => ({ connected: false, connectWallet: () => undefined }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { useTasksLogic } from '@/hooks/useTasksLogic';

function Probe() {
  const renders = useRef(0);
  renders.current += 1;
  // Deliberately unstable, exactly like the original TasksCard call site.
  const { tasks } = useTasksLogic({ navigateToPools: () => undefined });
  return (
    <div>
      <span data-testid="renders">{renders.current}</span>
      <span data-testid="tasks">{tasks.length}</span>
    </div>
  );
}

describe('useTasksLogic', () => {
  it('settles with an unstable navigateToPools instead of re-rendering forever', async () => {
    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId('tasks')).toHaveTextContent('2'));
    // Let any pending effect churn play out.
    await new Promise((r) => setTimeout(r, 150));
    const settled = Number(screen.getByTestId('renders').textContent);
    await new Promise((r) => setTimeout(r, 150));
    const later = Number(screen.getByTestId('renders').textContent);

    expect(later).toBe(settled);
    // A handful of renders is normal (mount + the first task computation); a loop shows up as dozens.
    expect(later).toBeLessThan(10);
  });
});

/**
 * Regression guards for the render loop that made the app impossible to navigate away from the Blox dashboard.
 *
 * `useTasksLogic` used to mirror its task list into state from an effect whose dependency followed the caller's
 * `navigateToPools`. When a caller passed an inline arrow (TasksCard did), that dependency changed on every
 * render and the effect's unconditional `setState` allocated a fresh state object each time — an endless render
 * loop. It produced identical DOM, so nothing looked wrong, but it starved React's low-priority work and route
 * transitions never committed: clicking any tab changed the URL while the screen stayed on Blox forever.
 *
 * The hook now derives the list during render, so an unstable caller can no longer loop it. These tests pin the
 * *behaviour* rather than the implementation: an unstable `navigateToPools` must settle, and the `route` a task
 * carries must always be the caller's current callback (a bail-out that keeps the previous state would hand back
 * a stale closure instead).
 */
import { render, screen, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolsState = vi.hoisted(() => ({ userIsMemberOfAnyPool: false, userActiveRequests: [] as string[] }));
const walletState = vi.hoisted(() => ({ connected: false, connectWallet: () => undefined }));
vi.mock('@/hooks/usePoolsWithFallback', () => ({
  usePoolsWithFallback: () => poolsState,
}));
vi.mock('@/hooks/useWalletConnection', () => ({
  useWalletConnection: () => walletState,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { useTasksLogic, type Task } from '@/hooks/useTasksLogic';

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

/** Presses the join-pool task on every render, so the click always runs the freshest `route`. */
function PressProbe({ navigateToPools }: { navigateToPools: () => void }) {
  const { tasks, handleTaskPress } = useTasksLogic({ navigateToPools });
  const joinPool = tasks.find((task: Task) => task.id === 'join-pool');
  return (
    <button type="button" data-testid="press" onClick={() => joinPool && handleTaskPress(joinPool)}>
      {joinPool?.route ? 'actionable' : 'inert'}
    </button>
  );
}

describe('useTasksLogic', () => {
  beforeEach(() => {
    poolsState.userIsMemberOfAnyPool = false;
    poolsState.userActiveRequests = [];
    walletState.connected = false;
  });

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

  it('routes to the caller current callback, not the one captured on the first render', async () => {
    walletState.connected = true;
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<PressProbe navigateToPools={first} />);

    await waitFor(() => expect(screen.getByTestId('press')).toHaveTextContent('actionable'));
    screen.getByTestId('press').click();
    expect(first).toHaveBeenCalledTimes(1);

    rerender(<PressProbe navigateToPools={second} />);
    screen.getByTestId('press').click();

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
  });
});

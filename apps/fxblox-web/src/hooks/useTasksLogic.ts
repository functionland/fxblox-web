// Ported from apps/box/src/hooks/useTasksLogic.ts — react-navigation → an injected `navigateToPools` callback
// (WS4 passes a memoised `() => navigate('/settings/pools')`).
//
// The tasks are DERIVED during render rather than mirrored into state by an effect. The mobile version kept them
// in state and refreshed them from a `useEffect`, which on the web produced an endless render loop: the effect
// depended on `generateTasks`, whose identity follows the caller's `navigateToPools`, so an inline arrow at the
// call site re-ran the effect on every render and its `setState` allocated a fresh object each time. The loop
// rendered identical DOM — invisible, and silent in a production build — but starved React's low-priority work,
// so route transitions never committed and the app could not navigate away from the Blox dashboard.
// Deriving with `useMemo` removes that failure mode by construction and also keeps `route` closures fresh.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePoolsWithFallback } from './usePoolsWithFallback';
import { useWalletConnection } from './useWalletConnection';
import { useWalletStatus } from './useWalletStatus';

export interface Task {
  id: string | number;
  title: string;
  route?: () => void;
  isCompleted: boolean;
  isPending?: boolean;
}

export interface UseTasksLogicOptions {
  navigateToPools?: () => void;
}

/** How long `refreshTasks` shows its spinner (the mobile timing). */
export const REFRESH_MS = 1000;

export const useTasksLogic = (options: UseTasksLogicOptions = {}) => {
  const { t } = useTranslation('tasks');
  const { userIsMemberOfAnyPool, userActiveRequests } = usePoolsWithFallback();
  const { connectWallet } = useWalletConnection();
  const { connected } = useWalletStatus();
  const navigateToPools = options.navigateToPools;

  const [loading, setLoadingState] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleNavigateToPools = useCallback(() => {
    navigateToPools?.();
  }, [navigateToPools]);

  const hasPendingRequest = !!userActiveRequests && userActiveRequests.length > 0 && userActiveRequests[0] !== '0';
  // A LIVE connection only. This item exists to get the user to a wallet they can transact with, and the item
  // right below it — joining a pool — is a transaction. A stored signature from the manual link path proves
  // someone controls an address; it cannot sign anything. Ticking this off on the strength of it told the user
  // they were ready when they were not, while Settings > Pools said "Disconnected". See useWalletStatus.
  const hasWallet = connected;

  const tasks = useMemo<Task[]>(
    () => [
      {
        id: 'connect-wallet',
        title: t('connectWallet'),
        route: hasWallet ? undefined : connectWallet,
        isCompleted: hasWallet,
      },
      {
        id: 'join-pool',
        title: hasPendingRequest ? t('joinPoolPending') : t('joinPool'),
        route: hasWallet && !userIsMemberOfAnyPool && !hasPendingRequest ? handleNavigateToPools : undefined,
        isCompleted: userIsMemberOfAnyPool,
        isPending: hasPendingRequest,
      },
    ],
    [t, hasWallet, userIsMemberOfAnyPool, hasPendingRequest, connectWallet, handleNavigateToPools],
  );

  const completedTasks = useMemo(
    () => tasks.filter((task) => task.isCompleted).map((task) => task.id),
    [tasks],
  );

  const handleTaskPress = useCallback((task: Task) => {
    if (task.route && !task.isCompleted) {
      task.route();
    }
  }, []);

  /**
   * The tasks re-derive themselves from their inputs, so a "refresh" only has to show the spinner for a moment —
   * there is nothing to recompute imperatively (and nothing that could capture stale values in the timer).
   */
  const refreshTasks = useCallback(() => {
    setRefreshing(true);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      setRefreshing(false);
    }, REFRESH_MS);
  }, []);

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  const setLoading = useCallback((next: boolean) => setLoadingState(next), []);

  return {
    tasks,
    completedTasks,
    loading,
    refreshing,
    handleTaskPress,
    refreshTasks,
    setLoading,
    hasCompletedTasks: completedTasks.length > 0,
    allTasksCompleted: tasks.length > 0 && completedTasks.length === tasks.length,
    pendingTasksCount: tasks.filter((task) => task.isPending).length,
  };
};

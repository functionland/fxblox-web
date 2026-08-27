// Ported from apps/box/src/hooks/useTasksLogic.ts — react-navigation → an injected `navigateToPools` callback
// (WS4 passes `() => navigate('/settings/pools')`).
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usePoolsWithFallback } from './usePoolsWithFallback';
import { useWalletConnection } from './useWalletConnection';
import { useUserProfileStore } from '@/stores/useUserProfileStore';

export interface Task {
  id: string | number;
  title: string;
  route?: () => void;
  isCompleted: boolean;
  isPending?: boolean;
}

export interface TasksState {
  tasks: Task[];
  completedTasks: (string | number)[];
  loading: boolean;
  refreshing: boolean;
}

export interface UseTasksLogicOptions {
  navigateToPools?: () => void;
}

/**
 * Compares the rendered meaning of two task lists. `route` is a closure whose identity changes on every render,
 * so only its presence is compared — the behaviour it encodes is captured by the other fields.
 */
function sameTasks(a: Task[], b: Task[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((task, i) => {
    const other = b[i];
    return (
      !!other &&
      task.id === other.id &&
      task.title === other.title &&
      task.isCompleted === other.isCompleted &&
      !!task.isPending === !!other.isPending &&
      !!task.route === !!other.route
    );
  });
}

export const useTasksLogic = (options: UseTasksLogicOptions = {}) => {
  const { t } = useTranslation('tasks');
  const { userIsMemberOfAnyPool, userActiveRequests } = usePoolsWithFallback();
  const { connected, connectWallet } = useWalletConnection();
  const manualSignatureWalletAddress = useUserProfileStore((state) => state.manualSignatureWalletAddress);
  const navigateToPools = options.navigateToPools;

  const [state, setState] = useState<TasksState>({ tasks: [], completedTasks: [], loading: false, refreshing: false });

  const handleNavigateToPools = useCallback(() => {
    navigateToPools?.();
  }, [navigateToPools]);

  const hasPendingRequest = !!userActiveRequests && userActiveRequests.length > 0 && userActiveRequests[0] !== '0';

  const hasWallet = connected || !!manualSignatureWalletAddress;

  const generateTasks = useCallback((): Task[] => {
    const tasks: Task[] = [
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
    ];
    return tasks;
  }, [t, hasWallet, userIsMemberOfAnyPool, hasPendingRequest, connectWallet, handleNavigateToPools]);

  useEffect(() => {
    const newTasks = generateTasks();
    const newCompletedTasks = newTasks.filter((task) => task.isCompleted).map((task) => task.id);
    // Bail out when nothing meaningful changed. `generateTasks` is only as stable as its dependencies, and a
    // caller that passes an inline `navigateToPools` (as TasksCard did) makes it change on every render — an
    // unconditional `setState` with a fresh object then re-renders forever. The loop renders identical output,
    // so it is invisible in the DOM, but it starves React's low-priority work: route transitions never commit
    // and the app gets stuck on this screen. Returning `prev` lets React skip the update entirely.
    setState((prev) => (sameTasks(prev.tasks, newTasks) ? prev : { ...prev, tasks: newTasks, completedTasks: newCompletedTasks }));
  }, [generateTasks]);

  const handleTaskPress = useCallback((task: Task) => {
    if (task.route && !task.isCompleted) {
      task.route();
    }
  }, []);

  const refreshTasks = useCallback(() => {
    setState((prev) => ({ ...prev, refreshing: true }));
    setTimeout(() => {
      const newTasks = generateTasks();
      const newCompletedTasks = newTasks.filter((task) => task.isCompleted).map((task) => task.id);
      setState((prev) => ({ ...prev, tasks: newTasks, completedTasks: newCompletedTasks, refreshing: false }));
    }, 1000);
  }, [generateTasks]);

  const setLoading = useCallback((loading: boolean) => {
    setState((prev) => ({ ...prev, loading }));
  }, []);

  return {
    ...state,
    handleTaskPress,
    refreshTasks,
    setLoading,
    hasCompletedTasks: state.completedTasks.length > 0,
    allTasksCompleted: state.tasks.length > 0 && state.completedTasks.length === state.tasks.length,
    pendingTasksCount: state.tasks.filter((task) => task.isPending).length,
  };
};

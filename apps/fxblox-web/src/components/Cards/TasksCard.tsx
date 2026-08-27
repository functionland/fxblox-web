/**
 * Port of apps/box/src/components/Cards/TasksCard.tsx — `useTasksLogic` with navigation injected (WS3 signature),
 * read-only multi-select radios (a disabled checkbox inside a pressable row, as on mobile). Must render inside a
 * `WalletGate` (the tasks hook reads the wallet connection).
 */
import { Fragment, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxCard,
  FxIconButton,
  FxLoadingSpinner,
  FxPressableOpacity,
  FxRadioButton,
  FxRadioButtonWithLabel,
  FxRefreshIcon,
  FxSpacer,
  cn,
} from '@functionland/fx-ui';
import { useNavigate } from 'react-router';
import { paths } from '@/app/paths';
import { useTasksLogic } from '@/hooks/useTasksLogic';

export interface TasksCardProps {
  className?: string;
  testID?: string;
}

const noop = () => undefined;

export function TasksCard({ className, testID = 'tasks-card' }: TasksCardProps) {
  const { t } = useTranslation('tasks');
  const { t: tMain } = useTranslation();
  const navigate = useNavigate();
  // Memoised so the hook's derived task list keeps its identity across renders. (This used to be load-bearing:
  // an inline arrow here re-ran the hook's effect every render and starved React's transitions — see
  // useTasksLogic. The hook no longer depends on it for correctness, only for memo hits.)
  const navigateToPools = useCallback(() => void navigate(paths.settings.pools), [navigate]);
  const { tasks, completedTasks, loading, refreshing, handleTaskPress, refreshTasks } = useTasksLogic({
    navigateToPools,
  });

  return (
    <FxCard className={className} testID={testID}>
      <FxBox flexDirection="row" justifyContent="space-between" alignItems="flex-start" gap="8">
        <FxCard.Title marginBottom="16">{t('actionList')}</FxCard.Title>
        {loading || refreshing ? (
          <FxLoadingSpinner width={20} height={20} />
        ) : (
          <FxIconButton
            aria-label={t('refreshTasks')}
            icon={<FxRefreshIcon />}
            color="content3"
            onPress={refreshTasks}
            testID={`${testID}-refresh`}
          />
        )}
      </FxBox>
      <FxBox flexDirection="column">
        <FxRadioButton.Group value={completedTasks} onValueChange={noop} aria-label={t('actionList')}>
          {tasks.map((task, index) => {
            const actionable = Boolean(task.route) && !task.isCompleted;
            return (
              <Fragment key={task.id}>
                <FxPressableOpacity
                  as="div"
                  onPress={() => handleTaskPress(task)}
                  disabled={!actionable}
                  aria-label={task.title}
                  aria-description={
                    task.isCompleted
                      ? t('taskCompleted')
                      : task.route
                        ? tMain('main.tasksCard.taskHint', { task: task.title.toLowerCase() })
                        : tMain('main.tasksCard.taskUnavailable')
                  }
                  className={cn('w-full rounded-fx-s text-left', actionable && 'hover:bg-background-secondary')}
                  testID={`${testID}-task-${task.id}`}
                  data-completed={task.isCompleted}
                >
                  <FxRadioButtonWithLabel disabled value={task.id} label={task.title} />
                </FxPressableOpacity>
                {index < tasks.length - 1 && <FxSpacer height={4} />}
              </Fragment>
            );
          })}
        </FxRadioButton.Group>
      </FxBox>
    </FxCard>
  );
}

export default TasksCard;

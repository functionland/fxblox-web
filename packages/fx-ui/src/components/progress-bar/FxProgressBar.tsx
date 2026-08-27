import * as Progress from '@radix-ui/react-progress';
import { FxBox, type FxBoxProps } from '../../primitives/FxBox.js';

export interface FxProgressBarProps extends Omit<FxBoxProps, 'children'> {
  progress: number;
  /** Track width (default: fills the parent). */
  width?: number | string;
  total?: number;
  height?: number;
  'aria-label'?: string;
}

/** Port of progressBar.tsx on Radix Progress (backgroundSecondary track, greenHover bar, 150 ms width tween). */
export function FxProgressBar({
  width,
  progress,
  height = 4,
  total = 100,
  'aria-label': ariaLabel = 'Progress',
  ...rest
}: FxProgressBarProps) {
  const clamped = Math.min(Math.max(0, progress), total);
  const pct = total > 0 ? (clamped / total) * 100 : 0;
  return (
    <FxBox
      as="div"
      flexDirection="row"
      alignItems="flex-start"
      backgroundColor="backgroundSecondary"
      width={width ?? '100%'}
      height={height}
      borderRadius="m"
      overflow="hidden"
      {...rest}
    >
      <Progress.Root
        value={clamped}
        max={total}
        aria-label={ariaLabel}
        className="fx-box w-full"
        style={{ height }}
      >
        <Progress.Indicator
          className="h-full rounded-fx-m bg-green-hover transition-[width] duration-150 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </Progress.Root>
    </FxBox>
  );
}

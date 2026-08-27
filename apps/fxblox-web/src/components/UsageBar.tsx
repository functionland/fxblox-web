/**
 * Port of apps/box/src/components/UsageBar.tsx as a STATIC two-tone bar (plan §WS4 "Shared": no drag / no
 * reanimated). `divisionPercent` is the used percentage (0–100); `usages` are optional coloured segments on either
 * side of the divider, sized as a fraction of `totalCapacity` exactly like `calculateLayoutWidth` did.
 */
import { useTranslation } from 'react-i18next';
import { cn, convertByteToCapacityUnit } from '@functionland/fx-ui';

export const USAGE_BAR_HEIGHT = 40;

export type UsageBarUsage = {
  usage: number;
  color: string;
};

export interface UsageBarProps {
  /** Percentage of the division (0–100). */
  divisionPercent: number;
  totalCapacity: number;
  usages?: [Array<UsageBarUsage>, Array<UsageBarUsage>];
  /** Accessible name; defaults to "<percent>% of <capacity> used". */
  label?: string;
  /** Mobile compat — the web bar is never editable. */
  isEditable?: boolean;
  className?: string;
  testID?: string;
}

const clampPercent = (v: number): number => (Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0);

export function UsageBar({
  divisionPercent,
  totalCapacity,
  usages = [[], []],
  label,
  className,
  testID = 'usage-bar',
}: UsageBarProps) {
  const { t } = useTranslation();
  const [usageFirst, usageSecond] = usages;
  const percent = clampPercent(divisionPercent);
  const rounded = Math.round(percent);
  const leftFraction = percent / 100;
  const rightFraction = 1 - leftFraction;
  const segmentWidth = (usage: number, sideFraction: number): string => {
    if (!totalCapacity || sideFraction <= 0) return '0%';
    return `${Math.min(100, ((usage / totalCapacity) / sideFraction) * 100)}%`;
  };
  const name = label ?? t('main.usageBar.label', { percent: rounded, capacity: convertByteToCapacityUnit(totalCapacity) });

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={rounded}
      aria-label={name}
      data-testid={testID}
      data-percent={rounded}
      className={cn('relative my-2 flex w-full overflow-hidden rounded-fx-s', className)}
      style={{ height: USAGE_BAR_HEIGHT }}
    >
      <div
        data-testid={`${testID}-used`}
        className="flex h-full flex-row overflow-hidden bg-green-pressed"
        style={{ width: `${percent}%` }}
      >
        {usageFirst.map((u, idx) => (
          <div key={idx} style={{ width: segmentWidth(u.usage, leftFraction), backgroundColor: u.color }} />
        ))}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 bottom-0 w-px bg-background-secondary"
        style={{ left: `${percent}%` }}
      />
      <div data-testid={`${testID}-free`} className="flex h-full flex-1 flex-row overflow-hidden bg-green-hover">
        {usageSecond.map((u, idx) => (
          <div key={idx} style={{ width: segmentWidth(u.usage, rightFraction), backgroundColor: u.color }} />
        ))}
      </div>
    </div>
  );
}

export default UsageBar;

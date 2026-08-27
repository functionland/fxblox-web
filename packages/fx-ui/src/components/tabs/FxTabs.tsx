import * as Tabs from '@radix-ui/react-tabs';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../../utils/cn.js';

export interface FxTabsProps {
  items: string[];
  selectedIdx?: number;
  onSelect: (idx: number) => void;
  animate?: boolean;
  /** ms (mobile default 150). */
  animationDuration?: number;
  /** `fixed`: equal-width tabs with a full underline; `auto`: content-width tabs. */
  variant?: 'fixed' | 'auto';
  'aria-label'?: string;
  className?: string;
  style?: CSSProperties;
  /** Optional panels — use `<FxTabs.Panel index={i}>` children for proper `aria-controls` wiring. */
  children?: ReactNode;
}

function FxTabsBase({
  items,
  selectedIdx = 0,
  onSelect,
  animate = true,
  animationDuration = 150,
  variant = 'fixed',
  className,
  style,
  children,
  ...aria
}: FxTabsProps) {
  const fixed = variant === 'fixed';
  return (
    <Tabs.Root
      value={String(selectedIdx)}
      onValueChange={(v) => {
        const idx = Number(v);
        if (idx !== selectedIdx) onSelect(idx);
      }}
      className={cn('fx-box', className)}
      style={style}
    >
      <Tabs.List {...aria} className={cn('flex flex-row', !fixed && 'gap-6')}>
        {items.map((item, idx) => (
          <Tabs.Trigger
            key={idx}
            value={String(idx)}
            className={cn(
              'fx-control-reset cursor-pointer border-b-2 text-content3 outline-none data-[state=active]:border-green-base data-[state=active]:text-green-base focus-visible:outline-2 focus-visible:outline-secondary',
              fixed
                ? 'flex-1 border-content3 py-4 text-center fx-text-bodySmallRegular active:bg-background-primary'
                : 'border-transparent py-2 fx-text-bodyMediumRegular active:text-border',
              animate && 'transition-colors motion-reduce:transition-none',
            )}
            style={animate ? { transitionDuration: `${animationDuration}ms` } : undefined}
          >
            {item}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {children}
    </Tabs.Root>
  );
}

export interface FxTabPanelProps {
  index: number;
  children?: ReactNode;
  className?: string;
  /** Keep mounted when inactive (default false). */
  forceMount?: true;
}

function FxTabPanel({ index, children, className, forceMount }: FxTabPanelProps) {
  return (
    <Tabs.Content
      value={String(index)}
      className={cn('outline-none', className)}
      forceMount={forceMount}
    >
      {children}
    </Tabs.Content>
  );
}

/** Port of tabs.tsx on Radix Tabs (roving focus, arrow keys). */
export const FxTabs = Object.assign(FxTabsBase, { Panel: FxTabPanel });

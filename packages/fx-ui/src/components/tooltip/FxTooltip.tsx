import * as Tooltip from '@radix-ui/react-tooltip';
import type { ReactElement, ReactNode } from 'react';

export interface FxTooltipProps {
  content: ReactNode;
  /** A single focusable child (the trigger); rendered `asChild`. */
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  delayDuration?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}

/** Radix Tooltip (hover + focus, Escape to dismiss). Never use it as the only label of a control. */
export function FxTooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  delayDuration = 300,
  open,
  defaultOpen,
  onOpenChange,
  disabled,
}: FxTooltipProps) {
  if (disabled) return children;
  return (
    <Tooltip.Provider delayDuration={delayDuration}>
      <Tooltip.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content side={side} align={align} sideOffset={6} className="fx-tooltip-content">
            {content}
            <Tooltip.Arrow className="fill-content1" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

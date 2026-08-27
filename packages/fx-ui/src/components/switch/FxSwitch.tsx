import * as Switch from '@radix-ui/react-switch';
import type { CSSProperties } from 'react';
import { mergeStyle, resolveStyleProps, type BoxStyleProps } from '../../primitives/styleProps.js';
import { cn } from '../../utils/cn.js';

export interface FxSwitchProps extends BoxStyleProps {
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  disabled?: boolean;
  /** Mobile restyle variant (visuals derive from state on web). */
  variant?: string;
  id?: string;
  name?: string;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  testID?: string;
}

/** Port of switch.tsx (40×20 track, 14px thumb) on Radix Switch (`role="switch"`, Space/Enter toggle). */
export function FxSwitch({
  value,
  onValueChange,
  disabled,
  variant: _variant,
  className,
  style,
  testID,
  ...rest
}: FxSwitchProps) {
  const { style: resolved, rest: html } = resolveStyleProps(rest);
  return (
    <Switch.Root
      checked={Boolean(value)}
      onCheckedChange={onValueChange}
      disabled={disabled}
      className={cn(
        'fx-control-reset relative inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full bg-border transition-colors duration-150 motion-reduce:transition-none',
        'data-[state=checked]:bg-green-base',
        'data-[disabled]:cursor-not-allowed data-[disabled]:bg-background-secondary',
        'data-[state=checked]:data-[disabled]:bg-green-base data-[state=checked]:data-[disabled]:opacity-50',
        'dark:data-[state=checked]:data-[disabled]:bg-green-border dark:data-[state=checked]:data-[disabled]:opacity-100',
        className,
      )}
      style={mergeStyle(resolved, style)}
      data-testid={testID}
      {...html}
    >
      <Switch.Thumb
        className={cn(
          'block size-[14px] translate-x-[3px] rounded-full bg-background-app shadow-fx transition-transform duration-150 motion-reduce:transition-none',
          'data-[state=checked]:translate-x-[23px]',
          'data-[disabled]:bg-background-primary',
          'dark:bg-content1 dark:data-[disabled]:bg-border',
        )}
      />
    </Switch.Root>
  );
}

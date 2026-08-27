import { cloneElement, type ReactElement } from 'react';
import type { FxSvgProps } from '../../icons/FxSvg.js';
import {
  FxPressableOpacity,
  type FxPressableOpacityProps,
} from '../../primitives/FxPressableOpacity.js';
import type { ColorToken } from '../../theme/tokens.js';
import { cn } from '../../utils/cn.js';
import { MIN_TOUCH_TARGET } from '../../utils/constants.js';
import { FxLoadingSpinner } from '../loading-spinner/FxLoadingSpinner.js';

export type FxIconButtonVariant = 'ghost' | 'filled' | 'inverted' | 'destructive' | 'subtle';

export interface FxIconButtonProps extends Omit<
  FxPressableOpacityProps,
  'children' | 'accessibilityLabel' | 'aria-label'
> {
  /** Required: icon-only controls must have an accessible name. */
  'aria-label': string;
  icon: ReactElement<FxSvgProps>;
  /** Hit target (default 40px). */
  size?: number;
  /** Rendered icon size (default 24px). */
  iconSize?: number;
  variant?: FxIconButtonVariant;
  /** Icon colour token (ghost default: content1). */
  color?: ColorToken;
  loading?: boolean;
  /** Toggle buttons: forwarded as `aria-pressed`. */
  pressed?: boolean;
}

const VARIANT_CLASS: Record<FxIconButtonVariant, string> = {
  ghost: 'bg-transparent',
  subtle: 'bg-background-secondary',
  filled: 'bg-green-base',
  inverted: 'bg-transparent border-2 border-primary',
  destructive: 'bg-error-base',
};

const VARIANT_ICON: Record<FxIconButtonVariant, ColorToken> = {
  ghost: 'content1',
  subtle: 'content1',
  filled: 'white',
  inverted: 'greenBase',
  destructive: 'white',
};

/** 40px icon-only button with a mandatory `aria-label`. */
export function FxIconButton({
  icon,
  size = MIN_TOUCH_TARGET,
  iconSize = 24,
  variant = 'ghost',
  color,
  loading,
  pressed,
  disabled,
  className,
  ...rest
}: FxIconButtonProps) {
  const iconColor = color ?? VARIANT_ICON[variant];
  return (
    <FxPressableOpacity
      alignItems="center"
      justifyContent="center"
      width={size}
      height={size}
      borderRadius="s"
      flexShrink={0}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-pressed={pressed}
      className={cn(
        'fx-hover-opacity',
        VARIANT_CLASS[variant],
        disabled && 'opacity-50',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <FxLoadingSpinner width={iconSize * 0.8} height={iconSize * 0.8} color={iconColor} />
      ) : (
        cloneElement(icon, {
          width: icon.props.width ?? iconSize,
          height: icon.props.height ?? iconSize,
          color: icon.props.color ?? iconColor,
        })
      )}
    </FxPressableOpacity>
  );
}

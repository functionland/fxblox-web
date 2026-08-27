import { cloneElement, type ReactElement, type ReactNode } from 'react';
import type { FxSvgProps } from '../../icons/FxSvg.js';
import {
  FxPressableOpacity,
  type FxPressableOpacityProps,
} from '../../primitives/FxPressableOpacity.js';
import { FxText } from '../../primitives/FxText.js';
import type { ColorToken, TextVariant } from '../../theme/tokens.js';
import { cn } from '../../utils/cn.js';
import { FxLoadingSpinner } from '../loading-spinner/FxLoadingSpinner.js';

/** theme.ts buttonVariants + `destructive` (PoolDetails uses it; undefined on mobile). */
export type FxButtonVariant = 'defaults' | 'inverted' | 'pressed' | 'disabled' | 'destructive';
/** theme.ts buttonSizes + `small` (JoinRequests). */
export type FxButtonSize = 'defaults' | 'large' | 'small';

export interface FxButtonProps extends Omit<FxPressableOpacityProps, 'children'> {
  variant?: FxButtonVariant;
  size?: FxButtonSize;
  /** Icon-only content (replaces the label). */
  icon?: ReactElement<FxSvgProps>;
  iconLeft?: ReactElement<FxSvgProps>;
  iconRight?: ReactElement<FxSvgProps>;
  /** Shows a spinner and blocks clicks (replaces the ActivityIndicator-in-button pattern). */
  loading?: boolean;
  children?: ReactNode;
}

const VARIANT_CLASS: Record<FxButtonVariant, string> = {
  defaults: 'bg-green-base active:bg-green-pressed',
  inverted: 'bg-transparent border-2 border-primary active:bg-green-background',
  pressed: 'bg-green-pressed',
  disabled: 'bg-background-secondary cursor-not-allowed',
  destructive: 'bg-error-base active:brightness-90',
};

const TEXT_COLOR: Record<FxButtonVariant, ColorToken> = {
  defaults: 'white',
  inverted: 'greenBase',
  pressed: 'white',
  disabled: 'border',
  destructive: 'white',
};

const SIZE_CLASS: Record<FxButtonSize, string> = {
  defaults: 'h-10 px-4',
  large: 'h-[60px] px-6',
  small: 'h-8 px-3',
};

const TEXT_VARIANT: Record<FxButtonSize, TextVariant> = {
  defaults: 'bodyXSSemibold',
  large: 'bodySmallSemibold',
  small: 'bodyXSSemibold',
};

/**
 * Port of button.tsx. `disabled` forces the `disabled` look; `loading` keeps the variant colours,
 * shows a spinner and sets `aria-busy` while blocking clicks. Accepts restyle props (`width={40}`, `marginTop="16"`, …).
 */
export function FxButton({
  children,
  disabled,
  loading,
  variant = 'defaults',
  size = 'defaults',
  icon,
  iconLeft,
  iconRight,
  className,
  ...rest
}: FxButtonProps) {
  const type: FxButtonVariant = disabled ? 'disabled' : variant;
  const textColor = TEXT_COLOR[type];

  const renderIcon = (el: ReactElement<FxSvgProps>) =>
    cloneElement(el, {
      width: el.props.width ?? 25,
      height: el.props.height ?? 25,
      color: el.props.color ?? textColor,
    });

  return (
    <FxPressableOpacity
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      alignItems="center"
      justifyContent="center"
      borderRadius="s"
      className={cn(
        'active:opacity-100 fx-hover-opacity select-none',
        VARIANT_CLASS[type],
        SIZE_CLASS[size],
        loading && 'cursor-progress',
        className,
      )}
      {...rest}
    >
      <span className="inline-flex flex-row items-center justify-center gap-2">
        {loading ? (
          <FxLoadingSpinner width={16} height={16} color={textColor} />
        ) : (
          iconLeft && renderIcon(iconLeft)
        )}
        {icon ? (
          loading ? null : (
            renderIcon(icon)
          )
        ) : (
          <FxText variant={TEXT_VARIANT[size]} color={textColor} textAlign="center" as="span">
            {children}
          </FxText>
        )}
        {iconRight && !loading && renderIcon(iconRight)}
      </span>
    </FxPressableOpacity>
  );
}

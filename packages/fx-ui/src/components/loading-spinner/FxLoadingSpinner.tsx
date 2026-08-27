import { FxLoadingSpinnerIcon } from '../../icons/generated/FxLoadingSpinnerIcon.js';
import type { FxSvgProps } from '../../icons/FxSvg.js';
import type { ColorToken } from '../../theme/tokens.js';
import { cn } from '../../utils/cn.js';

export interface FxLoadingSpinnerProps extends FxSvgProps {
  /** Accessible name (default "Loading"); pass `null` to make it decorative. */
  label?: string | null;
  className?: string;
}

/** Port of loadingSpinner.tsx: the spinner icon rotating every 750 ms (CSS `fx-spin`, paused under reduced motion). */
export function FxLoadingSpinner({
  label = 'Loading',
  className,
  ...props
}: FxLoadingSpinnerProps) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
      className={cn('inline-flex shrink-0 fx-spin', className)}
    >
      <FxLoadingSpinnerIcon color="primary" {...props} />
    </span>
  );
}

export interface FxSpinnerProps {
  /** RN ActivityIndicator sizes, or a px number. */
  size?: 'small' | 'large' | number;
  color?: ColorToken;
  label?: string | null;
  className?: string;
}

/** `ActivityIndicator` replacement (small = 20px, large = 36px). */
export function FxSpinner({ size = 'small', color = 'primary', label, className }: FxSpinnerProps) {
  const px = typeof size === 'number' ? size : size === 'large' ? 36 : 20;
  return (
    <FxLoadingSpinner width={px} height={px} color={color} label={label} className={className} />
  );
}

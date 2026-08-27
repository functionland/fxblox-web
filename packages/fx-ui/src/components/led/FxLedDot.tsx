import { useMemo, useRef, type CSSProperties } from 'react';
import { mergeStyle, resolveStyleProps, type SpacingProps } from '../../primitives/styleProps.js';
import { cn } from '../../utils/cn.js';
import { useResolvedColor, useWebAnimation } from './useWebAnimation.js';

export interface FxLedDotProps extends SpacingProps {
  /** CSS colour or theme token (FlashingCircle default `cyan`). */
  color?: string;
  /** ms fading in (default 1000). */
  onInterval?: number;
  /** ms fading out (default 1000); `0` → solid. */
  offInterval?: number;
  size?: number;
  /** Accessible name (e.g. "Blinking blue"); decorative when omitted. */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

/** Port of apps/box FlashingCircle (opacity 1→0 over `offInterval`, 0→1 over `onInterval`, looping). */
export function FxLedDot({
  color = 'cyan',
  onInterval = 1000,
  offInterval = 1000,
  size = 20,
  label,
  className,
  style,
  ...spacing
}: FxLedDotProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const resolvedColor = useResolvedColor(color);
  const { style: spacingStyle } = resolveStyleProps(spacing);
  const total = onInterval + offInterval;
  const keyframes = useMemo<Keyframe[] | null>(
    () =>
      offInterval > 0 && total > 0
        ? [
            { opacity: 1, offset: 0 },
            { opacity: 0, offset: offInterval / total },
            { opacity: 1, offset: 1 },
          ]
        : null,
    [offInterval, total],
  );
  useWebAnimation(ref, keyframes, { duration: total, iterations: Infinity, easing: 'linear' });

  return (
    <span
      ref={ref}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-led-color={color}
      className={cn('inline-block shrink-0', className)}
      style={mergeStyle(
        {
          width: size,
          height: size,
          borderRadius: size / 4,
          backgroundColor: resolvedColor,
          marginRight: 5,
          ...spacingStyle,
        },
        style,
      )}
    />
  );
}

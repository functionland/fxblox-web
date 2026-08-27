import { useMemo, useRef, type CSSProperties } from 'react';
import { cn } from '../../utils/cn.js';
import { useResolvedColor, useWebAnimation } from './useWebAnimation.js';

export interface FxTowerProps {
  onColor?: string;
  offColor?: string;
  /** ms transitioning off → on (default 1000). */
  onInterval?: number;
  /** ms transitioning on → off (default 1000). */
  offInterval?: number;
  width?: number;
  /** Body height (default 300). */
  height?: number;
  capHeight?: number;
  bodyColor?: string;
  label?: string;
  className?: string;
  style?: CSSProperties;
}

/** Port of apps/box FlashingTower: a tower whose top cap cross-fades between `offColor` and `onColor`. */
export function FxTower({
  onColor = 'lightblue',
  offColor = 'gray',
  onInterval = 1000,
  offInterval = 1000,
  width = 100,
  height = 300,
  capHeight = 20,
  bodyColor = 'gray',
  label,
  className,
  style,
}: FxTowerProps) {
  const capRef = useRef<HTMLDivElement>(null);
  const on = useResolvedColor(onColor);
  const off = useResolvedColor(offColor);
  const body = useResolvedColor(bodyColor);
  const total = onInterval + offInterval;
  const keyframes = useMemo<Keyframe[] | null>(
    () =>
      total > 0
        ? [
            { backgroundColor: off, offset: 0 },
            { backgroundColor: on, offset: onInterval / total },
            { backgroundColor: off, offset: 1 },
          ]
        : null,
    [on, off, onInterval, total],
  );
  useWebAnimation(capRef, keyframes, { duration: total, iterations: Infinity, easing: 'linear' });

  return (
    <div
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('fx-box items-center justify-start', className)}
      style={style}
    >
      <div
        ref={capRef}
        data-tower-cap
        style={{
          width,
          height: capHeight,
          borderTopLeftRadius: capHeight / 2,
          borderTopRightRadius: capHeight / 2,
          backgroundColor: off,
        }}
      />
      <div
        style={{
          width,
          height,
          backgroundColor: body,
          borderBottomLeftRadius: 5,
          borderBottomRightRadius: 5,
          marginTop: -5,
        }}
      />
    </div>
  );
}

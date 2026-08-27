import type { CSSProperties } from 'react';
import { toRadius, type RadiusValue } from '../../primitives/styleProps.js';
import { cn } from '../../utils/cn.js';

export interface FxSkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: RadiusValue;
  circle?: boolean;
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Shimmering placeholder block (decorative — wrap lists in FxListSkeleton for the live-region semantics). */
export function FxSkeleton({
  width = '100%',
  height = 16,
  radius = 's',
  circle,
  animate = true,
  className,
  style,
}: FxSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('fx-skeleton shrink-0', !animate && '[animation:none]', className)}
      style={{
        width,
        height: circle ? width : height,
        borderRadius: circle ? '9999px' : toRadius(radius),
        ...style,
      }}
    />
  );
}

export interface FxListSkeletonProps {
  rows?: number;
  /** Lines of text per row (default 2). */
  lines?: number;
  avatar?: boolean;
  /** Accessible name announced while loading. */
  label?: string;
  className?: string;
}

/** Replacement for the mobile `react-content-loader` List (`ContentLoader.tsx`). */
export function FxListSkeleton({
  rows = 3,
  lines = 2,
  avatar = true,
  label = 'Loading',
  className,
}: FxListSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      data-testid="content-loader"
      className={cn('fx-box gap-6 pt-4', className)}
    >
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex flex-row items-center gap-4">
          {avatar && <FxSkeleton width={40} circle />}
          <div className="fx-box flex-1 gap-2">
            {Array.from({ length: lines }, (_, l) => (
              <FxSkeleton key={l} height={12} width={l === lines - 1 ? '60%' : '100%'} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

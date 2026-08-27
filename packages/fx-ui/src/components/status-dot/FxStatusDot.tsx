import type { CSSProperties } from 'react';
import { mergeStyle, resolveStyleProps, type SpacingProps } from '../../primitives/styleProps.js';
import { colorVar, type ColorToken } from '../../theme/tokens.js';
import { cn } from '../../utils/cn.js';

/** Connection states used by CurrentBloxIndicator / Blox cards. */
export type FxStatus = 'connected' | 'checking' | 'disconnected' | 'warning' | 'unknown' | 'idle';

const STATUS_COLOR: Record<FxStatus, ColorToken> = {
  connected: 'successBase',
  checking: 'warningBase',
  disconnected: 'errorBase',
  warning: 'warningBase',
  unknown: 'content3',
  idle: 'content3',
};

export interface FxStatusDotProps extends SpacingProps {
  status?: FxStatus;
  /** Overrides the status colour. */
  color?: ColorToken;
  size?: number;
  /** Pulses (default: only for `checking`). */
  pulse?: boolean;
  /** Accessible name (default: the status word). Pass `null` for a decorative dot next to visible text. */
  label?: string | null;
  className?: string;
  style?: CSSProperties;
}

/** Coloured status dot with an accessible name. */
export function FxStatusDot({
  status = 'unknown',
  color,
  size = 8,
  pulse,
  label,
  className,
  style,
  ...spacing
}: FxStatusDotProps) {
  const { style: resolved } = resolveStyleProps(spacing);
  const shouldPulse = pulse ?? status === 'checking';
  const name = label === undefined ? status : label;
  return (
    <span
      role={name ? 'img' : undefined}
      aria-label={name ?? undefined}
      aria-hidden={name ? undefined : true}
      data-status={status}
      className={cn('inline-block shrink-0 rounded-full', shouldPulse && 'fx-pulse', className)}
      style={mergeStyle(
        {
          width: size,
          height: size,
          backgroundColor: colorVar(color ?? STATUS_COLOR[status]),
          ...resolved,
        },
        style,
      )}
    />
  );
}

import type { CSSProperties, Ref } from 'react';
import type React from 'react';
import { colorVar, type ColorToken } from '../theme/tokens.js';
import { mergeStyle, resolveStyleProps, type SpacingProps } from '../primitives/styleProps.js';

export interface FxSvgProps
  extends
    SpacingProps,
    Omit<React.SVGAttributes<SVGSVGElement>, 'color' | 'fill' | 'width' | 'height' | 'style'> {
  /** Theme colour token → `fill: var(--fx-…)`. Takes precedence over `fill`. */
  color?: ColorToken;
  /** Raw fill (any CSS colour). Default `currentColor`, so icons follow the text colour. */
  fill?: string;
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
  /** Icons are decorative unless given an accessible name. */
  'aria-label'?: string;
  title?: string;
  ref?: Ref<SVGSVGElement>;
  /** RN compat → click handler on the SVG (prefer FxIconButton for real controls). */
  onPress?: (e: React.MouseEvent<SVGSVGElement>) => void;
  testID?: string;
}

/**
 * Port of libs/component-library svg.tsx: `fill = color ? colors[color] : fill`.
 * Decorative by default (`aria-hidden`); pass `aria-label` (or `title`) to expose it.
 */
export function FxSvg({
  color,
  fill,
  width,
  height,
  style,
  title,
  onPress,
  onClick,
  children,
  testID,
  'aria-label': ariaLabel,
  ...props
}: FxSvgProps) {
  const { style: resolved, rest } = resolveStyleProps(props);
  const labelled = Boolean(ariaLabel || title);
  const handleClick = onPress ?? onClick;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      fill={color ? colorVar(color) : (fill ?? 'currentColor')}
      aria-hidden={labelled ? undefined : true}
      aria-label={ariaLabel}
      role={labelled ? 'img' : undefined}
      focusable="false"
      onClick={handleClick}
      style={mergeStyle({ flexShrink: 0, ...resolved }, style)}
      data-testid={testID}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

import { createElement, type CSSProperties, type ReactNode, type Ref } from 'react';
import type React from 'react';
import { textVariantClass, type TextVariant } from '../theme/tokens.js';
import { cn } from '../utils/cn.js';
import { mergeStyle, resolveStyleProps, type AllStyleProps } from './styleProps.js';

export type TextElementTag =
  | 'span'
  | 'p'
  | 'div'
  | 'label'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'strong'
  | 'em'
  | 'small'
  | 'code'
  | 'pre'
  | 'li'
  | 'dt'
  | 'dd'
  | 'legend';

export type NativeTextAttrs = Omit<
  React.HTMLAttributes<HTMLElement>,
  'color' | 'style' | 'className' | 'children'
> & { htmlFor?: string };

export interface FxTextProps extends AllStyleProps, NativeTextAttrs {
  /** theme.ts text variant (default: `body` = 16px, colour content1). */
  variant?: TextVariant;
  /** RN `numberOfLines` → CSS line clamp (1 → single-line ellipsis). */
  numberOfLines?: number;
  as?: TextElementTag;
  /** RN compat: `false` → `user-select: none`. */
  selectable?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
  testID?: string;
}

/**
 * RN `<Text>` replacement. Block-level unless nested in another FxText (mirrors RN nesting rules,
 * see `.fx-text` in theme.css). Colour defaults to `content1`; `variant` maps to `fx-text-*`.
 */
export function FxText({
  as = 'span',
  variant = 'body',
  numberOfLines,
  selectable,
  className,
  style,
  children,
  testID,
  ...props
}: FxTextProps) {
  const { style: resolved, rest } = resolveStyleProps(props);
  const clamp: CSSProperties | undefined =
    numberOfLines && numberOfLines > 0
      ? numberOfLines === 1
        ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
        : {
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: numberOfLines,
            overflow: 'hidden',
          }
      : undefined;
  const userSelect: CSSProperties | undefined =
    selectable === false ? { userSelect: 'none' } : undefined;
  const title =
    clamp && typeof children === 'string' && rest.title === undefined ? children : undefined;
  return createElement(
    as,
    {
      ...rest,
      title: title ?? rest.title,
      className: cn('fx-text', textVariantClass[variant], className),
      style: mergeStyle({ ...resolved, ...clamp, ...userSelect }, style),
      'data-testid': testID,
    },
    children,
  );
}

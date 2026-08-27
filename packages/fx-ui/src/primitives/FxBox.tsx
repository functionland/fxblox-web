import { createElement, type CSSProperties, type ReactNode, type Ref } from 'react';
import type React from 'react';
import { cn } from '../utils/cn.js';
import { mergeStyle, resolveStyleProps, type BoxStyleProps } from './styleProps.js';

export type BoxElementTag =
  | 'div'
  | 'section'
  | 'article'
  | 'aside'
  | 'header'
  | 'footer'
  | 'main'
  | 'nav'
  | 'ul'
  | 'ol'
  | 'li'
  | 'form'
  | 'fieldset'
  | 'label'
  | 'span';

export type NativeBoxAttrs = Omit<
  React.HTMLAttributes<HTMLElement>,
  'color' | 'style' | 'className' | 'children'
>;

export interface FxBoxProps extends BoxStyleProps, NativeBoxAttrs {
  as?: BoxElementTag;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
  /** RN compat → `data-testid`. */
  testID?: string;
}

/**
 * RN `<View>` replacement: a flex column `div` accepting restyle-style props
 * (`padding="16"`, `flexDirection="row"`, `backgroundColor="backgroundPrimary"`, …).
 */
export function FxBox({ as = 'div', className, style, children, testID, ...props }: FxBoxProps) {
  const { style: resolved, rest } = resolveStyleProps(props);
  return createElement(
    as,
    {
      ...rest,
      className: cn('fx-box', className),
      style: mergeStyle(resolved, style),
      'data-testid': testID,
    },
    children,
  );
}

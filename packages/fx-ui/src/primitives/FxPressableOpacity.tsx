import { createElement, type CSSProperties, type ReactNode, type Ref } from 'react';
import type React from 'react';
import { useLongPress } from '../hooks/useLongPress.js';
import { cn } from '../utils/cn.js';
import { mergeStyle, resolveStyleProps, type BoxStyleProps } from './styleProps.js';

export type PressableTag = 'button' | 'a' | 'div' | 'span' | 'li' | 'label';

type NativePressableAttrs = Omit<
  React.ButtonHTMLAttributes<HTMLElement> & React.AnchorHTMLAttributes<HTMLElement>,
  'color' | 'style' | 'className' | 'children' | 'onClick' | 'type' | 'disabled' | 'href'
>;

export interface FxPressableOpacityProps extends BoxStyleProps, NativePressableAttrs {
  /** RN `onPress` (alias of `onClick`). */
  onPress?: (e: React.MouseEvent<HTMLElement>) => void;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  /** Pointer long press (RN `onLongPress`). A subsequent click is swallowed. */
  onLongPress?: (e: React.PointerEvent<HTMLElement>) => void;
  delayLongPress?: number;
  onPressIn?: (e: React.PointerEvent<HTMLElement>) => void;
  onPressOut?: (e: React.PointerEvent<HTMLElement>) => void;
  disabled?: boolean;
  /** Renders an `<a>`. */
  href?: string;
  /** `button` (default), `a` (when `href`), or a non-interactive tag that gets role=button + keyboard handling. */
  as?: PressableTag;
  type?: 'button' | 'submit' | 'reset';
  /** RN compat (ignored on web — use padding for hit area). */
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
  /** RN compat → `aria-label`. */
  accessibilityLabel?: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  ref?: Ref<HTMLElement>;
  testID?: string;
}

/**
 * RN `<Pressable>` with the 0.5 pressed opacity. Renders a real `<button>` (or `<a>` with `href`),
 * so it is keyboard/screen-reader operable by default; `onPress` → click, `onLongPress` → pointer hold.
 */
export function FxPressableOpacity({
  onPress,
  onClick,
  onLongPress,
  delayLongPress,
  onPressIn,
  onPressOut,
  disabled,
  href,
  as,
  type = 'button',
  hitSlop: _hitSlop,
  accessibilityLabel,
  className,
  style,
  children,
  testID,
  ...props
}: FxPressableOpacityProps) {
  const { style: resolved, rest } = resolveStyleProps(props);
  const handlers = useLongPress<HTMLElement>(onLongPress, {
    delay: delayLongPress,
    disabled,
    onPress: (e) => {
      onPress?.(e);
      onClick?.(e);
    },
    onPressStart: onPressIn,
    onPressEnd: onPressOut,
  });

  const tag: PressableTag = href ? 'a' : (as ?? 'button');
  const isNative = tag === 'button' || tag === 'a';

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    rest.onKeyDown?.(e);
    if (isNative || disabled || e.defaultPrevented) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      (e.currentTarget as HTMLElement).click();
    }
  };

  const anchorDisabledClick = (e: React.MouseEvent<HTMLElement>) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    handlers.onClick(e);
  };

  const common = {
    ...rest,
    ...handlers,
    onClick: tag === 'a' ? anchorDisabledClick : handlers.onClick,
    onKeyDown,
    className: cn('fx-pressable', className),
    style: mergeStyle(resolved, style),
    'aria-label': accessibilityLabel ?? rest['aria-label'],
    'data-testid': testID,
  };

  if (tag === 'button') {
    return createElement('button', { ...common, type, disabled }, children);
  }
  if (tag === 'a') {
    return createElement(
      'a',
      {
        ...common,
        href: disabled ? undefined : href,
        'aria-disabled': disabled || undefined,
        tabIndex: disabled ? -1 : rest.tabIndex,
      },
      children,
    );
  }
  return createElement(
    tag,
    {
      ...common,
      role: rest.role ?? 'button',
      tabIndex: disabled ? -1 : (rest.tabIndex ?? 0),
      'aria-disabled': disabled || undefined,
    },
    children,
  );
}

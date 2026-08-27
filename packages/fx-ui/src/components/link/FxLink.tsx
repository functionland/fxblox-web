import { cloneElement, type ReactElement, type ReactNode } from 'react';
import type { FxSvgProps } from '../../icons/FxSvg.js';
import {
  FxPressableOpacity,
  type FxPressableOpacityProps,
} from '../../primitives/FxPressableOpacity.js';
import { FxText } from '../../primitives/FxText.js';
import type { ColorToken, TextVariant } from '../../theme/tokens.js';
import { cn } from '../../utils/cn.js';

export type FxLinkType = 'defaults' | 'disabled' | 'pressed';
export type FxLinkSize = 'defaults' | 'large';

export interface FxLinkProps extends Omit<FxPressableOpacityProps, 'children' | 'type'> {
  type?: FxLinkType;
  size?: FxLinkSize;
  icon?: ReactElement<FxSvgProps>;
  iconLeft?: ReactElement<FxSvgProps>;
  iconRight?: ReactElement<FxSvgProps>;
  children?: ReactNode;
}

const COLOR: Record<FxLinkType, ColorToken> = {
  defaults: 'greenBase',
  disabled: 'border',
  pressed: 'greenPressed',
};

const TEXT: Record<FxLinkSize, TextVariant> = {
  defaults: 'bodyXSSemibold',
  large: 'bodyMediumRegular',
};

/** Port of link.tsx — an `<a>` when `href` is given, otherwise a text button. */
export function FxLink({
  children,
  disabled,
  type,
  size = 'defaults',
  icon,
  iconLeft,
  iconRight,
  className,
  ...rest
}: FxLinkProps) {
  const _type: FxLinkType = disabled ? 'disabled' : (type ?? 'defaults');
  const color = COLOR[_type];
  const renderIcon = (el: ReactElement<FxSvgProps>) =>
    cloneElement(el, { color: el.props.color ?? color, width: 16, height: 16 });

  return (
    <FxPressableOpacity
      disabled={disabled}
      alignItems="center"
      alignSelf="center"
      justifyContent="center"
      minHeight={40}
      className={cn('active:opacity-100 active:text-green-pressed hover:underline', className)}
      {...rest}
    >
      <span className="inline-flex flex-row items-center justify-center gap-2">
        {iconLeft && renderIcon(iconLeft)}
        {icon ? (
          renderIcon(icon)
        ) : (
          <FxText
            variant={TEXT[size]}
            color={color}
            className={_type === 'defaults' ? 'active:text-green-pressed' : undefined}
          >
            {children}
          </FxText>
        )}
        {iconRight && renderIcon(iconRight)}
      </span>
    </FxPressableOpacity>
  );
}

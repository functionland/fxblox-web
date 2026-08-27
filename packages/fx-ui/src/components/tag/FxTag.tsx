import { cloneElement, type ReactElement, type ReactNode } from 'react';
import type { FxSvgProps } from '../../icons/FxSvg.js';
import { FxBox, type FxBoxProps } from '../../primitives/FxBox.js';
import { FxText } from '../../primitives/FxText.js';

export interface FxTagProps extends Omit<FxBoxProps, 'children'> {
  iconLeft?: ReactElement<FxSvgProps>;
  iconRight?: ReactElement<FxSvgProps>;
  children: ReactNode;
}

const renderIcon = (el: ReactElement<FxSvgProps>) =>
  cloneElement(el, {
    width: el.props.width ?? 14,
    height: el.props.height ?? 14,
    color: el.props.color ?? 'content1',
  });

/** Port of tag.tsx (26px pill, backgroundSecondary, bodyXXSRegular). */
export function FxTag({ iconLeft, iconRight, children, ...rest }: FxTagProps) {
  return (
    <FxBox
      as="span"
      backgroundColor="backgroundSecondary"
      borderRadius="m"
      height={26}
      justifyContent="center"
      paddingHorizontal="8"
      flexDirection="row"
      alignItems="center"
      gap="8"
      {...rest}
    >
      {iconLeft && renderIcon(iconLeft)}
      <FxText color="content1" variant="bodyXXSRegular" numberOfLines={1}>
        {children}
      </FxText>
      {iconRight && renderIcon(iconRight)}
    </FxBox>
  );
}

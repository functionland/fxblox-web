import { mergeStyle, resolveStyleProps, type SpacingProps, type SizeValue } from './styleProps.js';

export interface FxSpacerProps extends SpacingProps {
  width?: SizeValue;
  height?: SizeValue;
  className?: string;
}

/** Fixed-size gap (`<FxSpacer width={8} />`). Does not shrink inside flex rows. */
export function FxSpacer({ className, ...props }: FxSpacerProps) {
  const { style } = resolveStyleProps(props);
  return (
    <div aria-hidden="true" className={className} style={mergeStyle({ flexShrink: 0, ...style })} />
  );
}

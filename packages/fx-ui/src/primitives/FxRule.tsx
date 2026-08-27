import { FxBox, type FxBoxProps } from './FxBox.js';

export type FxRuleProps = Omit<FxBoxProps, 'as' | 'children'>;

/** 1px full-width divider (backgroundSecondary). */
export function FxHorizontalRule(props: FxRuleProps) {
  return (
    <FxBox
      role="separator"
      aria-orientation="horizontal"
      width="100%"
      height={1}
      flexShrink={0}
      backgroundColor="backgroundSecondary"
      {...props}
    />
  );
}

/** 1px full-height divider (backgroundSecondary). */
export function FxVerticalRule(props: FxRuleProps) {
  return (
    <FxBox
      role="separator"
      aria-orientation="vertical"
      width={1}
      height="100%"
      alignSelf="stretch"
      flexShrink={0}
      backgroundColor="backgroundSecondary"
      {...props}
    />
  );
}

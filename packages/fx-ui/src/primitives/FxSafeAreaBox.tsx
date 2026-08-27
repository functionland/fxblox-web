import type { CSSProperties } from 'react';
import { FxBox, type FxBoxProps } from './FxBox.js';

export type SafeAreaEdge = 'top' | 'bottom' | 'left' | 'right';

export interface FxSafeAreaBoxProps extends FxBoxProps {
  /** Which `env(safe-area-inset-*)` paddings to apply (default: all). */
  edges?: SafeAreaEdge[];
}

const ALL: SafeAreaEdge[] = ['top', 'bottom', 'left', 'right'];

/**
 * RN `SafeAreaView` replacement: adds `env(safe-area-inset-*)` padding (needs
 * `viewport-fit=cover` in the app's viewport meta). Any explicit padding on the same edge is added to the inset.
 */
export function FxSafeAreaBox({ edges = ALL, style, ...props }: FxSafeAreaBoxProps) {
  const insets: CSSProperties = {};
  for (const edge of edges) {
    const key = `padding${edge.charAt(0).toUpperCase()}${edge.slice(1)}` as
      'paddingTop' | 'paddingBottom' | 'paddingLeft' | 'paddingRight';
    const user = style?.[key];
    insets[key] =
      user === undefined
        ? `env(safe-area-inset-${edge}, 0px)`
        : `calc(${typeof user === 'number' ? `${user}px` : user} + env(safe-area-inset-${edge}, 0px))`;
  }
  return <FxBox {...props} style={{ ...style, ...insets }} />;
}

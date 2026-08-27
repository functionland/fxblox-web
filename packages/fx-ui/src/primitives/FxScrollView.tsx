import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../utils/cn.js';
import { FxBox, type FxBoxProps } from './FxBox.js';

export interface FxScrollViewProps extends Omit<FxBoxProps, 'children'> {
  horizontal?: boolean;
  /** Applied to the inner content wrapper (RN `contentContainerStyle`). */
  contentContainerStyle?: CSSProperties;
  contentContainerClassName?: string;
  /** RN compat (no-op on web). */
  keyboardShouldPersistTaps?: 'never' | 'always' | 'handled';
  showsVerticalScrollIndicator?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  children?: ReactNode;
}

/**
 * RN `ScrollView` / `KeyboardAwareScrollView` replacement: an `overflow:auto` flex child
 * (`flex:1; min-height:0`) with an inner content container. Browsers keep focused inputs in view
 * on their own, so no keyboard-avoidance logic is needed.
 */
export function FxScrollView({
  horizontal,
  contentContainerStyle,
  contentContainerClassName,
  keyboardShouldPersistTaps: _k,
  showsVerticalScrollIndicator: _v,
  showsHorizontalScrollIndicator: _h,
  className,
  style,
  children,
  ...props
}: FxScrollViewProps) {
  return (
    <FxBox
      flex={1}
      minHeight={0}
      className={cn(
        horizontal ? 'overflow-x-auto overflow-y-hidden' : 'overflow-y-auto overflow-x-hidden',
        className,
      )}
      style={
        {
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          ...style,
        } as CSSProperties
      }
      {...props}
    >
      <div
        className={cn('fx-box', horizontal ? 'flex-row' : 'flex-col', contentContainerClassName)}
        style={{ flexShrink: 0, ...contentContainerStyle }}
      >
        {children}
      </div>
    </FxBox>
  );
}

/** Mobile name kept so screens port verbatim. */
export const FxKeyboardAwareScrollView = FxScrollView;

import * as Collapsible from '@radix-ui/react-collapsible';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { mergeStyle, resolveStyleProps, type BoxStyleProps } from '../../primitives/styleProps.js';
import { cn } from '../../utils/cn.js';

export interface FxFoldableContentProps extends BoxStyleProps {
  header: ReactNode;
  onPress?: (expanded: boolean) => void;
  /** Mobile LayoutAnimation duration (CSS transition here). */
  animationDuration?: number;
  children: ReactNode;
  defaultExpanded?: boolean;
  expanded?: boolean;
  className?: string;
  style?: CSSProperties;
  headerClassName?: string;
  testID?: string;
}

/** Port of foldableContent.tsx on Radix Collapsible: the header is the toggle button (`aria-expanded`). */
export function FxFoldableContent({
  header,
  onPress,
  animationDuration: _d,
  children,
  defaultExpanded = false,
  expanded,
  className,
  style,
  headerClassName,
  testID,
  ...rest
}: FxFoldableContentProps) {
  const [internal, setInternal] = useState(defaultExpanded);
  const open = expanded ?? internal;
  const { style: resolved } = resolveStyleProps(rest);
  return (
    <Collapsible.Root
      open={open}
      onOpenChange={(next) => {
        if (expanded === undefined) setInternal(next);
        onPress?.(next);
      }}
      className={cn('fx-box', className)}
      style={mergeStyle(resolved, style)}
      data-testid={testID}
    >
      <Collapsible.Trigger asChild>
        <button
          type="button"
          className={cn(
            'fx-control-reset group flex w-full cursor-pointer flex-col text-left',
            headerClassName,
          )}
        >
          {header}
        </button>
      </Collapsible.Trigger>
      <Collapsible.Content className="fx-box">{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}

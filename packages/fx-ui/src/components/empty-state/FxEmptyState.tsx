import { cloneElement, type ReactElement, type ReactNode } from 'react';
import type { FxSvgProps } from '../../icons/FxSvg.js';
import { FxBox, type FxBoxProps } from '../../primitives/FxBox.js';
import { FxText } from '../../primitives/FxText.js';

export interface FxEmptyStateProps extends Omit<FxBoxProps, 'title' | 'children'> {
  icon?: ReactElement<FxSvgProps>;
  title: ReactNode;
  description?: ReactNode;
  /** Usually an FxButton. */
  action?: ReactNode;
  compact?: boolean;
}

/** Centered "nothing here yet" block (icon, title, description, optional action). */
export function FxEmptyState({
  icon,
  title,
  description,
  action,
  compact,
  ...rest
}: FxEmptyStateProps) {
  return (
    <FxBox
      alignItems="center"
      justifyContent="center"
      paddingVertical={compact ? '24' : '48'}
      paddingHorizontal="20"
      gap="12"
      {...rest}
    >
      {icon &&
        cloneElement(icon, {
          width: icon.props.width ?? 48,
          height: icon.props.height ?? 48,
          color: icon.props.color ?? 'content3',
        })}
      <FxText variant="bodyMediumRegular" color="content1" textAlign="center">
        {title}
      </FxText>
      {description && (
        <FxText variant="bodySmallRegular" color="content3" textAlign="center" maxWidth={420}>
          {description}
        </FxText>
      )}
      {action && <FxBox marginTop="8">{action}</FxBox>}
    </FxBox>
  );
}

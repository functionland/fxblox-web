import type { ReactNode } from 'react';
import { FxChevronLeftIcon } from '../../icons/generated/FxChevronLeftIcon.js';
import { FxBox, type FxBoxProps } from '../../primitives/FxBox.js';
import { FxText, type TextElementTag } from '../../primitives/FxText.js';
import { FxIconButton } from '../icon-button/FxIconButton.js';

export interface FxPageHeaderProps extends Omit<FxBoxProps, 'title' | 'children'> {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Renders a back button (chevron) on the left. */
  onBack?: () => void;
  backLabel?: string;
  /** Right-aligned controls (FxIconButton / FxButton). */
  actions?: ReactNode;
  /** Custom leading slot (replaces the back button). */
  leading?: ReactNode;
  titleAs?: TextElementTag;
}

/** Screen header: back button + title (+ subtitle) + actions. Renders a `<header>`. */
export function FxPageHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  actions,
  leading,
  titleAs = 'h1',
  ...rest
}: FxPageHeaderProps) {
  return (
    <FxBox
      as="header"
      flexDirection="row"
      alignItems="center"
      gap="8"
      paddingVertical="12"
      minHeight={56}
      {...rest}
    >
      {leading ??
        (onBack && (
          <FxIconButton
            aria-label={backLabel}
            icon={<FxChevronLeftIcon />}
            onPress={onBack}
            marginLeft={-8}
          />
        ))}
      <FxBox flex={1} minWidth={0}>
        <FxText as={titleAs} variant="h200" color="content1" numberOfLines={1}>
          {title}
        </FxText>
        {subtitle && (
          <FxText variant="bodyXSRegular" color="content3" numberOfLines={1}>
            {subtitle}
          </FxText>
        )}
      </FxBox>
      {actions && (
        <FxBox flexDirection="row" alignItems="center" gap="4">
          {actions}
        </FxBox>
      )}
    </FxBox>
  );
}

/**
 * Layout shell shared by the setup screens: a `<section data-screen="setup-<id>">` (the E2E smoke suite waits for
 * `[data-screen]`), an optional centred title/subtitle, then the screen body. The sticky actions live in the
 * SetupShell footer (see `SetupNav`).
 */
import type { ReactNode } from 'react';
import { FxBox, FxText, cn, type FxBoxProps } from '@functionland/fx-ui';

export interface SetupScreenProps extends Omit<FxBoxProps, 'title' | 'children'> {
  /** Slug appended to `setup-` for `data-screen` / `data-testid`. */
  id: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}

export function SetupScreen({
  id,
  title,
  subtitle,
  children,
  className,
  ...rest
}: SetupScreenProps) {
  return (
    <FxBox
      as="section"
      data-screen={`setup-${id}`}
      testID={`setup-${id}`}
      className={cn('flex flex-1 flex-col', className)}
      {...rest}
    >
      {title && (
        <FxText as="h1" variant="h300" color="content1" textAlign="center" marginBottom="8">
          {title}
        </FxText>
      )}
      {subtitle && (
        <FxText variant="bodySmallRegular" color="content2" textAlign="center" marginBottom="16">
          {subtitle}
        </FxText>
      )}
      {children}
    </FxBox>
  );
}

export default SetupScreen;

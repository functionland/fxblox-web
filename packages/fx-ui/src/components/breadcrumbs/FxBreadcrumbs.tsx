import type { ReactNode } from 'react';
import { FxChevronRightIcon } from '../../icons/generated/FxChevronRightIcon.js';
import { FxBox, type FxBoxProps } from '../../primitives/FxBox.js';
import { FxPressableOpacity } from '../../primitives/FxPressableOpacity.js';
import { FxText } from '../../primitives/FxText.js';

export interface FxBreadcrumbItem {
  label: ReactNode;
  onPress: (item: FxBreadcrumbItem) => void;
  href?: string;
}

export interface FxBreadcrumbsProps extends Omit<FxBoxProps, 'children'> {
  path: FxBreadcrumbItem[];
  'aria-label'?: string;
}

/** Port of breadcrumbs.tsx as `<nav><ol>` with `aria-current="page"` on the last crumb. */
export function FxBreadcrumbs({
  path,
  'aria-label': label = 'Breadcrumb',
  ...rest
}: FxBreadcrumbsProps) {
  return (
    <FxBox as="nav" aria-label={label} {...rest}>
      <ol className="m-0 flex list-none flex-row flex-wrap items-center p-0">
        {path.map((item, idx) => {
          const isLast = idx === path.length - 1;
          return (
            <li key={`crumb-${idx}`} className="flex flex-row items-center">
              <FxPressableOpacity
                onPress={() => item.onPress(item)}
                href={item.href}
                aria-current={isLast ? 'page' : undefined}
                alignItems="center"
                justifyContent="center"
                minHeight={40}
              >
                <FxText variant={isLast ? 'bodyXSSemibold' : 'bodyXSRegular'} color="content1">
                  {item.label}
                </FxText>
              </FxPressableOpacity>
              {!isLast && (
                <FxChevronRightIcon color="content1" width={16} height={16} marginHorizontal="4" />
              )}
            </li>
          );
        })}
      </ol>
    </FxBox>
  );
}

import * as Collapsible from '@radix-ui/react-collapsible';
import { useState, type ReactNode } from 'react';
import { FxChevronDownIcon } from '../../icons/generated/FxChevronDownIcon.js';
import { FxBox, type FxBoxProps } from '../../primitives/FxBox.js';
import { FxText, type FxTextProps } from '../../primitives/FxText.js';
import { cn } from '../../utils/cn.js';

export type FxTableProps = FxBoxProps;

function FxTableBase({ children, ...rest }: FxTableProps) {
  return (
    <FxBox role="table" {...rest}>
      {children}
    </FxBox>
  );
}

/** Port of table/header.tsx. */
function Header({ children, ...rest }: FxBoxProps) {
  return (
    <FxBox
      role="row"
      flexDirection="row"
      backgroundColor="backgroundSecondary"
      paddingHorizontal="12"
      paddingVertical="8"
      {...rest}
    >
      {children}
    </FxBox>
  );
}

export interface FxTableTitleProps extends FxTextProps {
  width?: number;
}

/** Port of table/title.tsx (column header, eyebrow2). */
function Title({ width, children, ...rest }: FxTableTitleProps) {
  return (
    <FxBox role="columnheader" flex={width ? undefined : 1} width={width}>
      {children && (
        <FxText variant="eyebrow2" color="content3" {...rest}>
          {children}
        </FxText>
      )}
    </FxBox>
  );
}

export interface FxTableRowProps extends Omit<FxBoxProps, 'children'> {
  children: ReactNode;
  showSeparator?: boolean;
}

/** Port of table/row.tsx Row. */
function Row({ children, showSeparator = true, ...rest }: FxTableRowProps) {
  return (
    <FxBox
      role="row"
      flexDirection="row"
      paddingHorizontal="12"
      paddingVertical="16"
      alignItems="center"
      borderBottomWidth={showSeparator ? 1 : 0}
      borderBottomColor="backgroundSecondary"
      {...rest}
    >
      {children}
    </FxBox>
  );
}

export interface FxTableRowGroupProps {
  firstRow: ReactNode;
  hiddenRow: ReactNode;
  iconWidth?: number;
  showSeparator?: boolean;
  defaultExpanded?: boolean;
  onToggle?: (expanded: boolean) => void;
  toggleLabel?: string;
}

/** Port of table/row.tsx RowGroup on Radix Collapsible (chevron rotates, background tints when open). */
function RowGroup({
  firstRow,
  hiddenRow,
  iconWidth = 32,
  showSeparator = true,
  defaultExpanded = false,
  onToggle,
  toggleLabel = 'Toggle details',
}: FxTableRowGroupProps) {
  const [open, setOpen] = useState(defaultExpanded);
  return (
    <Collapsible.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onToggle?.(next);
      }}
      className={cn(
        'fx-box transition-colors duration-300 motion-reduce:transition-none',
        open ? 'bg-background-primary' : 'bg-background-app',
        showSeparator && 'border-b border-background-secondary',
      )}
      role="rowgroup"
    >
      <Collapsible.Trigger asChild>
        <button
          type="button"
          aria-label={toggleLabel}
          className="fx-control-reset group flex w-full cursor-pointer flex-row items-center py-4 pr-3 text-left"
        >
          <span
            aria-hidden="true"
            className="flex items-center justify-center transition-transform duration-300 group-data-[state=open]:-rotate-180 motion-reduce:transition-none"
            style={{ width: iconWidth }}
          >
            <FxChevronDownIcon color="content1" width={10} height={10} />
          </span>
          <span className="w-3 shrink-0" />
          <span className="flex min-w-0 flex-1 flex-row items-center" role="row">
            {firstRow}
          </span>
        </button>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <FxBox
          role="row"
          flexDirection="row"
          marginRight="12"
          alignItems="center"
          paddingBottom="16"
          style={{ marginLeft: iconWidth + 12 }}
        >
          {hiddenRow}
        </FxBox>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

/** Port of table/cell.tsx. */
function Cell({ children, ...rest }: FxTextProps) {
  return (
    <FxBox role="cell" flex={1} minWidth={0}>
      <FxText color="content1" variant="bodyXSRegular" {...rest}>
        {children}
      </FxText>
    </FxBox>
  );
}

export const FxTable = Object.assign(FxTableBase, { Header, Title, Row, RowGroup, Cell });

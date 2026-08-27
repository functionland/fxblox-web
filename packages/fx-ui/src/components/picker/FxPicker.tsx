import {
  Children,
  isValidElement,
  useId,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import type React from 'react';
import { FxBox } from '../../primitives/FxBox.js';
import { FxText } from '../../primitives/FxText.js';
import { resolveStyleProps, type BoxStyleProps } from '../../primitives/styleProps.js';
import { cn } from '../../utils/cn.js';

export type PickerItemValue = string | number;

export interface FxPickerItemProps {
  label: string;
  value: PickerItemValue;
  enabled?: boolean;
}

/** `Picker.Item` → `<option>` (rendered by FxPicker; the component itself is a marker). */
export function FxPickerItem(_props: FxPickerItemProps): null {
  return null;
}

export interface FxPickerProps extends BoxStyleProps {
  selectedValue?: PickerItemValue;
  /** RN Picker signature `(value, index)`. */
  onValueChange?: (value: PickerItemValue, index: number) => void;
  enabled?: boolean;
  disabled?: boolean;
  caption?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
  className?: string;
  style?: CSSProperties;
  selectClassName?: string;
  testID?: string;
  /** `<FxPickerItem>` children. */
  children?: ReactNode;
  /** RN compat (no-op). */
  mode?: 'dialog' | 'dropdown';
}

/** Native `<select>` port of picker.tsx (styled like FxTextInput). Prefer FxDropdown for product UI. */
export function FxPicker({
  selectedValue,
  onValueChange,
  enabled,
  disabled,
  caption,
  id: idProp,
  name,
  'aria-label': ariaLabel,
  className,
  style,
  selectClassName,
  testID,
  children,
  mode: _mode,
  ...rest
}: FxPickerProps) {
  const reactId = useId();
  const id = idProp ?? `fx-picker-${reactId}`;
  const { style: wrapperStyle } = resolveStyleProps(rest);
  const items = Children.toArray(children).filter(
    (c): c is ReactElement<FxPickerItemProps> => isValidElement(c) && c.type === FxPickerItem,
  );
  const selectedIndex = items.findIndex((c) => c.props.value === selectedValue);
  const isDisabled = disabled || enabled === false;

  const onChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const index = e.target.selectedIndex;
    const item = items[index];
    if (item) onValueChange?.(item.props.value, index);
  };

  return (
    <FxBox className={className} style={{ ...wrapperStyle, ...style }}>
      {caption && (
        <FxText
          as="label"
          htmlFor={id}
          variant="bodySmallRegular"
          marginBottom="8"
          letterSpacing={0.2}
        >
          {caption}
        </FxText>
      )}
      <select
        id={id}
        name={name}
        aria-label={caption ? undefined : ariaLabel}
        value={selectedIndex >= 0 ? String(selectedIndex) : ''}
        onChange={onChange}
        disabled={isDisabled}
        className={cn('fx-input cursor-pointer appearance-none', selectClassName)}
        data-testid={testID}
      >
        {items.map((item, index) => (
          <option key={index} value={String(index)} disabled={item.props.enabled === false}>
            {item.props.label}
          </option>
        ))}
      </select>
    </FxBox>
  );
}

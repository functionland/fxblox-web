import * as Select from '@radix-ui/react-select';
import { useId, useState, type CSSProperties } from 'react';
import { FxChevronDownIcon } from '../../icons/generated/FxChevronDownIcon.js';
import { FxSelectIcon } from '../../icons/generated/FxSelectIcon.js';
import { FxBox } from '../../primitives/FxBox.js';
import { FxText } from '../../primitives/FxText.js';
import { resolveStyleProps, type BoxStyleProps } from '../../primitives/styleProps.js';
import { cn } from '../../utils/cn.js';
import { FxError } from '../error/FxError.js';

export type ItemValue = string | number;

export interface FxDropdownOption {
  label: string;
  value: ItemValue;
  disabled?: boolean;
}

export interface FxDropdownProps extends BoxStyleProps {
  options: FxDropdownOption[];
  selectedValue?: ItemValue;
  /** RN Picker signature: `(value, index)`. */
  onValueChange?: (value: ItemValue, index: number) => void;
  /** Mobile: bottom-sheet title. Web: accessible name of the trigger when there is no caption. */
  title?: string;
  caption?: string;
  error?: boolean;
  errorMessage?: string;
  disabled?: boolean;
  /** Mobile shows `options[0].label` when nothing is selected; pass a placeholder to show that instead. */
  placeholder?: string;
  onDismiss?: () => void;
  id?: string;
  name?: string;
  className?: string;
  style?: CSSProperties;
  testID?: string;
}

/**
 * Port of dropdown.tsx on Radix Select. Radix values must be non-empty strings, so items use their
 * index as the Radix value and `onValueChange` receives the original `{ value, index }`.
 */
export function FxDropdown({
  options,
  selectedValue,
  onValueChange,
  title,
  caption,
  error,
  errorMessage,
  disabled,
  placeholder,
  onDismiss,
  id: idProp,
  name,
  className,
  style,
  testID,
  ...rest
}: FxDropdownProps) {
  const reactId = useId();
  const id = idProp ?? `fx-dropdown-${reactId}`;
  const [open, setOpen] = useState(false);
  const { style: wrapperStyle } = resolveStyleProps(rest);
  const invalid = Boolean(error || errorMessage);
  const selectedIndex = options.findIndex((o) => o.value === selectedValue);
  const type = disabled ? 'disabled' : invalid ? 'error' : open ? 'pressed' : 'defaults';

  const triggerClass = {
    defaults: 'border-border text-content1',
    disabled: 'border-border bg-background-primary text-border cursor-not-allowed',
    pressed: 'border-green-pressed bg-background-primary text-content3',
    error: 'border-error-base text-content3',
  }[type];

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
      <Select.Root
        value={selectedIndex >= 0 ? String(selectedIndex) : ''}
        onValueChange={(next) => {
          const index = Number(next);
          const option = options[index];
          if (option) onValueChange?.(option.value, index);
        }}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) onDismiss?.();
        }}
        disabled={disabled}
        name={name}
      >
        <Select.Trigger
          id={id}
          aria-label={caption ? undefined : title}
          aria-invalid={invalid || undefined}
          className={cn(
            'fx-control-reset flex h-[52px] w-full cursor-pointer items-center justify-between gap-3 rounded-fx-s border px-5 text-left fx-text-bodySmallRegular outline-none',
            triggerClass,
          )}
          data-testid={testID}
        >
          <Select.Value placeholder={placeholder ?? options[0]?.label} />
          <Select.Icon asChild>
            <FxChevronDownIcon width={20} height={20} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content position="popper" sideOffset={4} className="fx-select-content">
            <Select.Viewport className="py-1">
              {options.map((option, index) => (
                <Select.Item
                  key={`${index}-${String(option.value)}`}
                  value={String(index)}
                  disabled={option.disabled}
                  className="fx-select-item"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator>
                    <FxSelectIcon width={20} height={20} color="greenBase" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      {errorMessage && <FxError error={errorMessage} />}
    </FxBox>
  );
}

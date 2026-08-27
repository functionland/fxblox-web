import * as Checkbox from '@radix-ui/react-checkbox';
import * as RadioGroup from '@radix-ui/react-radio-group';
import { useEffect, type CSSProperties } from 'react';
import { FxCheckIcon } from '../../icons/generated/FxCheckIcon.js';
import { mergeStyle, resolveStyleProps, type BoxStyleProps } from '../../primitives/styleProps.js';
import { cn } from '../../utils/cn.js';
import { useRadioButtonContext, type ValueType } from './RadioButtonGroup.js';
import { handlePress, isChecked } from './utils.js';

export interface RadioButtonProps extends BoxStyleProps {
  /** Value of the radio button. */
  value: ValueType;
  /** Status when used outside a Group. */
  status?: 'checked' | 'unchecked';
  disabled?: boolean;
  /** Executed on press when used outside a Group. */
  onPress?: () => void;
  /** Mobile restyle variant (visuals are derived from state on web). */
  variant?: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  testID?: string;
}

const CONTROL =
  'fx-control-reset inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full p-[3px] disabled:cursor-not-allowed data-[disabled]:cursor-not-allowed';

/**
 * Port of RadioButton.tsx. Inside a Group: Radix RadioGroup.Item (scalar value) or Radix Checkbox
 * (array value). Standalone (`status` + `onPress`): a `role="checkbox"` toggle button.
 */
export function RadioButton({
  disabled,
  onPress,
  value,
  status,
  variant: _variant,
  className,
  style,
  testID,
  ...rest
}: RadioButtonProps) {
  const { value: contextValue, onValueChange, inGroup, registry } = useRadioButtonContext();
  const ctxValue = inGroup ? contextValue : undefined;
  const checked = isChecked({ contextValue: ctxValue, status, value }) === 'checked';
  const isMultiSelect = inGroup && typeof contextValue === 'object';
  const key = String(value);
  const { style: resolved, rest: html } = resolveStyleProps(rest);
  const mergedStyle = mergeStyle(resolved, style);

  useEffect(() => {
    if (!inGroup || isMultiSelect) return;
    registry.set(key, value);
    return () => {
      registry.delete(key);
    };
  }, [inGroup, isMultiSelect, registry, key, value]);

  const radioVisual = (
    <span
      aria-hidden="true"
      className={cn(
        'block size-[18px] rounded-full border border-border bg-transparent transition-[border-width,border-color,background-color] duration-200 motion-reduce:transition-none',
        checked && 'border-[6px] border-green-base bg-background-app',
        disabled && !checked && 'bg-background-secondary',
        disabled && checked && 'opacity-50 dark:opacity-100 dark:border-green-border',
      )}
    />
  );

  const checkboxVisual = (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-5 items-center justify-center overflow-visible rounded-[4px] border border-border transition-colors duration-150 motion-reduce:transition-none',
        checked && 'border-green-base bg-green-base text-background-app dark:text-content1',
        disabled && !checked && 'bg-background-secondary',
        disabled &&
          checked &&
          'opacity-50 dark:opacity-100 dark:border-green-border dark:bg-green-border',
      )}
    >
      {checked && <FxCheckIcon width={32} height={32} className="shrink-0" />}
    </span>
  );

  if (!inGroup) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => handlePress({ onPress, value })}
        className={cn(CONTROL, className)}
        style={mergedStyle}
        data-testid={testID}
        {...html}
      >
        {radioVisual}
      </button>
    );
  }

  if (isMultiSelect) {
    return (
      <Checkbox.Root
        checked={checked}
        disabled={disabled}
        onCheckedChange={() => handlePress({ onPress, onValueChange, value, contextValue })}
        className={cn(CONTROL, 'rounded-fx-s', className)}
        style={mergedStyle}
        data-testid={testID}
        {...html}
      >
        {checkboxVisual}
      </Checkbox.Root>
    );
  }

  return (
    <RadioGroup.Item
      value={key}
      disabled={disabled}
      className={cn(CONTROL, className)}
      style={mergedStyle}
      data-testid={testID}
      {...html}
    >
      {radioVisual}
    </RadioGroup.Item>
  );
}

RadioButton.displayName = 'RadioButton';

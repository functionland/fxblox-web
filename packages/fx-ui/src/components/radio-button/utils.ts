/* Verbatim port of libs/component-library/src/lib/radio-button/utils.ts (types only adjusted). */
import type { RadioButtonContextType, ValueType } from './RadioButtonGroup.js';

export const handlePress = ({
  onPress,
  value,
  onValueChange,
  contextValue,
}: {
  onPress?: () => void;
  value: ValueType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onValueChange?: (value: any) => void;
  contextValue?: RadioButtonContextType<ValueType>['value'];
}) => {
  if (onPress && onValueChange) {
    console.warn(
      `onPress in the scope of RadioButtonGroup will not be executed, use onValueChange instead`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- verbatim mobile logic
  !onValueChange
    ? onPress?.()
    : typeof contextValue === 'object'
      ? contextValue.find((v) => v === value)
        ? onValueChange(contextValue.filter((v) => v !== value))
        : onValueChange([...contextValue, value])
      : onValueChange(value);
};

export const isChecked = ({
  value,
  status,
  contextValue,
}: {
  value: ValueType;
  status?: 'checked' | 'unchecked';
  contextValue?: RadioButtonContextType<ValueType>['value'];
}) => {
  if (contextValue !== undefined && contextValue !== null) {
    return contextValue === value ||
      (typeof contextValue === 'object' && contextValue.find((v) => v === value))
      ? 'checked'
      : 'unchecked';
  } else {
    return status;
  }
};

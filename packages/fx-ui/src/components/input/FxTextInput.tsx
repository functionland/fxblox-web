import { createElement, useId, useState, type CSSProperties, type Ref } from 'react';
import type React from 'react';
import { FxEyeIcon, FxEyeOffIcon } from '../../icons/extra/FxEyeIcon.js';
import { FxBox } from '../../primitives/FxBox.js';
import { FxText } from '../../primitives/FxText.js';
import { resolveStyleProps, type BoxStyleProps } from '../../primitives/styleProps.js';
import { cn } from '../../utils/cn.js';
import { FxError } from '../error/FxError.js';
import { FxIconButton } from '../icon-button/FxIconButton.js';

type NativeInputAttrs = Omit<
  React.InputHTMLAttributes<HTMLInputElement> & React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  | 'color'
  | 'style'
  | 'className'
  | 'size'
  | 'onChange'
  | 'height'
  | 'width'
  | 'value'
  | 'defaultValue'
  | 'type'
  | 'autoCorrect'
>;

/** RN `keyboardType` → HTML `inputMode`. */
export type KeyboardType =
  'default' | 'numeric' | 'number-pad' | 'decimal-pad' | 'email-address' | 'phone-pad' | 'url';

const KEYBOARD_INPUT_MODE: Record<KeyboardType, React.HTMLAttributes<HTMLElement>['inputMode']> = {
  default: undefined,
  numeric: 'numeric',
  'number-pad': 'numeric',
  'decimal-pad': 'decimal',
  'email-address': 'email',
  'phone-pad': 'tel',
  url: 'url',
};

export interface FxTextInputProps extends BoxStyleProps, NativeInputAttrs {
  /** Label rendered above the field (bodySmallRegular). */
  caption?: string;
  error?: boolean;
  /** Inline error message (renders FxError, wired via aria-describedby). */
  errorMessage?: string;
  disabled?: boolean;
  /** Password field with a show/hide toggle. */
  secureTextEntry?: boolean;
  /** Monospace (peer ids, hashes, tokens). */
  mono?: boolean;
  value?: string;
  defaultValue?: string;
  /** RN `onChangeText`. */
  onChangeText?: (text: string) => void;
  onChange?: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  /** Enter (single-line) → RN `onSubmitEditing`. */
  onSubmitEditing?: () => void;
  keyboardType?: KeyboardType;
  /** RN compat (`editable={false}` → readOnly). */
  editable?: boolean;
  multiline?: boolean;
  /** Visible rows for `multiline`. */
  numberOfLines?: number;
  /** HTML input `type` (ignored when `secureTextEntry`/`multiline`). */
  type?: React.HTMLInputTypeAttribute;
  /** RN compat (no-op on web). */
  isBottomSheetInput?: boolean;
  autoCorrect?: boolean;
  /** Classes / styles for the field itself (restyle props go to the wrapper). */
  inputClassName?: string;
  inputStyle?: CSSProperties;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLInputElement | HTMLTextAreaElement>;
  testID?: string;
  showPasswordLabel?: string;
  hidePasswordLabel?: string;
}

/**
 * Port of input.tsx (52px field, caption, error/disabled/active states, password reveal).
 * Restyle props (`marginTop="16"`, `flex={1}`) size the wrapper; the field is always full-width inside it.
 */
export function FxTextInput({
  caption,
  error,
  errorMessage,
  disabled,
  secureTextEntry,
  mono,
  value,
  defaultValue,
  onChangeText,
  onChange,
  onSubmitEditing,
  onKeyDown,
  keyboardType,
  editable,
  multiline,
  numberOfLines,
  type,
  isBottomSheetInput: _sheet,
  autoCorrect,
  inputClassName,
  inputStyle,
  className,
  style,
  id: idProp,
  inputMode,
  readOnly,
  testID,
  showPasswordLabel = 'Show password',
  hidePasswordLabel = 'Hide password',
  ...props
}: FxTextInputProps) {
  const reactId = useId();
  const id = idProp ?? `fx-input-${reactId}`;
  const errorId = `${id}-error`;
  const [showPassword, setShowPassword] = useState(false);
  const { style: wrapperStyle, rest } = resolveStyleProps(props);
  const invalid = Boolean(error || errorMessage);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChangeText?.(e.target.value);
    onChange?.(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onKeyDown?.(e as never);
    if (!multiline && e.key === 'Enter' && !e.defaultPrevented) onSubmitEditing?.();
  };

  const fieldProps = {
    ...rest,
    id,
    value,
    defaultValue,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    disabled,
    readOnly: readOnly ?? (editable === false ? true : undefined),
    inputMode: inputMode ?? (keyboardType ? KEYBOARD_INPUT_MODE[keyboardType] : undefined),
    autoCorrect: autoCorrect === undefined ? undefined : autoCorrect ? 'on' : 'off',
    'aria-invalid': invalid || undefined,
    'aria-describedby': errorMessage ? errorId : rest['aria-describedby'],
    className: cn(
      'fx-input',
      multiline && 'fx-textarea',
      mono && 'fx-input-mono',
      secureTextEntry && 'pr-12',
      inputClassName,
    ),
    style: inputStyle,
    'data-testid': testID,
  };

  const field = multiline
    ? createElement('textarea', { ...fieldProps, rows: numberOfLines })
    : createElement('input', {
        ...fieldProps,
        type: secureTextEntry ? (showPassword ? 'text' : 'password') : (type ?? 'text'),
      });

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
      <FxBox justifyContent="center" position="relative">
        {field}
        {secureTextEntry && (
          <FxBox position="absolute" end={6} top={0} bottom={0} justifyContent="center">
            <FxIconButton
              aria-label={showPassword ? hidePasswordLabel : showPasswordLabel}
              pressed={showPassword}
              disabled={disabled}
              color={showPassword ? 'warningBase' : 'content3'}
              icon={showPassword ? <FxEyeOffIcon /> : <FxEyeIcon />}
              onPress={() => setShowPassword((s) => !s)}
            />
          </FxBox>
        )}
      </FxBox>
      {errorMessage && <FxError id={errorId} error={errorMessage} />}
    </FxBox>
  );
}

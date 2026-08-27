import { FxTextInput, type FxTextInputProps } from './FxTextInput.js';

export type FxTextAreaProps = Omit<FxTextInputProps, 'multiline' | 'secureTextEntry'>;

/** Port of textarea.tsx: a 172px multiline FxTextInput. */
export function FxTextArea(props: FxTextAreaProps) {
  return <FxTextInput multiline numberOfLines={6} {...props} />;
}

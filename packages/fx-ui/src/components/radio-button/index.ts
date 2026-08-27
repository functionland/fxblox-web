import { RadioButton } from './RadioButton.js';
import { RadioButtonGroup } from './RadioButtonGroup.js';

export const FxRadioButton = Object.assign(RadioButton, { Group: RadioButtonGroup });

export type { RadioButtonProps } from './RadioButton.js';
export type {
  RadioButtonGroupProps,
  RadioButtonContextType,
  ValueType,
} from './RadioButtonGroup.js';
export { RadioButtonContext, useRadioButtonContext } from './RadioButtonGroup.js';
export * from './RadioButtonWithLabel.js';
export { handlePress, isChecked } from './utils.js';

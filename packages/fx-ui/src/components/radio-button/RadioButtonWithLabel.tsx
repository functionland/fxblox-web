import type { ReactNode } from 'react';
import { FxText } from '../../primitives/FxText.js';
import { cn } from '../../utils/cn.js';
import { RadioButton, type RadioButtonProps } from './RadioButton.js';
import type { ValueType } from './RadioButtonGroup.js';

export interface FxRadioButtonWithLabelProps extends RadioButtonProps {
  /** Label of the radio button. */
  label: ValueType | ReactNode;
  labelClassName?: string;
}

/** Port of RadioButtonWithLabel.tsx — the whole row is a `<label>`, so the text is clickable and the hit target is ≥ 40px. */
export function FxRadioButtonWithLabel({
  label,
  labelClassName,
  className,
  ...rest
}: FxRadioButtonWithLabelProps) {
  return (
    <label className={cn('fx-box min-h-10 cursor-pointer flex-row items-center', labelClassName)}>
      <RadioButton className={className} {...rest} />
      <FxText variant="bodySmallRegular" color="content1" marginLeft="8" paddingRight="8">
        {label}
      </FxText>
    </label>
  );
}

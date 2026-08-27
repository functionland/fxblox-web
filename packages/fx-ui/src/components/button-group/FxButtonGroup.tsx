import { Fragment } from 'react';
import { FxBox, type FxBoxProps } from '../../primitives/FxBox.js';
import { FxPressableOpacity } from '../../primitives/FxPressableOpacity.js';
import { FxText } from '../../primitives/FxText.js';
import type { ColorToken } from '../../theme/tokens.js';

type BgButtonProps = {
  text: string;
  selected: boolean;
  onPress: () => void;
  disabled: boolean;
};

const BgButton = ({ text, selected, onPress, disabled }: BgButtonProps) => {
  const color: ColorToken = selected
    ? disabled
      ? 'border'
      : 'backgroundApp'
    : disabled
      ? 'backgroundSecondary'
      : 'content3';
  return (
    <FxPressableOpacity
      flex={1}
      alignItems="center"
      justifyContent="center"
      height={40}
      backgroundColor={selected ? (disabled ? 'backgroundSecondary' : 'content3') : undefined}
      onPress={onPress}
      disabled={disabled}
      aria-pressed={selected}
      className="active:opacity-100"
    >
      <FxText color={color}>{text}</FxText>
    </FxPressableOpacity>
  );
};

export interface FxButtonGroupProps extends Omit<FxBoxProps, 'children' | 'onSelect'> {
  items: string[];
  selectedIdx?: number | null;
  onSelect: (idx: number) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

/** Port of buttonGroup.tsx — a segmented control (`role="group"`, `aria-pressed` per segment). */
export function FxButtonGroup({
  items,
  selectedIdx = null,
  disabled = false,
  onSelect,
  ...rest
}: FxButtonGroupProps) {
  const selectHandler = (idx: number) => {
    if (idx !== selectedIdx) onSelect(idx);
  };
  const line: ColorToken = disabled ? 'backgroundSecondary' : 'content3';
  return (
    <FxBox
      role="group"
      flexDirection="row"
      borderWidth={1}
      borderColor={line}
      borderRadius="s"
      overflow="hidden"
      {...rest}
    >
      {items.map((item, idx) => (
        <Fragment key={idx}>
          {idx > 0 && <FxBox width={1} backgroundColor={line} aria-hidden />}
          <BgButton
            text={item}
            selected={idx === selectedIdx}
            onPress={() => selectHandler(idx)}
            disabled={disabled}
          />
        </Fragment>
      ))}
    </FxBox>
  );
}

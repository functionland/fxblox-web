import type { Dispatch, SetStateAction } from 'react';
import { FxGridIcon } from '../../icons/generated/FxGridIcon.js';
import { FxListIcon } from '../../icons/generated/FxListIcon.js';
import { FxBox, type FxBoxProps } from '../../primitives/FxBox.js';
import { FxIconButton } from '../icon-button/FxIconButton.js';

export interface FxGridSelectorProps extends Omit<FxBoxProps, 'children'> {
  isList: boolean;
  setIsList: Dispatch<SetStateAction<boolean>>;
  disabled?: boolean;
  /** Mobile LayoutAnimation flag (no-op on web). */
  animated?: boolean;
  listLabel?: string;
  gridLabel?: string;
}

/** Port of gridSelector.tsx: list / grid toggle (two `aria-pressed` icon buttons). */
export function FxGridSelector({
  isList,
  setIsList,
  disabled,
  animated: _animated,
  listLabel = 'List view',
  gridLabel = 'Grid view',
  ...rest
}: FxGridSelectorProps) {
  return (
    <FxBox
      alignItems="center"
      flexDirection="row"
      gap="4"
      role="group"
      aria-label="Layout"
      {...rest}
    >
      <FxIconButton
        aria-label={listLabel}
        pressed={isList}
        disabled={disabled}
        color={isList ? 'greenBase' : 'content3'}
        icon={<FxListIcon />}
        onPress={() => setIsList(true)}
      />
      <FxIconButton
        aria-label={gridLabel}
        pressed={!isList}
        disabled={disabled}
        color={disabled ? 'backgroundPrimary' : isList ? 'content3' : 'greenBase'}
        icon={<FxGridIcon />}
        onPress={() => setIsList(false)}
      />
    </FxBox>
  );
}

import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { FxChevronDownIcon } from '../../icons/generated/FxChevronDownIcon.js';
import { FxChevronUpIcon } from '../../icons/generated/FxChevronUpIcon.js';
import { FxPlusIcon } from '../../icons/generated/FxPlusIcon.js';
import { FxBox, type FxBoxProps } from '../../primitives/FxBox.js';
import { FxPressableOpacity } from '../../primitives/FxPressableOpacity.js';
import { FxText } from '../../primitives/FxText.js';
import { FxButton } from '../button/FxButton.js';
import { FxGridSelector, type FxGridSelectorProps } from '../grid-selector/FxGridSelector.js';

export interface FxHeaderProps
  extends
    Omit<FxBoxProps, 'title' | 'children'>,
    Partial<Pick<FxGridSelectorProps, 'isList' | 'setIsList' | 'animated'>> {
  title?: ReactNode;
  orderBy?: ReactNode;
  isOrderAscending?: boolean;
  setIsOrderByAscending?: Dispatch<SetStateAction<boolean>>;
  onAddPress?: () => void;
  addLabel?: string;
  /** Extra controls rendered before the grid toggle. */
  children?: ReactNode;
}

/** Port of header.tsx: title (or sort toggle) on the left, list/grid toggle + add button on the right. */
export function FxHeader({
  isList,
  setIsList,
  animated,
  onAddPress,
  addLabel = 'Add',
  title,
  isOrderAscending,
  setIsOrderByAscending,
  orderBy,
  children,
  ...rest
}: FxHeaderProps) {
  return (
    <FxBox
      flexDirection="row"
      alignItems="center"
      justifyContent="space-between"
      gap="12"
      {...rest}
    >
      {title ? (
        <FxText color="content1" variant="h200" numberOfLines={1}>
          {title}
        </FxText>
      ) : (
        orderBy && (
          <FxPressableOpacity
            flexDirection="row"
            alignItems="center"
            justifyContent="center"
            gap="4"
            minHeight={40}
            aria-label={`Sort ${isOrderAscending ? 'descending' : 'ascending'}`}
            onPress={() => setIsOrderByAscending?.(!isOrderAscending)}
          >
            <FxText color="content1" variant="bodySmallRegular">
              {orderBy}
            </FxText>
            {isOrderAscending ? (
              <FxChevronUpIcon color="content1" width={16} height={16} />
            ) : (
              <FxChevronDownIcon color="content1" width={16} height={16} />
            )}
          </FxPressableOpacity>
        )
      )}
      <FxBox alignItems="center" flexDirection="row" gap="12">
        {children}
        {setIsList && typeof isList === 'boolean' && (
          <FxGridSelector isList={isList} setIsList={setIsList} animated={animated} />
        )}
        {onAddPress && (
          <FxButton
            onPress={onAddPress}
            width={40}
            aria-label={addLabel}
            icon={<FxPlusIcon color="white" />}
          />
        )}
      </FxBox>
    </FxBox>
  );
}

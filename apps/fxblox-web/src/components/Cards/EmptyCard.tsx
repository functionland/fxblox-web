// Port of apps/box/src/components/Cards/EmptyCard.tsx → FxEmptyState inside the dashed 264px frame.
import { FxBox, FxButton, FxEmptyState } from '@functionland/fx-ui';

export const DEVICE_CARD_HEIGHT = 264;

export interface EmptyCardProps {
  placeholder: string;
  showAddButton?: boolean;
  addButtonTitle?: string;
  onAddButtonPress?: () => void;
  className?: string;
  testID?: string;
}

export function EmptyCard({
  placeholder,
  showAddButton,
  addButtonTitle,
  onAddButtonPress,
  className,
  testID = 'empty-card',
}: EmptyCardProps) {
  return (
    <FxBox
      alignItems="center"
      justifyContent="center"
      borderColor="backgroundSecondary"
      borderRadius="s"
      borderStyle="dashed"
      borderWidth={1}
      minHeight={DEVICE_CARD_HEIGHT}
      paddingHorizontal="24"
      className={className}
      testID={testID}
    >
      <FxEmptyState
        compact
        title={placeholder}
        action={
          showAddButton ? (
            <FxButton onPress={() => onAddButtonPress?.()} className="w-full">
              {addButtonTitle || ''}
            </FxButton>
          ) : undefined
        }
      />
    </FxBox>
  );
}

export default EmptyCard;

/** Label + description on the left, a control (usually `FxSwitch`) on the right — the mobile Mode-screen row. */
import { useId, type ReactNode } from 'react';
import { FxBox, FxSwitch, FxText, type FxBoxProps } from '@functionland/fx-ui';

export interface SettingRowProps extends Omit<FxBoxProps, 'title' | 'children'> {
  title: ReactNode;
  description?: ReactNode;
  /** Trailing control; when omitted, `value`/`onValueChange` render an `FxSwitch`. */
  control?: ReactNode;
  value?: boolean;
  onValueChange?: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

export function SettingRow({
  title,
  description,
  control,
  value,
  onValueChange,
  disabled,
  testID,
  ...rest
}: SettingRowProps) {
  const id = useId();
  const titleId = `setting-row-${id}-title`;
  const descId = `setting-row-${id}-desc`;
  return (
    <FxBox
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      gap="16"
      marginTop="32"
      testID={testID}
      {...rest}
    >
      <FxBox flex={1} minWidth={0}>
        <FxText id={titleId} variant="bodySmallRegular" color="content1">
          {title}
        </FxText>
        {description && (
          <FxText id={descId} variant="bodyXSRegular" color="content2">
            {description}
          </FxText>
        )}
      </FxBox>
      {control ?? (
        <FxSwitch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
        />
      )}
    </FxBox>
  );
}

export default SettingRow;

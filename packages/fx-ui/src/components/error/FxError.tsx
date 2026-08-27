import { FxExclamationIcon } from '../../icons/generated/FxExclamationIcon.js';
import { FxWarningIcon } from '../../icons/generated/FxWarningIcon.js';
import { FxBox, type FxBoxProps } from '../../primitives/FxBox.js';
import { FxText } from '../../primitives/FxText.js';

export interface FxErrorProps extends Omit<FxBoxProps, 'children'> {
  error?: string;
}

/** Port of error.tsx — renders nothing without `error`. */
export function FxError({ error, ...rest }: FxErrorProps) {
  if (!error) return null;
  return (
    <FxBox role="alert" marginTop="8" flexDirection="row" alignItems="center" {...rest}>
      <FxExclamationIcon color="errorBase" width={12} height={12} />
      <FxText variant="bodyXSRegular" color="errorBase" marginLeft="4">
        {error}
      </FxText>
    </FxBox>
  );
}

export function FxWarning({ error, ...rest }: FxErrorProps) {
  if (!error) return null;
  return (
    <FxBox
      role="alert"
      marginTop="8"
      flexDirection="row"
      alignItems="center"
      borderWidth={1}
      borderColor="warningBase"
      borderRadius="s"
      padding="4"
      {...rest}
    >
      <FxWarningIcon color="warningBase" width={24} height={24} />
      <FxText variant="bodyXSRegular" paddingHorizontal="4" color="warningBase" marginLeft="4">
        {error}
      </FxText>
    </FxBox>
  );
}

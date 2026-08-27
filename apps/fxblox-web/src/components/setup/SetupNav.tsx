/**
 * Sticky Back / primary actions row rendered into the SetupShell footer (`SetupFooter` portal). `above` renders a
 * full-width row before the Back row (e.g. a secondary full-width action).
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton } from '@functionland/fx-ui';
import { SetupFooter } from '@/app/shells/SetupShell';

export interface SetupNavProps {
  onBack?: () => void;
  backLabel?: string;
  backDisabled?: boolean;
  /** Primary action(s) — rendered after the Back button in the same row. */
  children?: ReactNode;
  /** Full-width content rendered above the Back row. */
  above?: ReactNode;
  /** Full-width content rendered below the Back row. */
  below?: ReactNode;
}

export function SetupNav({
  onBack,
  backLabel,
  backDisabled,
  children,
  above,
  below,
}: SetupNavProps) {
  const { t } = useTranslation();
  return (
    <SetupFooter>
      {above}
      {(onBack || children) && (
        <FxBox flexDirection="row" gap="12" alignItems="stretch">
          {onBack && (
            <FxButton
              variant="inverted"
              flex={1}
              onPress={onBack}
              disabled={backDisabled}
              testID="setup-back"
            >
              {backLabel ?? t('shell.setup.back')}
            </FxButton>
          )}
          {children}
        </FxBox>
      )}
      {below}
    </SetupFooter>
  );
}

export default SetupNav;

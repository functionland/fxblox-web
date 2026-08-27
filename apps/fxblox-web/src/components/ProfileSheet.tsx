// Global ProfileSheet mount point (mobile ProfileBottomSheet: WalletDetails, account, notifications). The real
// content lands in WS4-F; the shell owns the open state so the TopBar/MobileHeader avatar works today.
import { FxEmptyState, FxSheet, FxUserIcon } from '@functionland/fx-ui';
import { useTranslation } from 'react-i18next';

export interface ProfileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileSheet({ open, onOpenChange }: ProfileSheetProps) {
  const { t } = useTranslation();
  return (
    <FxSheet
      title={t('shell.profile.title')}
      open={open}
      onOpenChange={onOpenChange}
      desktopMode="side"
      testID="profile-sheet"
    >
      <FxEmptyState
        icon={<FxUserIcon />}
        title={t('shell.comingSoon', { name: t('shell.profile.title') })}
        description={t('shell.profile.comingSoon')}
        compact
      />
    </FxSheet>
  );
}

export default ProfileSheet;

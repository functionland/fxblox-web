/**
 * Global ProfileSheet (mobile ProfileBottomSheet): WalletDetails (DID + App PeerId) behind the wallet gate and the
 * "Blox Discovery" entry (→ /setup/connect-existing). The shell owns the open state. WalletDetails is lazy so the
 * AppKit / crypto chunks stay out of the eager shell (this file is imported by AppShell).
 */
import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxSheet, FxSpinner } from '@functionland/fx-ui';
import { paths } from '@/app/paths';
import { WalletGate } from '@/components/main/WalletGate';

const WalletDetails = lazy(() => import('@/components/WalletDetails'));

export interface ProfileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileSheet({ open, onOpenChange }: ProfileSheetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const onBloxDiscovery = () => {
    onOpenChange(false);
    void navigate(paths.setup.connectExisting);
  };
  return (
    <FxSheet
      title={t('shell.profile.title')}
      open={open}
      onOpenChange={onOpenChange}
      desktopMode="side"
      testID="profile-sheet"
    >
      <FxBox paddingVertical="8" gap="20">
        <WalletGate>
          <Suspense
            fallback={
              <FxBox alignItems="center" paddingVertical="16">
                <FxSpinner label={t('shell.loading')} />
              </FxBox>
            }
          >
            <WalletDetails showDID={true} showPeerId={true} showBloxPeerIds={false} />
          </Suspense>
        </WalletGate>
        <FxButton variant="inverted" size="large" onPress={onBloxDiscovery} testID="profile-blox-discovery">
          {t('main.profile.bloxDiscovery')}
        </FxButton>
      </FxBox>
    </FxSheet>
  );
}

export default ProfileSheet;

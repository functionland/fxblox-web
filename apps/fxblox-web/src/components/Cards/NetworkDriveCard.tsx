// Blox dashboard entry to the Network drive screen (Settings › Network drive). Makes no requests itself.
import { useTranslation } from 'react-i18next';
import { FxBox, FxCard, FxChevronRightIcon, FxFolderIcon, FxText } from '@functionland/fx-ui';

export function NetworkDriveCard({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <FxCard onPress={onPress} paddingVertical="16" testID="blox-network-drive-card">
      <FxBox flexDirection="row" alignItems="center" gap="12">
        <FxFolderIcon width={24} height={24} color="greenBase" />
        <FxBox flex={1} minWidth={0} gap="4">
          <FxCard.Title variant="bodyMediumRegular">{t('settings.networkDrive.card.title')}</FxCard.Title>
          <FxText variant="bodySmallRegular" color="content3">
            {t('settings.networkDrive.card.subtitle')}
          </FxText>
        </FxBox>
        <FxChevronRightIcon width={20} height={20} color="content3" />
      </FxBox>
    </FxCard>
  );
}

export default NetworkDriveCard;

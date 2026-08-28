/**
 * Port of apps/box/src/screens/Settings/About.screen.tsx: the privacy text, the terms link, the version, plus
 * a web-only storage note (plan PM6: identity + Blox list live in IndexedDB and can be evicted unless the
 * browser granted persistent storage).
 *
 * The note is `StoragePersistenceCard`, which also carries the button that asks for the grant. This screen used
 * to state the risk and offer nothing to press.
 */
import { useTranslation } from 'react-i18next';
import { FxBox, FxText } from '@functionland/fx-ui';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { StoragePersistenceCard } from '@/components/StoragePersistenceCard';
import { Version } from '@/components/Version';

export {
  readStoragePersistence,
  type StoragePersistence,
} from '@/platform/storagePersistence';

export default function About() {
  const { t } = useTranslation();

  const terms = t('settings.about.termsLink');

  return (
    <SettingsScreen title={t('settings.about.title')} screen="about">
      <FxBox flex={1} justifyContent="space-between" minHeight="60vh">
        <FxBox>
          <FxText as="h2" variant="h200" color="content1" marginBottom="8">
            {t('settings.about.privacy')}
          </FxText>
          <FxText as="p" variant="bodySmallRegular">
            {t('settings.about.body')}
          </FxText>
          <FxText as="p" variant="bodySmallRegular" marginTop="16">
            {t('settings.about.termsPrefix')}
            <a
              href={terms}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
              data-testid="about-terms-link"
            >
              {terms}
            </a>
            {t('settings.about.termsSuffix')}
          </FxText>

          <FxBox marginTop="24">
            <StoragePersistenceCard testIdPrefix="about-storage" />
          </FxBox>
        </FxBox>

        <FxBox marginTop="20">
          <Version />
        </FxBox>
      </FxBox>
    </SettingsScreen>
  );
}

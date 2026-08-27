/**
 * Port of apps/box/src/screens/Settings/About.screen.tsx: the privacy text, the terms link, the version, plus
 * a web-only storage note (`navigator.storage.persisted()` — plan PM6: identity + Blox list live in IndexedDB
 * and can be evicted unless the browser granted persistent storage).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxText } from '@functionland/fx-ui';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { Version } from '@/components/Version';

export type StoragePersistence = 'pending' | 'persisted' | 'notPersisted' | 'unknown';

export async function readStoragePersistence(): Promise<StoragePersistence> {
  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!storage || typeof storage.persisted !== 'function') return 'unknown';
    return (await storage.persisted()) ? 'persisted' : 'notPersisted';
  } catch {
    return 'unknown';
  }
}

export default function About() {
  const { t } = useTranslation();
  const [persistence, setPersistence] = useState<StoragePersistence>('pending');

  useEffect(() => {
    let cancelled = false;
    void readStoragePersistence().then((state) => {
      if (!cancelled) setPersistence(state);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

          {persistence !== 'pending' && (
            <FxBox
              marginTop="24"
              padding="12"
              borderRadius="m"
              backgroundColor={
                persistence === 'notPersisted' ? 'warningMuted' : 'backgroundSecondary'
              }
              role={persistence === 'notPersisted' ? 'alert' : 'status'}
              testID={`about-storage-${persistence}`}
            >
              <FxText variant="bodySmallSemibold" color="content1" marginBottom="4">
                {t('settings.about.storage.title')}
              </FxText>
              <FxText variant="bodyXSRegular" color="content2">
                {t(`settings.about.storage.${persistence}`)}
              </FxText>
            </FxBox>
          )}
        </FxBox>

        <FxBox marginTop="20">
          <Version />
        </FxBox>
      </FxBox>
    </SettingsScreen>
  );
}

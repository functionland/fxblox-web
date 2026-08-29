/**
 * The persistent-storage action item.
 *
 * Settings > About used to state that the browser had not granted persistent storage and stop there, leaving
 * the user with a warning and nothing to press. This is the same shape as the local-network-access affordance:
 * say what is at risk, give a button that asks, and report honestly when the browser declines.
 *
 * `variant="banner"` is the compact form shown on the home screen, so the ask is somewhere the user will
 * actually see it rather than only inside a settings sub-page.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxText } from '@functionland/fx-ui';
import { canInstall, onInstallAvailabilityChange, promptInstall } from '@/platform/installPrompt';
import {
  readStoragePersistence,
  requestPersistentStorage,
  type StoragePersistence,
} from '@/platform/storagePersistence';

export interface StoragePersistenceCardProps {
  /** 'full' — the About panel (always renders once known). 'banner' — home, renders only when action is due. */
  variant?: 'full' | 'banner';
  /** About keeps its original `about-storage-*` ids so its existing assertions stay meaningful. */
  testIdPrefix?: string;
  className?: string;
}

export function StoragePersistenceCard({
  variant = 'full',
  testIdPrefix = 'storage-persistence',
  className,
}: StoragePersistenceCardProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<StoragePersistence>('pending');
  const [asking, setAsking] = useState(false);
  /** The browser can decline without showing anything, so say so rather than leaving the button looking inert. */
  const [declined, setDeclined] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installable, setInstallable] = useState(canInstall);

  useEffect(() => {
    let alive = true;
    void readStoragePersistence().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  // The install prompt usually arrives after first paint, and is gone once used or once the app is installed.
  useEffect(() => onInstallAvailabilityChange(() => setInstallable(canInstall())), []);

  const onEnable = useCallback(async () => {
    setAsking(true);
    setDeclined(false);
    try {
      const next = await requestPersistentStorage();
      setState(next);
      setDeclined(next === 'notPersisted');
    } finally {
      setAsking(false);
    }
  }, []);

  /** Installing is what changes Chrome's mind, so re-ask straight afterwards rather than making them press again. */
  const onInstall = useCallback(async () => {
    setInstalling(true);
    try {
      const accepted = await promptInstall();
      if (!accepted) return;
      const next = await requestPersistentStorage();
      setState(next);
      setDeclined(next === 'notPersisted');
    } finally {
      setInstalling(false);
    }
  }, []);

  if (state === 'pending') return null;
  const actionable = state === 'notPersisted';
  // The banner is an action item: it exists only while there is something to do.
  if (variant === 'banner' && !actionable) return null;

  return (
    <FxBox
      padding="12"
      borderRadius="m"
      backgroundColor={actionable ? 'warningMuted' : 'backgroundSecondary'}
      role={actionable ? 'alert' : 'status'}
      testID={`${testIdPrefix}-${state}`}
      className={className}
      gap="8"
    >
      <FxText variant="bodySmallSemibold" color="content1">
        {t('settings.about.storage.title')}
      </FxText>
      <FxText variant="bodyXSRegular" color="content2">
        {t(`settings.about.storage.${state}`)}
      </FxText>

      {actionable && (
        <FxBox alignItems="flex-start" gap="8">
          <FxButton size="small" loading={asking} onPress={() => void onEnable()} testID="storage-persist-enable">
            {t('settings.about.storage.enable')}
          </FxButton>
          {declined && (
            <FxText variant="bodyXSRegular" color="content3" testID="storage-persist-declined">
              {t('settings.about.storage.declined')}
            </FxText>
          )}
          {/*
            Chrome refuses `persist()` on its own engagement heuristics and never prompts, so "ask again"
            is not a route out — the previous copy could only tell the user to go and install the app
            themselves, which is advice rather than an action. Installing is what actually flips the
            decision, and Chrome will run that dialog for us, so offer it here.
          */}
          {declined && installable && (
            <FxButton
              size="small"
              variant="inverted"
              loading={installing}
              onPress={() => void onInstall()}
              testID="storage-persist-install"
            >
              {t('settings.about.storage.install')}
            </FxButton>
          )}
        </FxBox>
      )}
    </FxBox>
  );
}

export default StoragePersistenceCard;

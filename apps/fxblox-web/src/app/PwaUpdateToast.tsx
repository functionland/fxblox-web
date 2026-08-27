// PWA update prompt ("New version available — Reload"). vite.config.ts has `registerType: 'prompt'` and
// `injectRegister: false`, so this is the one place the service worker is registered.
import { useEffect } from 'react';
import { useToast } from '@functionland/fx-ui';
import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** 0 = no auto-hide (fx-ui renderer): an update prompt must not vanish while the user is away. Swipe/Escape/close dismiss it. */
const UPDATE_TOAST_MS = 0;

export function PwaUpdateToast() {
  const { t } = useTranslation();
  const { queueToast } = useToast();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: (error) => console.warn('[pwa] service worker registration failed', error),
  });

  useEffect(() => {
    if (!needRefresh) return;
    queueToast({
      type: 'info',
      title: t('shell.pwa.updateTitle'),
      message: `${t('shell.pwa.updateMessage')} — ${t('shell.pwa.reload')}`,
      autoHideDuration: UPDATE_TOAST_MS,
      onPress: () => {
        setNeedRefresh(false);
        void updateServiceWorker(true);
      },
    });
  }, [needRefresh, queueToast, setNeedRefresh, t, updateServiceWorker]);

  useEffect(() => {
    if (!offlineReady) return;
    queueToast({ type: 'success', title: t('shell.pwa.offlineReady') });
    setOfflineReady(false);
  }, [offlineReady, queueToast, setOfflineReady, t]);

  return null;
}

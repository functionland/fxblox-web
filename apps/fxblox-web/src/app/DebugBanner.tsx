// Port of the debug-mode banner in apps/box/src/app/App.tsx (Share.share → navigator.share / clipboard).
import { useToast, useShare } from '@functionland/fx-ui';
import { useTranslation } from 'react-i18next';
import { isDebugModeActive, useSettingsStore } from '@/stores/useSettingsStore';

export function DebugBanner() {
  const { t } = useTranslation();
  const debugMode = useSettingsStore((s) => s.debugMode);
  const { share } = useShare();
  const { queueToast } = useToast();

  if (!debugMode || !isDebugModeActive(debugMode)) return null;

  const onShare = async () => {
    const result = await share({ title: t('shell.debug.share'), text: debugMode.uniqueId });
    if (result === 'copied') queueToast({ type: 'success', title: t('shell.debug.copied') });
    else if (result === 'failed')
      queueToast({ type: 'error', title: t('shell.debug.shareFailed') });
  };

  return (
    <button
      type="button"
      onClick={() => void onShare()}
      data-testid="debug-banner"
      className="fx-pressable w-full bg-background-secondary px-4 py-1.5 text-center fx-text-bodyXSRegular text-warning-base"
    >
      {t('shell.debug.banner', { id: debugMode.uniqueId })}
    </button>
  );
}

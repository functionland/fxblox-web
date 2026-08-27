import { FxSpinner } from '@functionland/fx-ui';
import { useTranslation } from 'react-i18next';

/** Full-viewport loading state (RootGate, lazy route hydration). */
export function FullScreenSpinner({
  label,
  fullscreen = true,
}: {
  label?: string;
  fullscreen?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={
        fullscreen
          ? 'grid min-h-dvh place-items-center bg-background-app'
          : 'grid min-h-[40vh] place-items-center'
      }
      data-testid="fullscreen-spinner"
    >
      <FxSpinner size="large" label={label ?? t('shell.loading')} />
    </div>
  );
}

export default FullScreenSpinner;

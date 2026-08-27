// The Chromium-only gate page (decision D5) — moved out of App.tsx. Rendered outside the providers/router.
import { useTranslation } from 'react-i18next';
import { Logo } from '@functionland/fx-ui';

export interface UnsupportedBrowserProps {
  reasons: string[];
}

export function UnsupportedBrowser({ reasons }: UnsupportedBrowserProps) {
  const { t } = useTranslation();
  return (
    <main
      className="grid min-h-dvh place-items-center bg-background-app p-5 text-center text-content1"
      data-screen="unsupported-browser"
    >
      <div className="flex max-w-[560px] flex-col items-center gap-4">
        <Logo width={64} height={62} color="primary" aria-label="FxBlox" />
        <h1 className="font-heading fx-text-h300">{t('shell.unsupported.title')}</h1>
        <p className="fx-text-bodyMediumRegular text-content2">
          {t('shell.unsupported.body', { reasons: reasons.join(', ') })}
        </p>
        <p className="fx-text-bodySmallRegular text-content3">{t('shell.unsupported.hint')}</p>
      </div>
    </main>
  );
}

export default UnsupportedBrowser;

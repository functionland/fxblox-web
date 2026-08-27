/**
 * SetupShell (plan §WS4): centred `max-w-[560px]` column, FxProgressBar from the route handle `{ progress }`,
 * LanguageSelector, "Back to app" when already set up, the deep-link banner ("you'll return to FxFiles pairing
 * after setup") while a deep link is stashed, a sticky footer slot (`<SetupFooter>` portal) and Version.
 */
import {
  createContext,
  Suspense,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FxProgressBar, FxWarningIcon, cn } from '@functionland/fx-ui';
import { useDeepLinkStash } from '@/app/deepLinkStash';
import { paths } from '@/app/paths';
import { useDocumentTitle, useRouteHandle } from '@/app/routeHandle';
import { useIsSetUp } from '@/app/setupState';
import { useRouteFocus } from '@/app/useRouteFocus';
import { FullScreenSpinner } from '@/components/FullScreenSpinner';
import { LanguageSelector } from '@/components/LanguageSelector';
import { Version } from '@/components/Version';

interface SetupShellContextValue {
  footerSlot: HTMLElement | null;
}

const SetupShellContext = createContext<SetupShellContextValue | null>(null);

/** Renders its children into the shell's sticky footer (primary actions of the current step). */
export function SetupFooter({ children }: { children: ReactNode }) {
  const ctx = useContext(SetupShellContext);
  if (!ctx?.footerSlot) return null;
  return createPortal(children, ctx.footerSlot);
}

export const SETUP_COLUMN = 'mx-auto w-full max-w-[560px] px-5';

export function SetupShell() {
  const { t } = useTranslation();
  const { progress = 0 } = useRouteHandle();
  const isSetUp = useIsSetUp();
  const stash = useDeepLinkStash();
  const mainRef = useRef<HTMLElement | null>(null);
  const [footerSlot, setFooterSlot] = useState<HTMLElement | null>(null);

  useRouteFocus(mainRef);
  useDocumentTitle();

  const ctx = useMemo<SetupShellContextValue>(() => ({ footerSlot }), [footerSlot]);

  return (
    <SetupShellContext.Provider value={ctx}>
      <div
        data-testid="setup-shell"
        className="flex min-h-dvh flex-col bg-background-app text-content1"
      >
        <header
          className={cn(SETUP_COLUMN, 'flex min-h-16 items-center justify-between gap-3 py-2')}
        >
          {isSetUp ? (
            <Link
              to={paths.blox}
              className="fx-text-bodySmallSemibold text-primary no-underline hover:underline"
              data-testid="back-to-app"
            >
              ← {t('shell.setup.backToApp')}
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
          <LanguageSelector />
        </header>

        {progress > 0 && (
          <div className={cn(SETUP_COLUMN, 'pb-2')}>
            <FxProgressBar progress={progress} aria-label={t('shell.setup.progress')} />
          </div>
        )}

        {stash && (
          <div className={cn(SETUP_COLUMN, 'pb-2')}>
            <div
              role="status"
              data-testid="deep-link-banner"
              className="flex items-center gap-3 rounded-fx-m border border-warning-base bg-warning-muted px-4 py-3 fx-text-bodySmallRegular text-content1"
            >
              <FxWarningIcon width={20} height={20} color="warningBase" />
              <span>{t('shell.setup.deepLinkBanner')}</span>
            </div>
          </div>
        )}

        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className={cn(SETUP_COLUMN, 'flex flex-1 flex-col py-4 outline-none')}
        >
          <Suspense fallback={<FullScreenSpinner fullscreen={false} />}>
            <Outlet />
          </Suspense>
        </main>

        <footer className="sticky bottom-0 border-t border-border bg-background-app/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div
            ref={setFooterSlot}
            data-testid="setup-footer-slot"
            className={cn(SETUP_COLUMN, 'flex flex-col gap-3 py-3 empty:hidden')}
          />
          <Version paddingVertical="8" />
        </footer>
      </div>
    </SetupShellContext.Provider>
  );
}

export default SetupShell;

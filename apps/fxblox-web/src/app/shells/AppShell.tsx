/**
 * AppShell (plan §WS4):
 *   < 900px   header slot (default: MobileHeader) + <main> + BottomTabs (6 mobile tabs)
 *   ≥ 900px   grid [72px icon rail | content] with Sidebar + TopBar; ≥ 1280px the rail widens to 240px
 * Global overlays mounted once: ProfileSheet (+ `#fx-overlays` mount point). Confirm/Toast/debug banner live in
 * `app/providers.tsx` above the router.
 *
 * Screens replace the phone header with `<AppShellHeader>…</AppShellHeader>` (portal) and open the profile sheet
 * with `useAppShell().openProfile()`.
 */
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FullScreenSpinner } from '@/components/FullScreenSpinner';
import { ProfileSheet } from '@/components/ProfileSheet';
import { useDocumentTitle } from '@/app/routeHandle';
import { useRouteFocus } from '@/app/useRouteFocus';
import { BottomTabs } from './BottomTabs';
import { MobileHeader } from './MobileHeader';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

interface AppShellContextValue {
  /** Element that `AppShellHeader` portals into (phone header slot). */
  headerSlot: HTMLElement | null;
  registerHeader: () => () => void;
  openProfile: () => void;
  closeProfile: () => void;
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function useAppShell(): AppShellContextValue {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error('useAppShell must be used inside <AppShell>');
  return ctx;
}

/** Replaces the phone (< 900px) header while mounted. Desktop keeps the TopBar. */
export function AppShellHeader({ children }: { children: ReactNode }) {
  const { headerSlot, registerHeader } = useAppShell();
  useEffect(() => registerHeader(), [registerHeader]);
  if (!headerSlot) return null;
  return createPortal(children, headerSlot);
}

export function AppShell() {
  const { t } = useTranslation();
  const mainRef = useRef<HTMLElement | null>(null);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
  const [customHeaders, setCustomHeaders] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileMounted, setProfileMounted] = useState(false);

  useRouteFocus(mainRef);
  useDocumentTitle();

  const registerHeader = useCallback(() => {
    setCustomHeaders((n) => n + 1);
    return () => setCustomHeaders((n) => Math.max(0, n - 1));
  }, []);
  const openProfile = useCallback(() => {
    setProfileMounted(true);
    setProfileOpen(true);
  }, []);
  const closeProfile = useCallback(() => setProfileOpen(false), []);

  const ctx = useMemo<AppShellContextValue>(
    () => ({ headerSlot, registerHeader, openProfile, closeProfile }),
    [headerSlot, registerHeader, openProfile, closeProfile],
  );

  return (
    <AppShellContext.Provider value={ctx}>
      <a
        href="#main"
        className="sr-only z-50 rounded-fx-s bg-green-base px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-2 focus:top-2"
      >
        {t('shell.skipToContent')}
      </a>
      <div
        data-testid="app-shell"
        className="min-h-dvh bg-background-app text-content1 desktop:grid desktop:grid-cols-[72px_minmax(0,1fr)] wide:grid-cols-[240px_minmax(0,1fr)]"
      >
        <Sidebar />
        <div className="flex min-h-dvh min-w-0 flex-col">
          <TopBar onOpenProfile={openProfile} />
          <div className="desktop:hidden">
            <div ref={setHeaderSlot} data-testid="app-header-slot" />
            {customHeaders === 0 && <MobileHeader onOpenProfile={openProfile} />}
          </div>
          <main
            id="main"
            ref={mainRef}
            tabIndex={-1}
            className="flex flex-1 flex-col pb-[calc(72px+env(safe-area-inset-bottom))] outline-none desktop:pb-6"
          >
            <Suspense fallback={<FullScreenSpinner fullscreen={false} />}>
              <Outlet />
            </Suspense>
          </main>
          <BottomTabs />
        </div>
      </div>
      {profileMounted && <ProfileSheet open={profileOpen} onOpenChange={setProfileOpen} />}
      <div id="fx-overlays" data-testid="fx-overlays" />
    </AppShellContext.Provider>
  );
}

export default AppShell;

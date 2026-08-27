/**
 * Provider tree (port of apps/box/src/app/App.tsx):
 *   ThemeProvider (fx-ui, driven by useSettingsStore) › I18nextProvider › ToastProvider (+ notify sink) ›
 *   FxConfirmProvider › ErrorBoundary › [debug banner, children] › PWA update toast.
 *
 * Theme mirror: `startThemeSync()` (data-layer bootstrap) writes the resolved mode / `'auto'` to
 * `localStorage['fx.theme']` for the pre-paint `themeBoot.ts`; the fx-ui ThemeProvider applies the same value to
 * `<html data-theme>` and `<meta theme-color>` live.
 */
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { FxConfirmProvider, ThemeProvider, ToastProvider } from '@functionland/fx-ui';
import i18n from '@/i18n';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DebugBanner } from './DebugBanner';
import { PwaUpdateToast } from './PwaUpdateToast';
import { ToastBridge } from './ToastBridge';

export interface AppProvidersProps {
  children: ReactNode;
  /** Skip the service-worker registration hook (tests / storybook-like hosts). */
  pwa?: boolean;
}

export function AppProviders({ children, pwa = true }: AppProvidersProps) {
  const isAuto = useSettingsStore((s) => s.isAuto);
  const colorScheme = useSettingsStore((s) => s.colorScheme);

  return (
    <ThemeProvider mode={isAuto ? 'auto' : colorScheme}>
      <I18nextProvider i18n={i18n}>
        <ToastProvider>
          <ToastBridge />
          <FxConfirmProvider>
            <ErrorBoundary
              onError={(error, info) => console.error('App Error Boundary:', error, info)}
            >
              <DebugBanner />
              {children}
            </ErrorBoundary>
            {pwa && <PwaUpdateToast />}
          </FxConfirmProvider>
        </ToastProvider>
      </I18nextProvider>
    </ThemeProvider>
  );
}

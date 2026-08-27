// Test wrapper: the app providers minus the PWA hook (theme, i18n, toast, confirm, error boundary).
import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { FxConfirmProvider, ThemeProvider, ToastProvider } from '@functionland/fx-ui';
import i18n from '@/i18n';

export function TestProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider mode="dark">
      <I18nextProvider i18n={i18n}>
        <ToastProvider>
          <FxConfirmProvider>{children}</FxConfirmProvider>
        </ToastProvider>
      </I18nextProvider>
    </ThemeProvider>
  );
}

export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: TestProviders, ...options });
}

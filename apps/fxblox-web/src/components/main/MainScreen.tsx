// Shared page container for the main-tab screens (plan §WS4 responsive rules: dashboards 1200px, reading
// columns 720px, Diagnostics 760px). Every screen root carries `data-screen` (the E2E smoke locator).
import type { ReactNode } from 'react';
import { cn } from '@functionland/fx-ui';

export type MainScreenWidth = 'dashboard' | 'reading' | 'diagnostics' | 'narrow';

const WIDTH_CLASS: Record<MainScreenWidth, string> = {
  dashboard: 'max-w-[1200px]',
  reading: 'max-w-[720px]',
  diagnostics: 'max-w-[760px]',
  narrow: 'max-w-[560px]',
};

export interface MainScreenProps {
  /** `data-screen` value (e.g. `blox`, `plugins`). */
  screen: string;
  width?: MainScreenWidth;
  className?: string;
  children: ReactNode;
  testID?: string;
  'aria-label'?: string;
}

export function MainScreen({
  screen,
  width = 'reading',
  className,
  children,
  testID,
  'aria-label': ariaLabel,
}: MainScreenProps) {
  return (
    <section
      data-screen={screen}
      data-testid={testID ?? `screen-${screen}`}
      aria-label={ariaLabel}
      className={cn('mx-auto flex w-full min-w-0 flex-col px-5 py-4', WIDTH_CLASS[width], className)}
    >
      {children}
    </section>
  );
}

export default MainScreen;

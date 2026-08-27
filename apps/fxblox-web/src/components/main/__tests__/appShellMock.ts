/**
 * `@/app/shells/AppShell` stand-in so screens that portal into the phone header slot render outside the shell:
 *   vi.mock('@/app/shells/AppShell', () => import('@/components/main/__tests__/appShellMock'));
 */
import type { ReactNode } from 'react';
import { vi } from 'vitest';

export const openProfile = vi.fn();
export const closeProfile = vi.fn();

export function AppShellHeader({ children }: { children: ReactNode }) {
  return children;
}

export function useAppShell() {
  return {
    headerSlot: null,
    registerHeader: () => () => undefined,
    openProfile,
    closeProfile,
  };
}

export function AppShell() {
  return null;
}

export default AppShell;

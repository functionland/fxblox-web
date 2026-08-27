/**
 * "Is the app set up?" — the exact mobile Root.navigator predicate: an app peer id exists AND at least one Blox is
 * paired. Used by `RequireSetup`, the index redirect and the SetupShell "Back to app" link.
 */
import { useBloxsStore, useUserProfileStore } from '@/stores';

export function isSetupComplete(
  appPeerId: string | undefined,
  bloxs: Record<string, unknown> | undefined,
): boolean {
  return !!appPeerId && Object.keys(bloxs ?? {}).length > 0;
}

export function useIsSetUp(): boolean {
  const appPeerId = useUserProfileStore((s) => s.appPeerId);
  const bloxs = useBloxsStore((s) => s.bloxs);
  return isSetupComplete(appPeerId, bloxs);
}

/** Non-hook variant (event handlers, tests). */
export function readIsSetUp(): boolean {
  return isSetupComplete(useUserProfileStore.getState().appPeerId, useBloxsStore.getState().bloxs);
}

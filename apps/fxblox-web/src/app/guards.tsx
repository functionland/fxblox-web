/**
 * Route guards (plan §WS4).
 *  - `RootGate`: waits for the data-layer boot (`bootstrapDataLayer()` awaits `_hasHydrated` on userProfile +
 *    bloxs + settings, then credentials) and shows a spinner meanwhile. It never touches the deep-link stash.
 *  - `IndexRedirect`: `/` → `/blox` when set up, else `/setup/welcome` (mobile Root.navigator decision).
 *  - `RequireSetup`: the exact mobile predicate `!!appPeerId && Object.keys(bloxs).length > 0`; on failure a
 *    deep-link URL is stashed (sessionStorage) and the user is sent to `/setup/welcome`. Setup routes are never
 *    guarded (mobile re-enters setup from the Blox header "+", ConnectionOptions and Settings › Blox discovery).
 */
import { useEffect, useLayoutEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { bootstrapDataLayer } from '@/app/bootstrap';
import { FullScreenSpinner } from '@/components/FullScreenSpinner';
import { isDeepLinkPath, stashDeepLink } from './deepLinkStash';
import { paths } from './paths';
import { useIsSetUp } from './setupState';

let bootSettled = false;

export function RootGate() {
  const [ready, setReady] = useState(bootSettled);

  useEffect(() => {
    if (bootSettled) return;
    let alive = true;
    bootstrapDataLayer()
      .catch((error: unknown) =>
        console.error('[boot] data layer failed; continuing with defaults', error),
      )
      .finally(() => {
        bootSettled = true;
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) return <FullScreenSpinner />;
  return <Outlet />;
}

/** Test hook: forget that boot completed (each test mocks `bootstrapDataLayer` afresh). */
export function _resetRootGateForTests(): void {
  bootSettled = false;
}

export function IndexRedirect() {
  const setUp = useIsSetUp();
  return <Navigate to={setUp ? paths.blox : paths.setup.welcome} replace />;
}

export function RequireSetup() {
  const setUp = useIsSetUp();
  const location = useLocation();
  const attempted = `${location.pathname}${location.search}`;
  const stash = !setUp && isDeepLinkPath(location.pathname);

  // Layout effect: runs before <Navigate>'s passive effect performs the redirect, so the SetupShell banner sees the
  // stash on its first render, without a side effect during render. Idempotent under StrictMode double-invocation.
  useLayoutEffect(() => {
    if (stash) stashDeepLink(attempted);
  }, [stash, attempted]);

  if (setUp) return <Outlet />;
  return <Navigate to={paths.setup.welcome} replace state={{ from: attempted }} />;
}

// Shared helpers for the main-tab screen tests (not a test file itself).
import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { TestProviders } from '@/test/helpers/renderWithProviders';
import { useBloxsStore, usePluginsStore, useSettingsStore, useUserProfileStore } from '@/stores';
import type { TBloxConectionStatus } from '@/models/blox';

export const TEST_APP_PEER_ID = '12D3KooWAppPeerIdTestAppPeerIdTestAppPeerId0000';
export const TEST_BLOX_PEER_ID = '12D3KooWBloxPeerIdTestBloxPeerIdTestBloxPeer0000';
export const TEST_CLUSTER_PEER_ID = '12D3KooWClusterPeerIdTestClusterPeerIdTestCl0000';

export interface PairedOptions {
  peerId?: string;
  clusterPeerId?: string;
  name?: string;
  status?: TBloxConectionStatus;
  extraBloxs?: Array<{ peerId: string; name: string; status?: TBloxConectionStatus }>;
  fulaIsReady?: boolean;
  password?: string;
  signiture?: string;
}

/** Seeds the stores with a paired session (mirrors the E2E seed) without touching IndexedDB. */
export function setPairedStores(opts: PairedOptions = {}): void {
  const peerId = opts.peerId ?? TEST_BLOX_PEER_ID;
  const bloxs: Record<string, { peerId: string; clusterPeerId?: string; name: string }> = {
    [peerId]: { peerId, clusterPeerId: opts.clusterPeerId ?? TEST_CLUSTER_PEER_ID, name: opts.name ?? 'Test Blox' },
  };
  const bloxsConnectionStatus: Record<string, TBloxConectionStatus> = {};
  if (opts.status) bloxsConnectionStatus[peerId] = opts.status;
  for (const extra of opts.extraBloxs ?? []) {
    bloxs[extra.peerId] = { peerId: extra.peerId, name: extra.name };
    if (extra.status) bloxsConnectionStatus[extra.peerId] = extra.status;
  }
  useUserProfileStore.setState({
    appPeerId: TEST_APP_PEER_ID,
    password: opts.password ?? 'pass',
    signiture: opts.signiture ?? '0xsig',
    fulaIsReady: opts.fulaIsReady ?? false,
    fulaReadyForPeerId: opts.fulaIsReady ? peerId : undefined,
    _hasHydrated: true,
  });
  useBloxsStore.setState({
    bloxs,
    currentBloxPeerId: peerId,
    bloxsConnectionStatus,
    bloxsSpaceInfo: {},
    folderSizeInfo: {},
    bloxsPropertyInfo: {},
    _initFulaSource: null,
    _isCheckingAllStatus: false,
    _hasHydrated: true,
  });
  usePluginsStore.setState({ activePluginsByBlox: {}, activePluginsStatusByBlox: {}, _hasHydrated: true });
  useSettingsStore.setState({ _hasHydrated: true, isAuto: false, colorScheme: 'dark' });
}

export function resetStores(): void {
  useUserProfileStore.getState().reset();
  useBloxsStore.getState().reset();
  usePluginsStore.getState().reset();
}

export interface RenderRouteOptions {
  path?: string;
  initialEntry?: string;
  extraRoutes?: RouteObject[];
}

/** Renders `element` at `path` inside a memory router + the app providers. */
export function renderRoute(element: ReactElement, opts: RenderRouteOptions = {}) {
  const path = opts.path ?? '/';
  const router = createMemoryRouter(
    [{ path, element }, ...(opts.extraRoutes ?? []), { path: '*', element: <div data-testid="elsewhere" /> }],
    { initialEntries: [opts.initialEntry ?? path] },
  );
  const utils = render(
    <TestProviders>
      <RouterProvider router={router} />
    </TestProviders>,
  );
  return { router, ...utils };
}

export function Wrapper({ children }: { children: ReactNode }) {
  return <TestProviders>{children}</TestProviders>;
}

/** A `fetch` stub that answers JSON for matching URLs (others reject like a network error). */
export function jsonFetch(routes: Record<string, unknown | ((url: string, init?: RequestInit) => unknown)>) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    for (const [match, body] of Object.entries(routes)) {
      if (url.includes(match)) {
        const data = typeof body === 'function' ? (body as (u: string, i?: RequestInit) => unknown)(url, init) : body;
        if (data instanceof Response) return data;
        return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
      }
    }
    throw new TypeError(`Failed to fetch: ${url}`);
  };
}

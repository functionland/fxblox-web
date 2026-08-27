// Shared helpers for the settings screen tests (not a test file itself).
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { TestProviders } from '@/test/helpers/renderWithProviders';
import {
  useBloxsStore,
  useDAppsStore,
  usePoolsStore,
  useSettingsStore,
  useUserProfileStore,
} from '@/stores';
import type { TBloxConectionStatus } from '@/models/blox';

export function renderRoute(routes: RouteObject[], initialEntry: string) {
  const router = createMemoryRouter(routes, { initialEntries: [initialEntry] });
  const utils = render(
    <TestProviders>
      <RouterProvider router={router} />
    </TestProviders>,
  );
  return { router, ...utils };
}

export interface SeedBloxOptions {
  peerId?: string;
  clusterPeerId?: string;
  name?: string;
  status?: TBloxConectionStatus;
  /** Mark the Blox image as a PC (`_amd64`) build → contract join path. */
  pc?: boolean;
  fulaIsReady?: boolean;
}

export function seedBlox({
  peerId = 'p1',
  clusterPeerId = 'cluster1',
  name = 'My Blox',
  status = 'CONNECTED',
  pc = false,
  fulaIsReady = true,
}: SeedBloxOptions = {}) {
  useBloxsStore.setState({
    bloxs: { [peerId]: { peerId, clusterPeerId, name } },
    currentBloxPeerId: peerId,
    bloxsConnectionStatus: { [peerId]: status },
    bloxsPropertyInfo: pc
      ? ({ [peerId]: { containerInfo_fula: { image: 'functionland/fula:main_amd64' } } } as never)
      : {},
    _hasHydrated: true,
  });
  useUserProfileStore.setState({ appPeerId: 'appPeer', fulaIsReady, _hasHydrated: true });
}

/** Reset the persisted slices the settings screens read/write. */
export function resetSettingsStores() {
  useSettingsStore.setState({
    isAuto: true,
    colorScheme: 'dark',
    selectedChain: 'skale',
    baseAuthorized: false,
    bloxStatusCheckInterval: 0,
    preferBluetooth: false,
    debugMode: { uniqueId: 'dbg', endDate: new Date(Date.now() - 86_400_000) },
    _hasHydrated: true,
  });
  usePoolsStore.setState({ pools: [], dirty: false, enableInteraction: true, _hasHydrated: true });
  useDAppsStore.setState({ connectedDApps: {}, _hasHydrated: true });
  useUserProfileStore.setState({ manualSignatureWalletAddress: undefined, fulaIsReady: false });
  useBloxsStore.setState({
    bloxs: {},
    currentBloxPeerId: undefined,
    bloxsConnectionStatus: {},
    bloxsPropertyInfo: {},
  });
}

/** Query the visible fx-ui confirm / alert / choose dialog. */
export function confirmDialog(): HTMLElement | null {
  return document.querySelector('[data-testid="fx-confirm"]');
}

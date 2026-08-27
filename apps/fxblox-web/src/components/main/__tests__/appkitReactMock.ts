/**
 * `@reown/appkit/react` stand-in for screen/component tests:
 *   vi.mock('@reown/appkit/react', () => import('@/components/main/__tests__/appkitReactMock'));
 * Mutate `appkitState` before rendering (hooks read it on every render; they are not reactive).
 */
import { vi } from 'vitest';

export interface AppkitMockState {
  address: string | undefined;
  isConnected: boolean;
  status: 'connected' | 'disconnected' | 'connecting' | 'reconnecting' | undefined;
  chainId: number | string | undefined;
  loading: boolean;
  walletInfo: { name?: string } | undefined;
  walletProvider: unknown;
}

const initial = (): AppkitMockState => ({
  address: undefined,
  isConnected: false,
  status: 'disconnected',
  chainId: undefined,
  loading: false,
  walletInfo: undefined,
  walletProvider: undefined,
});

export const appkitState: AppkitMockState = initial();

export const open = vi.fn(async (_opts?: unknown) => undefined);
export const close = vi.fn(async () => undefined);
export const disconnect = vi.fn(async (_opts?: unknown) => undefined);
export const switchNetwork = vi.fn(async (_network?: unknown) => undefined);

export function resetAppkitMock(overrides: Partial<AppkitMockState> = {}): void {
  Object.assign(appkitState, initial(), overrides);
  open.mockClear();
  close.mockClear();
  disconnect.mockClear();
  switchNetwork.mockClear();
}

export function useAppKitAccount(_opts?: unknown) {
  return {
    allAccounts: [],
    address: appkitState.address,
    caipAddress: appkitState.address ? `eip155:1:${appkitState.address}` : undefined,
    isConnected: appkitState.isConnected,
    status: appkitState.status,
    embeddedWalletInfo: undefined,
  };
}

export function useAppKit() {
  return { open, close };
}

export function useDisconnect() {
  return { disconnect };
}

export function useAppKitProvider<T>(_ns: string): { walletProvider: T | undefined; walletProviderType: undefined } {
  return { walletProvider: appkitState.walletProvider as T | undefined, walletProviderType: undefined };
}

export function useAppKitNetwork() {
  return {
    chainId: appkitState.chainId,
    caipNetwork: undefined,
    caipNetworkId: undefined,
    switchNetwork,
  };
}

export function useAppKitState() {
  return { loading: appkitState.loading, open: false, initialized: true, selectedNetworkId: undefined };
}

export function useWalletInfo(_ns?: string) {
  return { walletInfo: appkitState.walletInfo };
}

export function createAppKit() {
  return { setThemeMode: () => undefined, disconnect: async () => undefined };
}

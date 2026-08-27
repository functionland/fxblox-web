/**
 * useWallet — shim over the web AppKit React hooks with the SAME return shape as the mobile `hooks/useWallet.ts`
 * (`account, connected, connecting, chainId (hex), provider, sdk, open, close, disconnect, switchNetwork`), so
 * every ported hook / screen keeps its destructuring.
 */
import { useCallback, useMemo } from 'react';
import { useAppKit, useAppKitAccount, useAppKitNetwork, useAppKitProvider, useAppKitState, useDisconnect } from '@reown/appkit/react';
import type { AppKitNetwork } from '@reown/appkit/networks';
import type { Eip1193Provider } from './types';

export interface WalletShim {
  account: string | undefined;
  connected: boolean;
  connecting: boolean;
  /** Hex chain id (`0x79f99296`) or undefined. */
  chainId: string | undefined;
  provider: Eip1193Provider | undefined;
  sdk: {
    connect: () => Promise<unknown>;
    disconnect: () => Promise<void>;
    getProvider: () => Eip1193Provider | undefined;
  };
  open: (opts?: { view?: 'Connect' | 'Account' | 'Networks' }) => Promise<unknown>;
  close: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchNetwork: (network: AppKitNetwork) => Promise<void>;
}

export const useWallet = (): WalletShim => {
  const { address, isConnected, status } = useAppKitAccount({ namespace: 'eip155' });
  const { open, close } = useAppKit();
  const { disconnect } = useDisconnect();
  const { walletProvider } = useAppKitProvider<Eip1193Provider | undefined>('eip155');
  const { chainId, switchNetwork } = useAppKitNetwork();
  const { loading } = useAppKitState();

  const doDisconnect = useCallback(async () => {
    await disconnect({ namespace: 'eip155' });
  }, [disconnect]);

  const openTyped = useCallback(
    (opts?: { view?: 'Connect' | 'Account' | 'Networks' }) => open(opts as Parameters<typeof open>[0]),
    [open],
  );

  const provider = walletProvider ?? undefined;
  const chainIdHex = chainId != null && chainId !== '' ? `0x${Number(chainId).toString(16)}` : undefined;
  const connecting = loading || status === 'connecting' || status === 'reconnecting';

  return useMemo<WalletShim>(
    () => ({
      account: address ?? undefined,
      connected: isConnected,
      connecting,
      chainId: chainIdHex,
      provider,
      sdk: {
        connect: () => openTyped({ view: 'Connect' }),
        disconnect: doDisconnect,
        getProvider: () => provider,
      },
      open: openTyped,
      close,
      disconnect: doDisconnect,
      switchNetwork,
    }),
    [address, isConnected, connecting, chainIdHex, provider, openTyped, close, doDisconnect, switchNetwork],
  );
};

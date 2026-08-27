// Ported from apps/box/src/hooks/useWalletConnection.ts — `useToast` → platform/notify.
import { useCallback } from 'react';
import { useWallet } from '@/wallet/useWallet';
import { useToast } from '@/platform/notify';

const messageOf = (e: unknown, fallback: string): string =>
  typeof e === 'object' && e !== null && 'message' in e && typeof (e as { message: unknown }).message === 'string'
    ? (e as { message: string }).message
    : fallback;

export const useWalletConnection = () => {
  const { queueToast } = useToast();
  const { connected, account, connecting, open, disconnect } = useWallet();

  const connectWallet = useCallback(async () => {
    try {
      await open({ view: 'Connect' });
      queueToast({ type: 'success', title: 'Wallet Connected', message: 'Wallet connected successfully' });
    } catch (e) {
      queueToast({ type: 'error', title: 'Connection Failed', message: messageOf(e, 'Failed to connect wallet') });
    }
  }, [open, queueToast]);

  const disconnectWallet = useCallback(async () => {
    try {
      await disconnect();
      queueToast({ type: 'info', title: 'Wallet Disconnected', message: 'Wallet disconnected' });
    } catch (e) {
      queueToast({ type: 'error', title: 'Disconnect Failed', message: messageOf(e, 'Failed to disconnect wallet') });
    }
  }, [disconnect, queueToast]);

  return {
    connected,
    account,
    connecting,
    error: null,
    connectWallet,
    disconnectWallet,
  };
};

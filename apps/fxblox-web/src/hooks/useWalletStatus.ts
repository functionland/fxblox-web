/**
 * "Is a wallet connected right now?" versus "did this user ever link one?" — two questions with two answers.
 *
 * They were being answered by one value. `manualSignatureWalletAddress` is written once, when someone pastes a
 * signature from the signing portal, and it is never cleared. Three separate places read it as proof of a live
 * wallet:
 *
 *   useTasksLogic       `connected || !!manualSignatureWalletAddress` -> the "Connect wallet" action item was
 *                       permanently ticked
 *   WalletNotification  `if (manualSignatureWalletAddress) return 'hidden'` -> the connect banner could never
 *                       appear again
 *   useAccountWithFallback  falls back to it, so a screen showing "Disconnected" printed an account underneath
 *
 * which is how the Blox screen came to claim the wallet was connected while Settings > Pools, reading live
 * contract state, said "Disconnected" — both from the same store, in the same session.
 *
 * A pasted signature proves someone controls an address. It does not open a session, and nothing can be signed
 * with it, so it can never stand in for a connection when the question is "can we transact".
 *
 * The mobile app has the same conflation (`hasWallet` and the notification guard are identical there). This is a
 * deliberate divergence, not a port gap: the user reported the contradiction and asked the web to be right.
 */
import { useWallet } from '@/wallet/useWallet';
import { useUserProfileStore } from '@/stores/useUserProfileStore';

export interface WalletStatus {
  /** A live session WITH an account. The only state in which anything can be signed or sent. */
  connected: boolean;
  /** The live wallet account, or null when nothing is connected. */
  account: string | null;
  /** The address whose signature seeded the identity. Survives disconnects; proves nothing about right now. */
  linkedAddress: string | null;
  /** What to show a user: the live account when there is one, otherwise the address they linked. */
  displayAddress: string | null;
  /** True when the only address we have is a linked one — i.e. show it, but do not call it connected. */
  linkedOnly: boolean;
}

export const useWalletStatus = (): WalletStatus => {
  const { account: walletAccount, connected: sessionConnected } = useWallet();
  const linked = useUserProfileStore((state) => state.manualSignatureWalletAddress) ?? null;

  // `connected` without an account is a half-open session — treated as not connected, because every caller
  // wants it in order to do something WITH an address.
  const connected = Boolean(sessionConnected && walletAccount);
  const account = connected ? (walletAccount ?? null) : null;
  const linkedAddress = linked || null;

  return {
    connected,
    account,
    linkedAddress,
    displayAddress: account ?? linkedAddress,
    linkedOnly: !connected && !!linkedAddress,
  };
};

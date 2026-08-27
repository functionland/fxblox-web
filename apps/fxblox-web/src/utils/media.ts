export type SUPPORTED_MEDIA_FORMATS = 'jpg' | 'jpeg' | 'png' | 'svg';

export const getMediaExtension = (url: string): SUPPORTED_MEDIA_FORMATS => {
  return (url.split(/[#?]/)[0] ?? '').split('.').pop()?.trim() as SUPPORTED_MEDIA_FORMATS;
};

/** Wallet logo lookup — WS4 resolves these keys to static image imports. */
export const getWalletImageKey = (walletName: string): 'MetaMask' | null => {
  switch (walletName) {
    case 'MetaMask':
      return 'MetaMask';
    default:
      return null;
  }
};

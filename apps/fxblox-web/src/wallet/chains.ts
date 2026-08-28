/**
 * Chain definitions — the port of `utils/walletConnectConifg.ts` + the AppKit network objects from
 * `config/appKitConfig.ts`. Custom chains for SKALE Europa Hub (2046399126) and Base (8453).
 */
import type { AppKitNetwork } from '@reown/appkit/networks';
import { BASE_CHAIN_ID, SKALE_CHAIN_ID, baseChainId, skaleChainId } from './chainIds';

export { baseChainId, skaleChainId, BASE_CHAIN_ID, SKALE_CHAIN_ID };

export const WaletConnect_Project_Id = '94a4ca39db88ee0be8f6df95fdfb560a';

/**
 * The origin this app is actually being served from.
 *
 * WalletConnect/Reown shows `providerMetadata.url` in the wallet's connection prompt and verifies it against
 * the requesting origin. A hardcoded host therefore produces a "cannot verify domain" warning — which reads
 * like a phishing warning to the user — the moment the app is served from anywhere else. It was pinned to
 * `https://blox.fx.land`, while the app is actually served from `https://docs.fx.land/fxblox-web/` (the org
 * GitHub Pages domain), so every wallet connect was flagged.
 *
 * Deriving it means the claim is true wherever the app runs — production, the Pages project path, or a local
 * dev server — and cannot drift again. The literal is only a fallback for a non-browser context (SSR, tests).
 */
const APP_ORIGIN =
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '')
    : 'https://docs.fx.land/fxblox-web';

export const providerMetadata = {
  name: 'FxBlox',
  description: 'Blox hardware dApp',
  url: APP_ORIGIN,
  icons: ['https://ipfs.cloud.fx.land/gateway/bafkreigl4s3qehoblwqglo5zjjjwtzkomxg4i6gygfeqk5s5h33m5iuyra'],
};

export const baseMainnet: AppKitNetwork = {
  id: BASE_CHAIN_ID,
  name: 'Base',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://base-rpc.publicnode.com'] } },
  blockExplorers: { default: { name: 'BaseScan', url: 'https://basescan.org' } },
  chainNamespace: 'eip155',
  caipNetworkId: 'eip155:8453',
};

export const skaleEuropaHub: AppKitNetwork = {
  id: SKALE_CHAIN_ID,
  name: 'SKALE Europa Hub',
  nativeCurrency: { name: 'sFUEL', symbol: 'sFUEL', decimals: 18 },
  rpcUrls: { default: { http: ['https://mainnet.skalenodes.com/v1/elated-tan-skat'] } },
  blockExplorers: { default: { name: 'SKALE Explorer', url: 'https://elated-tan-skat.explorer.mainnet.skalenodes.com' } },
  chainNamespace: 'eip155',
  caipNetworkId: 'eip155:2046399126',
};

export const APPKIT_NETWORKS: [AppKitNetwork, ...AppKitNetwork[]] = [skaleEuropaHub, baseMainnet];

// EIP-3085 `wallet_addEthereumChain` params (kept for the manual fallback when a wallet lacks the chain).
export const baseChainParams = {
  chainId: baseChainId,
  chainName: 'Base',
  blockExplorerUrls: ['https://basescan.org'],
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://base-rpc.publicnode.com'],
};

export const skaleChainParams = {
  chainId: skaleChainId,
  chainName: 'SKALE Europa Hub',
  blockExplorerUrls: ['https://elated-tan-skat.explorer.mainnet.skalenodes.com'],
  nativeCurrency: { name: 'sFUEL', symbol: 'sFUEL', decimals: 18 },
  rpcUrls: ['https://mainnet.skalenodes.com/v1/elated-tan-skat'],
};

export const chainNames: Record<string, string> = {
  '0x2105': 'Base',
  '0x79f99296': 'SKALE Europa Hub',
};

export const chains: Record<string, typeof baseChainParams> = {
  '0x2105': baseChainParams,
  '0x79f99296': skaleChainParams,
};

export const SUPPORTED_POOL_CHAINS = [baseChainId, skaleChainId];
export const DEFAULT_POOL_CHAIN = skaleChainId;
export const BASE_AUTHORIZATION_CODE = '9870';

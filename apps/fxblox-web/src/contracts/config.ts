// Ported from apps/box/src/contracts/config.ts — `__DEV__` → `import.meta.env.DEV`; chain ids from wallet/chains.
import type { ChainConfig, SupportedChain } from './types';
import { baseChainId, skaleChainId } from '@/wallet/chainIds';

// Contract addresses for each supported chain
export const CONTRACT_ADDRESSES: Record<SupportedChain, ChainConfig> = {
  base: {
    chainId: baseChainId,
    name: 'Base',
    rpcUrl: 'https://base-rpc.publicnode.com',
    blockExplorer: 'https://basescan.org',
    requiresAuth: true,
    contracts: {
      poolStorage: '0xb093fF4B3B3B87a712107B26566e0cCE5E752b4D',
      rewardEngine: '0x31029f90405fd3D9cB0835c6d21b9DFF058Df45A',
      fulaToken: '0x9e12735d77c72c5C3670636D428f2F3815d8A4cB',
    },
  },
  skale: {
    chainId: skaleChainId,
    name: 'SKALE Europa Hub',
    rpcUrl: 'https://mainnet.skalenodes.com/v1/elated-tan-skat',
    blockExplorer: 'https://elated-tan-skat.explorer.mainnet.skalenodes.com',
    requiresAuth: false,
    contracts: {
      poolStorage: '0xf9176Ffde541bF0aa7884298Ce538c471Ad0F015',
      rewardEngine: '0xF7c64248294C45Eb3AcdD282b58675F1831fb047',
      fulaToken: '0x9e12735d77c72c5C3670636D428f2F3815d8A4cB',
    },
  },
};

// Local development configuration (Hardhat)
export const LOCAL_DEV_CONFIG: ChainConfig = {
  chainId: '0x7a69',
  name: 'Hardhat Local',
  rpcUrl: 'http://127.0.0.1:8545',
  blockExplorer: 'http://localhost:8545',
  requiresAuth: false,
  contracts: {
    poolStorage: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
    rewardEngine: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
    fulaToken: '0x9e12735d77c72c5C3670636D428f2F3815d8A4cB',
  },
};

export const DEFAULT_CHAIN: SupportedChain = 'skale';

export const BASE_AUTH_CODE = '9870';

export const getChainConfig = (chainId: string): ChainConfig | null => {
  if (chainId === LOCAL_DEV_CONFIG.chainId) {
    return LOCAL_DEV_CONFIG;
  }
  const chain = Object.values(CONTRACT_ADDRESSES).find((config) => config.chainId === chainId);
  return chain || null;
};

export const getChainConfigByName = (chainName: SupportedChain | 'local'): ChainConfig => {
  if (chainName === 'local') {
    return LOCAL_DEV_CONFIG;
  }
  return CONTRACT_ADDRESSES[chainName];
};

export const isLocalDevelopment = (): boolean => {
  return import.meta.env.DEV;
};

export const isSupportedChain = (chainId: string): boolean => {
  return Object.values(CONTRACT_ADDRESSES).some((config) => config.chainId === chainId);
};

export const getSupportedChainIds = (): string[] => {
  return Object.values(CONTRACT_ADDRESSES).map((config) => config.chainId);
};

export const CHAIN_DISPLAY_NAMES: Record<SupportedChain, string> = {
  base: 'Base Network',
  skale: 'SKALE Europa Hub',
};

export const RPC_ENDPOINTS: Record<SupportedChain, string[]> = {
  base: ['https://base-rpc.publicnode.com', 'https://1rpc.io/base', 'https://mainnet.base.org'],
  skale: ['https://mainnet.skalenodes.com/v1/elated-tan-skat'],
};

export const BLOCK_EXPLORERS: Record<SupportedChain, string> = {
  base: 'https://basescan.org',
  skale: 'https://elated-tan-skat.explorer.mainnet.skalenodes.com',
};

export const GAS_SETTINGS: Record<SupportedChain, { gasLimit: number; maxFeePerGas?: string; maxPriorityFeePerGas?: string }> = {
  base: {
    gasLimit: 500000,
    maxFeePerGas: '1000000000',
    maxPriorityFeePerGas: '1000000000',
  },
  skale: {
    gasLimit: 500000,
  },
};

export const METHOD_GAS_LIMITS = {
  joinPool: 1000000,
  leavePool: 850000,
  cancelJoinRequest: 100000,
  voteJoinRequest: 120000,
  claimRewards: 30000000,
  createPool: 250000,
} as const;

export type ContractMethod = keyof typeof METHOD_GAS_LIMITS;

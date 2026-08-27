/* eslint-disable @typescript-eslint/no-explicit-any */
// Ported VERBATIM from apps/box/src/contracts/types.ts
// Contract types and interfaces for PoolStorage and RewardEngine

export interface PoolInfo {
  poolId: string;
  name: string;
  region: string;
  parent: string;
  participants: string[];
  replicationFactor: number;
  creator?: string;
  maxChallengeResponsePeriod?: number;
  memberCount?: number;
  maxMembers?: number;
  requiredTokens?: string;
  minPingTime?: string;
}

export interface UserPoolInfo {
  poolId: string;
  requestPoolId: string;
  account: string;
}

export interface JoinRequest {
  account: string;
  poolId: string;
  voted: string[];
  positive_votes: number;
  negative_votes: number;
  timestamp?: number;
  index?: number;
  approvals?: number;
  rejections?: number;
  status?: number; // 1=pending, 2=approved, 3=rejected/cancelled
  peerId?: string;
}

export interface RewardInfo {
  account: string;
  poolId: string;
  amount: string;
  lastClaimEpoch: number;
}

export interface ContractAddresses {
  poolStorage: string;
  rewardEngine: string;
  fulaToken: string;
}

export interface ChainConfig {
  chainId: string;
  name: string;
  rpcUrl: string;
  blockExplorer: string;
  contracts: ContractAddresses;
  requiresAuth?: boolean;
}

export type SupportedChain = 'base' | 'skale';

export interface ContractError extends Error {
  code?: string;
  reason?: string;
  transaction?: any;
}

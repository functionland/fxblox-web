/* eslint-disable @typescript-eslint/no-explicit-any */
// Ported VERBATIM from apps/box/src/services/poolReadService.ts (import paths only).
import { ethers } from 'ethers';
import type { PoolInfo, UserPoolInfo, SupportedChain } from '@/contracts/types';
import { POOL_STORAGE_ABI } from '@/contracts/abis';
import { getChainConfigByName } from '@/contracts/config';
import { peerIdToBytes32 } from '@/utils/peerIdConversion';

/**
 * PoolReadService provides read-only access to pool data using standard RPC endpoints
 * This allows reading pool information without requiring a wallet connection.
 */
export class PoolReadService {
  private provider: ethers.providers.JsonRpcProvider | null = null;
  private poolStorageContract: ethers.Contract | null = null;
  private chain: SupportedChain;

  constructor(chain: SupportedChain = 'skale') {
    this.chain = chain;
    this.initializeProvider();
  }

  private initializeProvider(): void {
    try {
      const chainConfig = getChainConfigByName(this.chain);
      this.provider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);
      this.poolStorageContract = new ethers.Contract(chainConfig.contracts.poolStorage, POOL_STORAGE_ABI, this.provider);
      console.log(`PoolReadService initialized for ${this.chain} with RPC: ${chainConfig.rpcUrl}`);
    } catch (error) {
      console.error('Failed to initialize PoolReadService:', error);
      throw error;
    }
  }

  switchChain(chain: SupportedChain): void {
    this.chain = chain;
    this.initializeProvider();
  }

  async listPools(_offset: number = 0, _limit: number = 25): Promise<PoolInfo[]> {
    try {
      if (!this.poolStorageContract) {
        throw new Error('Pool storage contract not initialized');
      }
      const pools: PoolInfo[] = [];
      let index = 0;
      while (true) {
        try {
          const poolId = await this.poolStorageContract.poolIds(index);
          if (poolId === 0) {
            break;
          }
          const pool = await this.poolStorageContract.pools(poolId);
          pools.push({
            poolId: pool.id.toString(),
            name: pool.name,
            region: pool.region,
            parent: '',
            participants: [],
            replicationFactor: 1,
          });
          index++;
        } catch {
          console.log('PoolReadService.listPools: Reached end of pools at index', index);
          break;
        }
      }
      return pools;
    } catch (error) {
      console.error('PoolReadService.listPools error:', error);
      throw error;
    }
  }

  async getAllPoolIds(): Promise<string[]> {
    try {
      if (!this.poolStorageContract) {
        throw new Error('Pool storage contract not initialized');
      }
      const ids: string[] = [];
      let index = 0;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('getAllPoolIds call timed out after 30 seconds')), 30000);
      });
      while (true) {
        try {
          const contractCallPromise = this.poolStorageContract.poolIds(index);
          const id = await Promise.race([contractCallPromise, timeoutPromise]);
          if (id === 0) {
            break;
          }
          ids.push(id.toString());
          index++;
        } catch {
          console.log('PoolReadService.getAllPoolIds: Reached end at index', index);
          break;
        }
      }
      return ids;
    } catch (error) {
      console.error('PoolReadService.getAllPoolIds error:', error);
      throw error;
    }
  }

  async getPool(poolId: string): Promise<any> {
    try {
      if (!this.poolStorageContract) {
        throw new Error('Pool storage contract not initialized');
      }
      const pool = await this.poolStorageContract.pools(poolId);
      return {
        creator: pool.creator,
        id: pool.id.toString(),
        maxChallengeResponsePeriod: pool.maxChallengeResponsePeriod.toString(),
        memberCount: pool.memberCount.toString(),
        maxMembers: pool.maxMembers.toString(),
        requiredTokens: pool.requiredTokens.toString(),
        minPingTime: pool.minPingTime.toString(),
        name: pool.name,
        region: pool.region,
      };
    } catch (error) {
      console.error('PoolReadService.getPool error:', error);
      throw error;
    }
  }

  async isMemberOfAnyPool(account: string): Promise<boolean> {
    try {
      if (!this.poolStorageContract) {
        throw new Error('Pool storage contract not initialized');
      }
      const isMember = await this.poolStorageContract.isMemberOfAnyPool(account);
      return isMember;
    } catch (error) {
      console.error('PoolReadService.isMemberOfAnyPool error:', error);
      return false;
    }
  }

  async getMemberIndex(poolId: string, account: string): Promise<string> {
    try {
      if (!this.poolStorageContract) {
        throw new Error('Pool storage contract not initialized');
      }
      const index = await this.poolStorageContract.getMemberIndex(poolId, account);
      return index.toString();
    } catch (error) {
      console.error('PoolReadService.getMemberIndex error:', error);
      return '0';
    }
  }

  async isPeerIdMemberOfPool(poolId: string, peerId: string): Promise<{ isMember: boolean; memberAddress: string }> {
    try {
      if (!this.poolStorageContract) {
        throw new Error('Pool storage contract not initialized');
      }
      const peerIdBytes32 = await peerIdToBytes32(peerId);
      const [isMember, memberAddress] = await this.poolStorageContract.isPeerIdMemberOfPool(poolId, peerIdBytes32);
      return { isMember, memberAddress: memberAddress || '' };
    } catch (error) {
      console.error('PoolReadService.isPeerIdMemberOfPool error:', error);
      return { isMember: false, memberAddress: '' };
    }
  }

  async getUserPoolInfo(account: string, peerId?: string): Promise<UserPoolInfo> {
    try {
      let poolId = '0';
      const requestPoolId = '0';

      const isMemberByAddress = await this.isMemberOfAnyPool(account);

      if (isMemberByAddress && peerId) {
        const poolIds = await this.getAllPoolIds();
        for (const pid of poolIds) {
          const { isMember } = await this.isPeerIdMemberOfPool(pid, peerId);
          if (isMember) {
            poolId = pid;
            break;
          }
        }
      } else if (isMemberByAddress) {
        const poolIds = await this.getAllPoolIds();
        for (const pid of poolIds) {
          const memberIndex = await this.getMemberIndex(pid, account);
          if (memberIndex !== '0') {
            poolId = pid;
            break;
          }
        }
      }

      return { account, poolId, requestPoolId };
    } catch (error) {
      console.error('PoolReadService.getUserPoolInfo error:', error);
      throw error;
    }
  }

  async getJoinRequest(poolId: string, account: string): Promise<any> {
    try {
      if (!this.poolStorageContract) {
        throw new Error('Pool storage contract not initialized');
      }
      const joinRequest = await this.poolStorageContract.joinRequests(poolId, account);
      return {
        poolId,
        account,
        positive_votes: joinRequest.positive_votes?.toString() || '0',
        negative_votes: joinRequest.negative_votes?.toString() || '0',
        timestamp: joinRequest.timestamp?.toString() || '0',
      };
    } catch (error) {
      console.error('PoolReadService.getJoinRequest error:', error);
      throw error;
    }
  }
}

const poolReadServiceInstances: Partial<Record<SupportedChain, PoolReadService>> = {};

export const getPoolReadService = (chain: SupportedChain = 'skale'): PoolReadService => {
  let inst = poolReadServiceInstances[chain];
  if (!inst) {
    inst = new PoolReadService(chain);
    poolReadServiceInstances[chain] = inst;
  }
  return inst;
};

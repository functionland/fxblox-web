/**
 * Adapted from react-native-fula/src/protocols/blockchain.ts (1.58.x).
 *
 * The parsing quirks are preserved on purpose because apps/box depends on them:
 *   - most functions "resolve with the error" (`.catch((err) => err)`), so a NOT_AUTHORIZED / HTTP_ERROR arrives
 *     as a resolved `FulaWebError` instance rather than a rejection;
 *   - `joinPoolWithChain` / `leavePoolWithChain` / `getAccount` / `assetsBalance` / `transferToFula` re-throw;
 *   - a non-JSON body is returned as the raw string.
 * Only the logging changed (ring buffer, no identities/seeds).
 */
import Fula from '../core/nativeShim.js';
import { createLogger } from '../core/log.js';
import type * as BType from '../types/blockchain.js';

const log = createLogger('blockchain');

/*
createAccount: This function takes a seed argument, which is used to create an account. The seed must start with "/". The function returns a promise of an object that contains the seed and the account that was created.
*/
export const createAccount = (
  seed: string, //seed that is used to create the account. It must start with "/"
): Promise<BType.SeededResponse> => {
  log.debug('createAccount started');
  const res1 = Fula.createAccount(seed)
    .then((res) => {
      try {
        const jsonRes: BType.SeededResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res1;
};

/*
checkAccountExists: This function takes an account argument, and returns a promise of an object that contains the account and a boolean exists flag.
*/
export const checkAccountExists = (account: string): Promise<BType.AccountExistsResponse> => {
  log.debug('checkAccountExists started', account);
  const res1 = Fula.checkAccountExists(account)
    .then((res) => {
      try {
        const jsonRes: BType.AccountExistsResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res1;
};

/*
accountFund: asks the Blox to fund the account (body `{"amount":1000000000000000000,"to":<account>}`).
*/
export const accountFund = (account: string): Promise<BType.AccountFundResponse> => {
  log.debug('accountFund started', account);
  const res1 = Fula.accountFund(account)
    .then((res) => {
      try {
        const jsonRes: BType.AccountFundResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res1;
};

export const createPool = (seed: string, poolName: string): Promise<BType.PoolCreateResponse> => {
  log.debug('createPool started', poolName);
  const res1 = Fula.createPool(seed, poolName)
    .then((res) => {
      try {
        const jsonRes: BType.PoolCreateResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res1;
};

export const listPools = (): Promise<BType.PoolListResponse> => {
  log.debug('listPools started');
  const res1 = Fula.listPools()
    .then((res) => {
      try {
        const jsonRes: BType.PoolListResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res1;
};

export const joinPool = (poolID: number): Promise<BType.PoolJoinResponse> => {
  log.debug('joinPool started', poolID);
  const res1 = Fula.joinPool(poolID.toString())
    .then((res) => {
      try {
        const jsonRes: BType.PoolJoinResponse = JSON.parse(res);
        return jsonRes;
      } catch (e) {
        try {
          return JSON.parse(res);
        } catch {
          log.error('Error parsing res in joining pool:', e);
          return res; // Rethrow the error to maintain the rejection state
        }
      }
    })
    .catch((err) => {
      log.error('Error joining pool:', err);
      throw err; // Rethrow the error to maintain the rejection state
    });
  return res1;
};

export const leavePool = (poolID: number): Promise<BType.PoolLeaveResponse> => {
  log.debug('leavePool started', poolID);
  const res1 = Fula.leavePool(poolID.toString())
    .then((res) => {
      try {
        const jsonRes: BType.PoolLeaveResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res1;
};

/*
joinPoolWithChain: This function takes two arguments: poolID and chainName. The poolID is the ID of the pool to join, and the chainName specifies the blockchain network to use for the operation.
*/
export const joinPoolWithChain = (poolID: number, chainName: string): Promise<BType.PoolJoinResponse> => {
  log.debug('joinPoolWithChain started', { poolID, chainName });

  // Validate inputs
  if (typeof poolID !== 'number' || poolID <= 0) {
    return Promise.reject(new Error('Pool ID must be a positive number'));
  }

  if (typeof chainName !== 'string' || chainName.trim().length === 0) {
    return Promise.reject(new Error('Chain name must be a non-empty string'));
  }

  const res1 = Fula.joinPoolWithChain(poolID.toString(), chainName.trim())
    .then((res) => {
      try {
        const jsonRes: BType.PoolJoinResponse = JSON.parse(res);
        return jsonRes;
      } catch (e) {
        try {
          return JSON.parse(res);
        } catch {
          log.error('Error parsing res in joining pool with chain:', e);
          return res; // Return raw response if parsing fails
        }
      }
    })
    .catch((err) => {
      log.error('Error joining pool with chain:', err);
      throw err; // Rethrow the error to maintain the rejection state
    });
  return res1;
};

/*
leavePoolWithChain: This function takes two arguments: poolID and chainName.
*/
export const leavePoolWithChain = (poolID: number, chainName: string): Promise<BType.PoolLeaveResponse> => {
  log.debug('leavePoolWithChain started', { poolID, chainName });

  // Validate inputs
  if (typeof poolID !== 'number' || poolID <= 0) {
    return Promise.reject(new Error('Pool ID must be a positive number'));
  }

  if (typeof chainName !== 'string' || chainName.trim().length === 0) {
    return Promise.reject(new Error('Chain name must be a non-empty string'));
  }

  const res1 = Fula.leavePoolWithChain(poolID.toString(), chainName.trim())
    .then((res) => {
      try {
        const jsonRes: BType.PoolLeaveResponse = JSON.parse(res);
        return jsonRes;
      } catch (e) {
        try {
          return JSON.parse(res);
        } catch {
          log.error('Error parsing res in leaving pool with chain:', e);
          return res; // Return raw response if parsing fails
        }
      }
    })
    .catch((err) => {
      log.error('Error leaving pool with chain:', err);
      throw err; // Rethrow the error to maintain the rejection state
    });
  return res1;
};

export const cancelPoolJoin = (poolID: number): Promise<BType.PoolCancelJoinResponse> => {
  log.debug('cancelPoolJoin started', poolID);
  const res1 = Fula.cancelPoolJoin(poolID.toString())
    .then((res) => {
      try {
        const jsonRes: BType.PoolCancelJoinResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res1;
};

export const listPoolJoinRequests = (poolID: string): Promise<BType.PoolRequestsResponse> => {
  log.debug('listPoolJoinRequests started', poolID);
  const res1 = Fula.listPoolJoinRequests(poolID)
    .then((res) => {
      try {
        const jsonRes: BType.PoolRequestsResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res1;
};

export const votePoolJoinRequest = (seed: string, poolID: number, account: string, accept: boolean): Promise<BType.PoolVoteResponse> => {
  log.debug('votePoolJoinRequest started', { poolID, account, accept });
  const res1 = Fula.votePoolJoinRequest(seed, poolID, account, accept)
    .then((res) => {
      try {
        const jsonRes: BType.PoolVoteResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res1;
};

export const batchUploadManifest = (
  cids_i: string[],
  poolId_i: string | number,
  replicationFactor_i: string | number,
): Promise<BType.ManifestBatchUploadResponse> => {
  log.debug('batchUploadManifest started', { poolId_i, replicationFactor_i, count: cids_i.length });
  if (typeof poolId_i === 'number') {
    poolId_i = poolId_i.toString();
  }
  if (typeof replicationFactor_i === 'number') {
    replicationFactor_i = replicationFactor_i.toString();
  }
  const res1 = Fula.batchUploadManifest(cids_i, poolId_i, replicationFactor_i)
    .then((res) => {
      try {
        const jsonRes: BType.ManifestBatchUploadResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res1;
};

export const replicateInPool = (cids_i: string[], account_i: string, poolId_i: string | number): Promise<string[]> => {
  log.debug('replicateInPool started', { poolId_i, account_i, count: cids_i.length });
  if (typeof poolId_i === 'number') {
    poolId_i = poolId_i.toString();
  }

  const res1 = Fula.replicateInPool(cids_i, account_i, poolId_i)
    .then((res) => {
      try {
        const jsonRes: string[] = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res1;
};

export const newStoreRequest = (seed: string, poolID: number, uploader: string, cid: string): Promise<BType.ManifestUploadResponse> => {
  log.debug('newStoreRequest started', { poolID, uploader, cid });
  const res1 = Fula.newStoreRequest(seed, poolID, uploader, cid)
    .then((res) => {
      try {
        const jsonRes: BType.ManifestUploadResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res1;
};

export const listAvailableReplicationRequests = (poolID: string): Promise<BType.ManifestUploadResponse[]> => {
  log.debug('listAvailableReplicationRequests started', poolID);
  const res1 = Fula.listAvailableReplicationRequests(poolID)
    .then((res) => {
      try {
        const jsonRes: BType.ManifestUploadResponse[] = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res1;
};

export const removeReplicationRequest = (seed: string, poolID: number, cid: string): Promise<BType.ManifestUploadResponse> => {
  log.debug('removeReplicationRequest started', { poolID, cid });
  const res1 = Fula.removeReplicationRequest(seed, poolID, cid)
    .then((res) => {
      try {
        const jsonRes: BType.ManifestUploadResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res1;
};

export const removeStorer = (seed: string, storer: string, poolID: number, cid: string): Promise<BType.ManifestUploadResponse> => {
  log.debug('removeStorer started', { storer, poolID, cid });
  const res1 = Fula.removeStorer(seed, storer, poolID, cid)
    .then((res) => {
      try {
        const jsonRes: BType.ManifestUploadResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res1;
};

export const removeStoredReplication = (seed: string, uploader: string, poolID: number, cid: string): Promise<BType.ManifestUploadResponse> => {
  log.debug('removeStoredReplication started', { uploader, poolID, cid });
  const res1 = Fula.removeStoredReplication(seed, uploader, poolID, cid)
    .then((res) => {
      try {
        const jsonRes: BType.ManifestUploadResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res1;
};

/*
bloxFreeSpace: This function takes no arguments and returns a promise of an object that contains the blox free space information.
*/
export const bloxFreeSpace = (): Promise<BType.BloxFreeSpaceResponse> => {
  log.debug('bloxFreeSpace started');
  const res1 = Fula.bloxFreeSpace()
    .then((res) => {
      try {
        const jsonRes: BType.BloxFreeSpaceResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res1;
};

export const getAccount = (): Promise<BType.GetAccountResponse> => {
  log.debug('getAccount started');
  const res = Fula.getAccount()
    .then((res1) => {
      try {
        const jsonRes: BType.GetAccountResponse = JSON.parse(res1);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res1);
        } catch (e1) {
          log.error('Error parsing res in get account:', e1);
          throw e1; // Rethrow the error to maintain the rejection state
        }
      }
    })
    .catch((err) => {
      log.error('Error getting account:', err);
      throw err; // Rethrow the error to maintain the rejection state
    });
  return res;
};

export const assetsBalance = (account: string, assetId: string, classId: string): Promise<BType.AssetsBalanceResponse> => {
  log.debug('assetsBalance started');
  const res = Fula.assetsBalance(account, assetId, classId)
    .then((res1) => {
      try {
        const jsonRes: BType.AssetsBalanceResponse = JSON.parse(res1);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res1);
        } catch (e1) {
          log.error('Error parsing res in get asset balance:', e1);
          throw e1; // Rethrow the error to maintain the rejection state
        }
      }
    })
    .catch((err) => {
      log.error('Error getting asset balance:', err);
      throw err; // Rethrow the error to maintain the rejection state
    });
  return res;
};

export const transferToFula = (amount: string, wallet: string, chain: string): Promise<BType.TransferToFulaResponse> => {
  log.debug('transferToFula started');
  const res = Fula.transferToFula(amount, wallet, chain)
    .then((res1) => {
      try {
        const jsonRes: BType.TransferToFulaResponse = JSON.parse(res1);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res1);
        } catch (e1) {
          log.error('Error parsing res in transferToFula:', e1);
          throw e1; // Rethrow the error to maintain the rejection state
        }
      }
    })
    .catch((err) => {
      log.error('Error getting transferToFula:', err);
      throw err; // Rethrow the error to maintain the rejection state
    });
  return res;
};

// Auto-pin

export const autoPinPair = (token: string, endpoint: string): Promise<BType.AutoPinPairResponse> => {
  log.debug('autoPinPair started', { endpoint });
  const res1 = Fula.autoPinPair(token, endpoint)
    .then((res) => {
      try {
        const jsonRes: BType.AutoPinPairResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res1;
};

export const autoPinRefresh = (token: string): Promise<BType.AutoPinRefreshResponse> => {
  log.debug('autoPinRefresh started');
  const res1 = Fula.autoPinRefresh(token)
    .then((res) => {
      try {
        const jsonRes: BType.AutoPinRefreshResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res1;
};

export const autoPinUnpair = (): Promise<BType.AutoPinUnpairResponse> => {
  log.debug('autoPinUnpair started');
  const res1 = Fula.autoPinUnpair()
    .then((res) => {
      try {
        const jsonRes: BType.AutoPinUnpairResponse = JSON.parse(res);
        return jsonRes;
      } catch {
        try {
          return JSON.parse(res);
        } catch {
          return res;
        }
      }
    })
    .catch((err) => {
      return err;
    });
  return res1;
};

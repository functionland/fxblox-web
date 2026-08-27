// Ported from apps/box/src/contracts/contractServiceProvider.tsx — `useToast` → platform/notify.
import React, { createContext, useContext, useCallback, useState, useEffect } from 'react';
import { ContractService } from './contractService';
import type { SupportedChain } from './types';
import { useWallet } from '@/wallet/useWallet';
import { useToast } from '@/platform/notify';

interface ContractServiceContextType {
  contractService: ContractService | null;
  isInitialized: boolean;
  isInitializing: boolean;
  error: string | null;
  connectedAccount: string | null;
  currentChain: SupportedChain | null;
  initializeService: (chain: SupportedChain) => Promise<void>;
  switchChain: (chain: SupportedChain) => Promise<void>;
  resetService: () => void;
}

const ContractServiceContext = createContext<ContractServiceContextType | null>(null);

const messageOf = (error: unknown, fallback: string): string => (error instanceof Error && error.message ? error.message : fallback);

export const ContractServiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { provider, account } = useWallet();
  const { queueToast } = useToast();

  const [contractService, setContractService] = useState<ContractService | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectedAccount, setConnectedAccount] = useState<string | null>(null);
  const [currentChain, setCurrentChain] = useState<SupportedChain | null>(null);

  const resetService = useCallback(() => {
    setContractService(null);
    setIsInitialized(false);
    setIsInitializing(false);
    setError(null);
    setConnectedAccount(null);
    setCurrentChain(null);
  }, []);

  const initializeService = useCallback(
    async (chain: SupportedChain) => {
      if (!provider || !account) {
        throw new Error('Provider and account are required');
      }
      setIsInitializing(true);
      setError(null);
      try {
        const service = new ContractService(chain);
        await service.initialize(provider);
        const connectedAcc = await service.getConnectedAccount();
        setContractService(service);
        setConnectedAccount(connectedAcc);
        setCurrentChain(chain);
        setIsInitialized(true);
      } catch (e) {
        console.error('Contract service initialization failed:', e);
        const msg = messageOf(e, 'Failed to initialize contract service');
        setError(msg);
        queueToast({ type: 'error', title: 'Contract Connection Failed', message: msg });
        throw e;
      } finally {
        setIsInitializing(false);
      }
    },
    [provider, account, queueToast],
  );

  const switchChain = useCallback(
    async (newChain: SupportedChain) => {
      if (!provider || !account) {
        throw new Error('Provider and account are required');
      }
      try {
        const service = new ContractService(newChain);
        await service.initialize(provider);
        const connectedAcc = await service.getConnectedAccount();
        setContractService(service);
        setConnectedAccount(connectedAcc);
        setCurrentChain(newChain);
        queueToast({ type: 'success', title: 'Chain Switched', message: `Switched to ${newChain}` });
      } catch (e) {
        console.error('Chain switch failed:', e);
        queueToast({ type: 'error', title: 'Chain Switch Failed', message: messageOf(e, 'Failed to switch chains') });
        throw e;
      }
    },
    [provider, account, queueToast],
  );

  useEffect(() => {
    if (!provider || !account) {
      resetService();
    }
  }, [provider, account, resetService]);

  const contextValue: ContractServiceContextType = {
    contractService,
    isInitialized,
    isInitializing,
    error,
    connectedAccount,
    currentChain,
    initializeService,
    switchChain,
    resetService,
  };

  return <ContractServiceContext.Provider value={contextValue}>{children}</ContractServiceContext.Provider>;
};

export const useContractService = (): ContractServiceContextType => {
  const context = useContext(ContractServiceContext);
  if (!context) {
    throw new Error('useContractService must be used within a ContractServiceProvider');
  }
  return context;
};

export const useContractOperations = () => {
  const { contractService, isInitialized, connectedAccount } = useContractService();
  const { queueToast } = useToast();

  const executeOperation = useCallback(
    async <T,>(operation: () => Promise<T>, operationName: string): Promise<T | null> => {
      if (!isInitialized || !contractService) {
        queueToast({ type: 'error', title: 'Contract Not Ready', message: 'Please connect your wallet and initialize contracts first' });
        return null;
      }
      try {
        const result = await operation();
        queueToast({ type: 'success', title: 'Transaction Successful', message: `${operationName} completed successfully` });
        return result;
      } catch (e) {
        console.error(`${operationName} failed:`, e);
        const err = e as { code?: string; reason?: string; message?: string };
        let errorMessage = err.message || `${operationName} failed`;
        if (err.code === 'INSUFFICIENT_FUNDS') {
          errorMessage = 'Insufficient funds for transaction';
        } else if (err.code === 'USER_REJECTED') {
          errorMessage = 'Transaction was rejected by user';
        } else if (err.reason) {
          errorMessage = err.reason;
        }
        queueToast({ type: 'error', title: 'Transaction Failed', message: errorMessage });
        return null;
      }
    },
    [isInitialized, contractService, queueToast],
  );

  return {
    contractService,
    isInitialized,
    connectedAccount,
    executeOperation,
    isReady: isInitialized && !!contractService,
    canExecute: isInitialized && !!contractService && !!connectedAccount,
  };
};

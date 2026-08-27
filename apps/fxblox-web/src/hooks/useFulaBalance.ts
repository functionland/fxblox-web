// Ported VERBATIM (import paths) from apps/box/src/hooks/useFulaBalance.ts
import { useState, useEffect, useCallback } from 'react';
import { useContractIntegration } from './useContractIntegration';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUserProfileStore } from '@/stores/useUserProfileStore';
import { ethers } from 'ethers';
import { getChainConfigByName } from '@/contracts/config';
import { FULA_TOKEN_ABI } from '@/contracts/abis';
import { useWallet } from '@/wallet/useWallet';

export interface FulaBalanceState {
  balance: string;
  formattedBalance: string;
  tokenInfo: {
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: string;
  } | null;
  loading: boolean;
  error: string | null;
}

const errorText = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : typeof error === 'string' ? error : fallback;

export const useFulaBalance = (account?: string) => {
  const [state, setState] = useState<FulaBalanceState>({
    balance: '0',
    formattedBalance: '0.00',
    tokenInfo: null,
    loading: false,
    error: null,
  });

  const { connectedAccount } = useContractIntegration();
  const selectedChain = useSettingsStore((s) => s.selectedChain);
  const { account: walletAccount } = useWallet();
  const manualSignatureWalletAddress = useUserProfileStore((s) => s.manualSignatureWalletAddress);

  const loadBalance = useCallback(async () => {
    const targetAccount = account || walletAccount || connectedAccount || manualSignatureWalletAddress;
    if (!targetAccount) {
      setState((prev) => ({ ...prev, error: 'No account available' }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const chainConfig = getChainConfigByName(selectedChain);
      const readOnlyProvider = new ethers.providers.JsonRpcProvider(chainConfig.rpcUrl);
      const tokenContract = new ethers.Contract(chainConfig.contracts.fulaToken, FULA_TOKEN_ABI, readOnlyProvider);

      const [balance, name, symbol, decimals, totalSupply] = await Promise.all([
        tokenContract.balanceOf(targetAccount),
        tokenContract.name(),
        tokenContract.symbol(),
        tokenContract.decimals(),
        tokenContract.totalSupply(),
      ]);

      const formattedBalance = parseFloat(ethers.utils.formatUnits(balance, decimals)).toFixed(2);
      const balanceString = ethers.utils.formatUnits(balance, decimals);

      setState({
        balance: balanceString,
        formattedBalance,
        tokenInfo: { name, symbol, decimals, totalSupply: ethers.utils.formatUnits(totalSupply, decimals) },
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Error loading FULA balance:', error);
      setState((prev) => ({ ...prev, loading: false, error: errorText(error, 'Failed to load FULA balance') }));
    }
  }, [selectedChain, account, walletAccount, connectedAccount, manualSignatureWalletAddress]);

  const refreshBalance = useCallback(() => {
    void loadBalance();
  }, [loadBalance]);

  useEffect(() => {
    if (account || walletAccount || connectedAccount || manualSignatureWalletAddress) {
      void loadBalance();
    }
  }, [account, walletAccount, connectedAccount, manualSignatureWalletAddress, loadBalance]);

  useEffect(() => {
    if (!(account || walletAccount || connectedAccount || manualSignatureWalletAddress)) return;
    const interval = setInterval(() => {
      void loadBalance();
    }, 30000);
    return () => clearInterval(interval);
  }, [account, walletAccount, connectedAccount, manualSignatureWalletAddress, loadBalance]);

  return {
    ...state,
    refreshBalance,
    hasBalance: parseFloat(state.balance) > 0,
    isLoading: state.loading,
  };
};

export const useMultipleFulaBalances = (accounts: string[]) => {
  const [balances, setBalances] = useState<Record<string, FulaBalanceState>>({});
  const { contractService, isReady } = useContractIntegration();

  const loadBalances = useCallback(async () => {
    if (!isReady || !contractService || accounts.length === 0) {
      return;
    }
    try {
      const tokenInfo = await contractService.getFulaTokenInfo();
      const balancePromises = accounts.map(async (account) => {
        try {
          const balance = await contractService.getFulaTokenBalance(account);
          const formattedBalance = parseFloat(balance).toFixed(2);
          return { account, state: { balance, formattedBalance, tokenInfo, loading: false, error: null } as FulaBalanceState };
        } catch (error) {
          return {
            account,
            state: { balance: '0', formattedBalance: '0.00', tokenInfo, loading: false, error: errorText(error, 'Failed to load balance') } as FulaBalanceState,
          };
        }
      });
      const results = await Promise.all(balancePromises);
      const newBalances: Record<string, FulaBalanceState> = {};
      results.forEach(({ account, state }) => {
        newBalances[account] = state;
      });
      setBalances(newBalances);
    } catch (error) {
      console.error('Error loading multiple FULA balances:', error);
      const errorMessage = errorText(error, 'Failed to load balances');
      const errorBalances: Record<string, FulaBalanceState> = {};
      accounts.forEach((account) => {
        errorBalances[account] = { balance: '0', formattedBalance: '0.00', tokenInfo: null, loading: false, error: errorMessage };
      });
      setBalances(errorBalances);
    }
  }, [isReady, contractService, accounts]);

  useEffect(() => {
    if (isReady && contractService && accounts.length > 0) {
      void loadBalances();
    }
  }, [isReady, contractService, accounts, loadBalances]);

  return {
    balances,
    refreshBalances: loadBalances,
    loading: Object.values(balances).some((b) => b.loading),
    hasAnyBalance: Object.values(balances).some((b) => parseFloat(b.balance) > 0),
  };
};

export const useFormattedFulaBalance = (account?: string) => {
  const { balance, formattedBalance, tokenInfo, loading, error } = useFulaBalance(account);

  const formatBalance = useCallback((value: string, decimals: number = 2) => {
    const num = parseFloat(value);
    if (num === 0) return '0.00';
    if (num < 0.01) return '< 0.01';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(decimals);
  }, []);

  return {
    balance,
    formattedBalance,
    displayBalance: formatBalance(balance),
    shortBalance: formatBalance(balance, 1),
    tokenSymbol: tokenInfo?.symbol || 'FULA',
    tokenName: tokenInfo?.name || 'FULA Token',
    loading,
    error,
  };
};

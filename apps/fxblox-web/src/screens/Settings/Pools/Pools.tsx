/**
 * Port of apps/box/src/screens/Settings/Pools.screen.tsx. Also the master column of `PoolsLayout` at ≥ 1280px
 * (the open pool gets a `selected` ring via the shared route params). Search + Refresh + list/grid toggle
 * (`FxHeader`), skeletons while loading, `PoolCard` per pool with the same join / cancel / leave / re-send /
 * force-rejoin logic. Web differences: leave and cancel are CONTRACT-ONLY (pools.fx.land has no /leave or
 * /cancel) and confirm first, naming the chain and a gas note on Base; the notifee foreground service around
 * the leave transaction is gone (toasts only). The mobile screen's unreachable `wrappedJoinPoolViaAPI` /
 * `wrappedJoinPool` / `wrappedLeavePoolViaAPI` / `wrappedCancelJoinRequestViaAPI` wrappers (no UI called
 * them) and the never-read `allowJoin` state are not ported.
 */
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxEmptyState,
  FxHeader,
  FxListSkeleton,
  FxPoolIcon,
  FxRefreshIcon,
  FxText,
  FxTextInput,
  cn,
  useConfirm,
  useIsWide,
  useToast,
} from '@functionland/fx-ui';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { PoolCard } from '@/components/settings/PoolCard';
import { errorMessage, shortAccount } from '@/components/settings/format';
import { CurrentBloxIndicator } from '@/components/CurrentBloxIndicator';
import { usePoolsWithFallback } from '@/hooks/usePoolsWithFallback';
import { useWalletNetwork } from '@/hooks/useWalletNetwork';
import { useLogger } from '@/hooks/useLogger';
import type { PoolData } from '@/hooks/usePools';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { CHAIN_DISPLAY_NAMES } from '@/contracts/config';
import type { SupportedChain } from '@/contracts/types';
import type { TPool } from '@/models';

/** Initial-load grace period before "wallet not connected" warnings may show (mobile: 5 s). */
export const INITIAL_LOAD_TIMEOUT_MS = 5000;

/** `PoolData` (contracts `PoolInfo` + join flags) → the `TPool` shape the card renders. */
export const toTPool = (pool: PoolData): TPool => ({
  poolID: pool.poolID ?? pool.poolId,
  owner: pool.creator ?? '',
  region: pool.region,
  name: pool.name,
  parent: pool.parent,
  participants: pool.participants ?? [],
});

const poolIdOf = (pool: PoolData): string => pool.poolID ?? pool.poolId;

/** Message for the leave / cancel confirmations: chain name + a gas note on Base. */
export function chainActionMessage(
  t: (key: string, opts?: Record<string, unknown>) => string,
  key: 'leaveConfirm' | 'cancelConfirm',
  name: string,
  chain: SupportedChain,
): string {
  const base = t(`settings.pools.${key}.message`, { name, chain: CHAIN_DISPLAY_NAMES[chain] });
  return chain === 'base' ? `${base}\n\n${t('settings.pools.leaveConfirm.gasNote')}` : base;
}

export default function Pools() {
  const { t } = useTranslation();
  const isWide = useIsWide();
  const { poolId: selectedPoolId } = useParams<{ poolId?: string }>();
  const [isList, setIsList] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState(true);
  const [search, setSearch] = useState<string>('');
  const [hasInitialLoadCompleted, setHasInitialLoadCompleted] = useState<boolean>(false);
  const logger = useLogger();
  const { queueToast } = useToast();
  const { confirm } = useConfirm();
  const {
    pools,
    error: poolsError,
    enableInteraction,
    leavePool,
    cancelJoinRequest,
    loadPools,
    isReady: contractReady,
    connectedAccount,
    userMemberPools,
    userActiveRequests,
  } = usePoolsWithFallback();
  const selectedChain = useSettingsStore((state) => state.selectedChain);
  const { withCorrectNetwork } = useWalletNetwork();

  // Latest values for the async `reloading` (the effect below keys on `refreshing` only, as on mobile).
  const latest = useRef({
    connectedAccount,
    loadPools,
    hasInitialLoadCompleted,
    enableInteraction,
  });
  latest.current = { connectedAccount, loadPools, hasInitialLoadCompleted, enableInteraction };

  // Mark the initial load completed after a reasonable delay so warnings can show even if contract
  // initialization fails.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!hasInitialLoadCompleted) setHasInitialLoadCompleted(true);
    }, INITIAL_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [hasInitialLoadCompleted]);

  const reloading = async () => {
    const {
      connectedAccount: account,
      loadPools: load,
      hasInitialLoadCompleted: loaded,
    } = latest.current;
    try {
      if (account) {
        await load();
        if (!loaded) setHasInitialLoadCompleted(true);
      } else if (loaded) {
        // Only warn once the initial loading phase is over.
        queueToast({
          type: 'warning',
          title: t('settings.pools.walletNotConnected.title'),
          message: t('settings.pools.walletNotConnected.message'),
        });
      }
    } catch (e) {
      setIsError(true);
      console.error('Error getting pools: ', e);
      queueToast({
        type: 'error',
        title: t('settings.pools.errorGettingPools'),
        message: errorMessage(e, t('settings.common.unknownError')),
      });
      logger.logError('Pools::reloading', e);
      if (!loaded) setHasInitialLoadCompleted(true);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setIsError(false);
    if (refreshing) void reloading();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshing]);

  // Load pools when we have an account (wallet or manual-signature fallback).
  useEffect(() => {
    if (!refreshing && connectedAccount) setRefreshing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedAccount]);

  const handlePoolActionErrors = (title: string, message: string) => {
    console.log(title, message);
    queueToast({ type: 'error', title, message });
    logger.logError('Pools action error: ', message);
  };

  const notReady = () => {
    queueToast({
      type: 'error',
      title: t('pools.contractNotReady'),
      message: t('pools.connectWalletMessage'),
      autoHideDuration: 4000,
    });
  };

  const poolName = (poolID: number): string =>
    pools.find((p) => poolIdOf(p) === String(poolID))?.name ?? String(poolID);

  /** Contract-only leave (plan): confirm (chain + gas note on Base) → `withCorrectNetwork` → `leavePool`. */
  const wrappedLeavePool = async (poolID: number) => {
    try {
      if (!contractReady) {
        notReady();
        return;
      }
      const ok = await confirm({
        title: t('settings.pools.leaveConfirm.title'),
        message: chainActionMessage(t, 'leaveConfirm', poolName(poolID), selectedChain),
        confirmText: t('settings.pools.leaveConfirm.confirm'),
        cancelText: t('settings.common.cancel'),
        destructive: true,
      });
      if (!ok) return;

      console.log('wrappedLeavePool: Starting leave pool transaction...', { poolID });
      queueToast({
        type: 'info',
        title: t('pools.leavingPool'),
        message: t('pools.confirmTransactionInWallet'),
        autoHideDuration: 3000,
      });

      const result = await withCorrectNetwork(async () => leavePool(poolID.toString()));

      if (result !== null) {
        console.log('wrappedLeavePool: Transaction successful, now refreshing pools...');
        queueToast({
          type: 'success',
          title: t('pools.leftPoolSuccess'),
          message: t('pools.leftPoolSuccessMessage'),
          autoHideDuration: 4000,
        });
        setRefreshing(true);
      } else {
        console.warn('wrappedLeavePool: Leave pool returned null');
        queueToast({
          type: 'warning',
          title: t('pools.transactionCancelled'),
          message: t('pools.leavePoolCancelledMessage'),
          autoHideDuration: 4000,
        });
      }
    } catch (error) {
      console.error('wrappedLeavePool: Error occurred:', error);
      let errorTitle = t('pools.leavePoolError');
      let message = t('pools.leavePoolErrorMessage');
      const raw = errorMessage(error, '');
      if (raw) {
        if (raw.includes('User denied') || raw.includes('rejected')) {
          errorTitle = t('pools.transactionRejected');
          message = t('pools.transactionRejectedMessage');
        } else if (raw.includes('insufficient funds')) {
          errorTitle = t('pools.insufficientFunds');
          message = t('pools.insufficientFundsMessage');
        } else if (raw.includes('NETWORK_SWITCH_REQUIRED')) {
          errorTitle = t('settings.pools.networkSwitchRequired.title');
          message = t('settings.pools.networkSwitchRequired.message');
        } else if (raw.includes('network')) {
          errorTitle = t('pools.networkError');
          message = t('pools.networkErrorMessage');
        } else {
          message = raw;
        }
      }
      queueToast({ type: 'error', title: errorTitle, message, autoHideDuration: 5000 });
      logger.logError('wrappedLeavePool', error);
    }
  };

  /** Contract-only cancel (plan): confirm → `cancelJoinRequest` on the pool contract. */
  const wrappedCancelJoinPool = async (poolID: number) => {
    try {
      if (!contractReady) {
        notReady();
        return;
      }
      const ok = await confirm({
        title: t('settings.pools.cancelConfirm.title'),
        message: chainActionMessage(t, 'cancelConfirm', poolName(poolID), selectedChain),
        confirmText: t('settings.pools.cancelConfirm.confirm'),
        cancelText: t('settings.pools.cancelConfirm.keep'),
        destructive: true,
      });
      if (!ok) return;

      setRefreshing(true);
      const result = await cancelJoinRequest(poolID.toString());
      if (result !== null) {
        queueToast({
          type: 'success',
          title: t('settings.pools.joinRequestCancelled.title'),
          message: t('settings.pools.joinRequestCancelled.message'),
        });
      }
    } catch (e) {
      handlePoolActionErrors(t('settings.pools.errorCancelling'), errorMessage(e));
    } finally {
      setRefreshing(false);
    }
  };

  const refresh = () => {
    setSearch('');
    setRefreshing(true);
  };

  const filtered = pools.filter((pool) =>
    search !== '' ? (pool.name ?? '').toLowerCase().includes(search.toLowerCase()) : true,
  );
  const showError = isError || (!!poolsError && pools.length === 0 && !refreshing);

  if (showError) {
    return (
      <SettingsScreen title={t('settings.pools.title')} screen="pools" wide>
        <FxEmptyState
          icon={<FxPoolIcon />}
          title={t('settings.pools.errorLoading')}
          description={poolsError ?? undefined}
          action={
            <FxButton iconLeft={<FxRefreshIcon />} onPress={refresh} testID="pools-retry">
              {t('settings.pools.retry')}
            </FxButton>
          }
        />
      </SettingsScreen>
    );
  }

  return (
    <SettingsScreen title={t('settings.pools.title')} screen="pools" wide>
      {/* Chain and contract status */}
      <FxBox
        marginBottom="16"
        padding="12"
        backgroundColor="backgroundSecondary"
        borderRadius="m"
        testID="pools-network-status"
      >
        <FxText variant="bodyMediumRegular" marginBottom="8">
          {t('settings.pools.networkStatus')}
        </FxText>
        <FxBox flexDirection="row" alignItems="center" justifyContent="space-between" gap="8">
          <FxBox flexDirection="row" alignItems="center" minWidth={0}>
            <FxBox
              width={8}
              height={8}
              borderRadius="s"
              backgroundColor={contractReady ? 'greenBase' : 'errorBase'}
              marginRight="8"
              flexShrink={0}
            />
            <FxText variant="bodySmallRegular" numberOfLines={1}>
              {CHAIN_DISPLAY_NAMES[selectedChain]}
            </FxText>
          </FxBox>
          <FxText variant="bodyXSRegular" color={contractReady ? 'greenBase' : 'errorBase'}>
            {contractReady ? t('settings.pools.connected') : t('settings.pools.disconnected')}
          </FxText>
        </FxBox>
        {connectedAccount && (
          <FxText variant="bodyXSRegular" color="content2" marginTop="4" title={connectedAccount}>
            {t('settings.pools.account', { account: shortAccount(connectedAccount) })}
          </FxText>
        )}
      </FxBox>

      <FxBox marginBottom="16">
        <CurrentBloxIndicator compact showConnectionStatus />
      </FxBox>

      <FxTextInput
        placeholder={t('settings.pools.searchPlaceholder')}
        aria-label={t('settings.pools.searchPlaceholder')}
        type="search"
        onChangeText={(query) => setSearch(query ?? '')}
        value={search}
        marginBottom="12"
        testID="pools-search"
      />
      <FxHeader marginBottom="16" isList={isList} setIsList={setIsList}>
        <FxButton
          variant="inverted"
          iconLeft={<FxRefreshIcon />}
          onPress={refresh}
          disabled={refreshing}
          testID="pools-refresh"
        >
          {t('settings.pools.refresh')}
        </FxButton>
      </FxHeader>

      {refreshing ? (
        <FxListSkeleton rows={5} lines={3} avatar={false} label={t('settings.pools.loading')} />
      ) : filtered.length === 0 ? (
        <FxEmptyState
          icon={<FxPoolIcon />}
          title={t('settings.pools.empty')}
          description={t('settings.pools.emptyHint')}
          compact
          testID="pools-empty"
        />
      ) : (
        <ul
          className={cn(
            'm-0 grid list-none gap-4 p-0',
            !isList && !isWide && 'desktop:grid-cols-2',
          )}
          aria-label={t('settings.pools.title')}
          data-testid="pools-list"
        >
          {filtered.map((pool) => {
            const id = poolIdOf(pool);
            const userIsMember = userMemberPools.includes(id);
            const hasActiveJoinRequest = userActiveRequests.includes(id);
            return (
              <li key={id} className="min-w-0">
                <PoolCard
                  pool={toTPool(pool)}
                  isDetailed={!isList}
                  isRequested={pool.requested || hasActiveJoinRequest}
                  isJoined={pool.joined || userIsMember}
                  numVotes={pool.numVotes}
                  numVoters={pool.numVoters}
                  leavePool={wrappedLeavePool}
                  cancelJoinPool={wrappedCancelJoinPool}
                  selected={selectedPoolId === id}
                  marginTop="0"
                />
              </li>
            );
          })}
        </ul>
      )}
      {isWide && selectedPoolId === undefined && (
        <FxText variant="bodyXSRegular" color="content3" marginTop="16" textAlign="center">
          {t('shell.pools.selectHint')}
        </FxText>
      )}
    </SettingsScreen>
  );
}

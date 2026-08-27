/**
 * Port of apps/box/src/screens/Settings/PoolDetails.screen.tsx (route /settings/pools/:poolId — the detail
 * column of `PoolsLayout` at ≥ 1280px). Members via `contractService.getPoolMembers` (falls back to the pool's
 * `participants` from the RPC read when there is no contract service, e.g. manual signature), region /
 * network / membership rows, Join (join server), Leave (`destructive`; CONTRACT-ONLY on web — the mobile
 * `leavePoolViaAPI` route does not exist — with a chain + gas note), Force Rejoin, Refresh.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxCard,
  FxEmptyState,
  FxIconButton,
  FxListSkeleton,
  FxPoolIcon,
  FxRefreshIcon,
  FxSpacer,
  FxText,
  useConfirm,
  useIsWide,
  useToast,
} from '@functionland/fx-ui';
import { paths } from '@/app/paths';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { errorMessage, shortAccount } from '@/components/settings/format';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { usePoolsWithFallback } from '@/hooks/usePoolsWithFallback';
import { useWalletNetwork } from '@/hooks/useWalletNetwork';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { usePoolsStore } from '@/stores/usePoolsStore';
import { CHAIN_DISPLAY_NAMES } from '@/contracts/config';

export default function PoolDetails() {
  const { poolId = '' } = useParams<{ poolId: string }>();
  const { t } = useTranslation();
  const { queueToast } = useToast();
  const { confirm } = useConfirm();
  const { back, navigate } = useAppNavigate();
  const isWide = useIsWide();

  const [refreshing, setRefreshing] = useState(false);
  const [poolMembers, setPoolMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [listSettled, setListSettled] = useState(false);
  const seenLoading = useRef(false);

  const {
    pools,
    loading: poolsLoading,
    contractService,
    isReady,
    connectedAccount,
    userMemberPools,
    leavePool,
    joinPoolViaAPI,
  } = usePoolsWithFallback();
  const { withCorrectNetwork } = useWalletNetwork();
  const selectedChain = useSettingsStore((state) => state.selectedChain);
  const forceRejoinPool = usePoolsStore((state) => state.forceRejoinPool);

  const pool = pools.find((p) => p.poolID === poolId || p.poolId === poolId);
  const userIsMember = userMemberPools.includes(poolId);

  // "Pool not found" only after the list has loaded once (or when nothing will ever load it).
  useEffect(() => {
    if (poolsLoading) seenLoading.current = true;
    else if (seenLoading.current) setListSettled(true);
  }, [poolsLoading]);

  const loadPoolDetails = useCallback(async () => {
    if (!contractService) return;
    setLoading(true);
    try {
      const members = await contractService.getPoolMembers(poolId);
      setPoolMembers(members);
    } catch (error) {
      console.error('Error loading pool details:', error);
      queueToast({
        type: 'error',
        title: t('settings.poolDetails.loadError.title'),
        message: t('settings.poolDetails.loadError.message'),
      });
    } finally {
      setLoading(false);
    }
  }, [contractService, poolId, queueToast, t]);

  useEffect(() => {
    if (isReady && contractService && poolId) void loadPoolDetails();
  }, [isReady, contractService, poolId, loadPoolDetails]);

  // No contract service (manual signature / wallet not connected): members from the RPC read.
  useEffect(() => {
    if (!contractService && pool) {
      setPoolMembers(pool.participants ?? []);
      setLoading(false);
    }
  }, [contractService, pool]);

  const handleJoinPool = async () => {
    if (!pool) return;
    const ok = await confirm({
      title: t('settings.poolDetails.joinConfirm.title'),
      message: t('settings.poolDetails.joinConfirm.message', {
        name: pool.name,
        chain: CHAIN_DISPLAY_NAMES[selectedChain],
      }),
      confirmText: t('settings.poolDetails.joinConfirm.confirm'),
      cancelText: t('settings.common.cancel'),
    });
    if (!ok) return;
    setRefreshing(true);
    try {
      const result = await joinPoolViaAPI(poolId, pool.name);
      if (result.success) {
        queueToast({
          type: 'success',
          title: t('settings.poolDetails.joinSent.title'),
          message: result.message,
        });
        await loadPoolDetails();
      } else {
        queueToast({
          type: 'error',
          title: t('settings.poolDetails.joinFailed.title'),
          message: result.message,
        });
      }
    } catch {
      queueToast({
        type: 'error',
        title: t('settings.common.error'),
        message: t('settings.poolDetails.joinFailed.message'),
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleLeavePool = async () => {
    if (!pool) return;
    const message = t('settings.poolDetails.leaveConfirm.message', {
      name: pool.name,
      chain: CHAIN_DISPLAY_NAMES[selectedChain],
    });
    const ok = await confirm({
      title: t('settings.poolDetails.leaveConfirm.title'),
      message:
        selectedChain === 'base'
          ? `${message}\n\n${t('settings.poolDetails.leaveConfirm.gasNote')}`
          : message,
      confirmText: t('settings.poolDetails.leaveConfirm.confirm'),
      cancelText: t('settings.common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setRefreshing(true);
    try {
      const result = await withCorrectNetwork(async () => leavePool(poolId));
      if (result !== null) {
        queueToast({
          type: 'success',
          title: t('settings.poolDetails.leftPool.title'),
          message: t('settings.poolDetails.leftPool.message'),
        });
        back(paths.settings.pools);
      } else {
        queueToast({
          type: 'error',
          title: t('settings.poolDetails.leaveFailed.title'),
          message: t('settings.poolDetails.leaveFailed.message'),
        });
      }
    } catch (error) {
      queueToast({
        type: 'error',
        title: t('settings.poolDetails.leaveFailed.title'),
        message: errorMessage(error, t('settings.poolDetails.leaveFailed.message')),
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleForceRejoin = async () => {
    if (!pool) return;
    setRefreshing(true);
    try {
      await forceRejoinPool(parseInt(poolId, 10));
      queueToast({
        type: 'success',
        title: t('settings.poolCard.rejoined.title'),
        message: t('settings.poolCard.rejoined.message', { id: poolId }),
      });
    } catch (error) {
      queueToast({
        type: 'error',
        title: t('settings.poolCard.rejoinFailed.title'),
        message: errorMessage(error, t('settings.poolCard.rejoinFailed.message')),
      });
    } finally {
      setRefreshing(false);
    }
  };

  const screenProps = {
    screen: 'pool-details',
    backTo: paths.settings.pools,
    backOnDesktop: !isWide,
  } as const;

  if (!pool) {
    // Settled: the list finished a load cycle here, nothing will ever load it (no account), or a list is
    // already loaded (this pool simply is not in it).
    const settled = listSettled || !connectedAccount || (!poolsLoading && pools.length > 0);
    return (
      <SettingsScreen
        title={t('settings.poolDetails.title')}
        subtitle={t('settings.poolDetails.poolId') + ': ' + poolId}
        {...screenProps}
      >
        {settled ? (
          <FxEmptyState
            icon={<FxPoolIcon />}
            title={t('settings.poolDetails.notFound')}
            description={t('settings.poolDetails.notFoundHint')}
            testID="pool-not-found"
          />
        ) : (
          <FxListSkeleton rows={3} avatar={false} label={t('settings.pools.loading')} />
        )}
      </SettingsScreen>
    );
  }

  return (
    <SettingsScreen
      title={pool.name}
      subtitle={`${t('settings.poolDetails.poolId')}: ${poolId}`}
      actions={
        <FxIconButton
          aria-label={t('settings.poolDetails.refresh')}
          icon={<FxRefreshIcon />}
          loading={refreshing}
          onPress={() => void loadPoolDetails()}
          testID="pool-details-refresh"
        />
      }
      {...screenProps}
    >
      <FxCard marginBottom="16" testID="pool-details-card">
        <FxCard.Title>{pool.name}</FxCard.Title>
        <FxSpacer marginTop="16" />
        <FxCard.Row>
          <FxCard.Row.Title>{t('settings.poolDetails.poolId')}</FxCard.Row.Title>
          <FxCard.Row.Data>{poolId}</FxCard.Row.Data>
        </FxCard.Row>
        <FxCard.Row>
          <FxCard.Row.Title>{t('settings.poolDetails.region')}</FxCard.Row.Title>
          <FxCard.Row.Data>{pool.region}</FxCard.Row.Data>
        </FxCard.Row>
        <FxCard.Row>
          <FxCard.Row.Title>{t('settings.poolDetails.network')}</FxCard.Row.Title>
          <FxCard.Row.Data>{CHAIN_DISPLAY_NAMES[selectedChain]}</FxCard.Row.Data>
        </FxCard.Row>
        <FxCard.Row>
          <FxCard.Row.Title>{t('settings.poolDetails.members')}</FxCard.Row.Title>
          <FxCard.Row.Data>{poolMembers.length}</FxCard.Row.Data>
        </FxCard.Row>
        {pool.maxMembers ? (
          <FxCard.Row>
            <FxCard.Row.Title>{t('settings.poolDetails.maxMembers')}</FxCard.Row.Title>
            <FxCard.Row.Data>{pool.maxMembers}</FxCard.Row.Data>
          </FxCard.Row>
        ) : null}
        {pool.requiredTokens ? (
          <FxCard.Row>
            <FxCard.Row.Title>{t('settings.poolDetails.requiredTokens')}</FxCard.Row.Title>
            <FxCard.Row.Data>
              {t('settings.poolDetails.fula', { amount: pool.requiredTokens })}
            </FxCard.Row.Data>
          </FxCard.Row>
        ) : null}
      </FxCard>

      <FxBox flexDirection="row" flexWrap="wrap" gap="8" marginBottom="16">
        {userIsMember ? (
          <>
            <FxButton
              onPress={() => void handleLeavePool()}
              variant="destructive"
              disabled={refreshing}
              testID="pool-details-leave"
            >
              {t('settings.poolDetails.leavePool')}
            </FxButton>
            <FxButton
              onPress={() => void handleForceRejoin()}
              disabled={refreshing}
              testID="pool-details-force-rejoin"
            >
              {t('settings.poolDetails.forceRejoin')}
            </FxButton>
            <FxButton
              variant="inverted"
              onPress={() => void navigate(paths.settings.joinRequests(poolId))}
              testID="pool-details-join-requests"
            >
              {t('settings.poolDetails.joinRequests')}
            </FxButton>
          </>
        ) : (
          <FxButton
            onPress={() => void handleJoinPool()}
            iconLeft={<FxPoolIcon />}
            disabled={refreshing}
            testID="pool-details-join"
          >
            {t('settings.poolDetails.joinPool')}
          </FxButton>
        )}
      </FxBox>

      <FxCard marginBottom="16" testID="pool-details-members">
        <FxCard.Title>
          {t('settings.poolDetails.membersCount', { count: poolMembers.length })}
        </FxCard.Title>
        <FxSpacer marginTop="16" />
        {loading ? (
          <FxListSkeleton rows={3} avatar={false} label={t('settings.pools.loading')} />
        ) : poolMembers.length > 0 ? (
          <ul className="m-0 list-none p-0">
            {poolMembers.map((member) => (
              <li key={member} className="mb-2">
                <FxText variant="bodySmallRegular" className="font-mono" title={member}>
                  {shortAccount(member)}
                  {connectedAccount && member.toLowerCase() === connectedAccount.toLowerCase()
                    ? t('settings.poolDetails.you')
                    : ''}
                </FxText>
              </li>
            ))}
          </ul>
        ) : (
          <FxText variant="bodySmallRegular" color="content2">
            {t('settings.poolDetails.noMembers')}
          </FxText>
        )}
      </FxCard>

      {userIsMember && (
        <FxCard testID="pool-details-join-requests-card">
          <FxCard.Title>{t('settings.poolDetails.joinRequests')}</FxCard.Title>
          <FxSpacer marginTop="16" />
          <FxText variant="bodySmallRegular" color="content2">
            {t('settings.poolDetails.joinRequestsComingSoon')}
          </FxText>
        </FxCard>
      )}
    </SettingsScreen>
  );
}

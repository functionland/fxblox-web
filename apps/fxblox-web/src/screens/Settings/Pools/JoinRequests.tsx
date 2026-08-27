/**
 * Port of apps/box/src/screens/Settings/JoinRequests.screen.tsx (route /settings/pools/:poolId/join-requests).
 * The list is still the mobile placeholder (the contract service has no `getJoinRequests`); voting goes through
 * `voteJoinRequest(poolId, requestPeerId, voterClusterPeerId, approve)` (the web contract signature — mobile
 * passed the account and let the hook fill the rest).
 */
import { useCallback, useEffect, useState } from 'react';
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
import { usePoolsWithFallback } from '@/hooks/usePoolsWithFallback';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useBloxsStore } from '@/stores/useBloxsStore';
import { CHAIN_DISPLAY_NAMES } from '@/contracts/config';

export interface JoinRequestItem {
  account: string;
  poolId: string;
  timestamp: number;
  approvals: number;
  rejections: number;
  /** 1 = pending, 2 = approved, 3 = rejected / cancelled */
  status: number;
  peerId: string;
}

export default function JoinRequests() {
  const { poolId = '' } = useParams<{ poolId: string }>();
  const { t, i18n } = useTranslation();
  const { queueToast } = useToast();
  const { confirm } = useConfirm();
  const isWide = useIsWide();

  const [refreshing, setRefreshing] = useState(false);
  const [joinRequests, setJoinRequests] = useState<JoinRequestItem[]>([]);
  const [loading, setLoading] = useState(true);

  const { pools, contractService, isReady, userMemberPools, voteJoinRequest } =
    usePoolsWithFallback();
  const selectedChain = useSettingsStore((state) => state.selectedChain);
  const clusterPeerId = useBloxsStore((state) => state.getCurrentClusterPeerId());
  const pool = pools.find((p) => p.poolID === poolId || p.poolId === poolId);
  const userIsMember = userMemberPools.includes(poolId);

  const loadJoinRequests = useCallback(async () => {
    if (!contractService) return;
    setLoading(true);
    try {
      // Placeholder until the contract service exposes join requests: `contractService.getJoinRequests(poolId)`.
      setJoinRequests([]);
    } catch (error) {
      console.error('Error loading join requests:', error);
      queueToast({
        type: 'error',
        title: t('settings.joinRequests.loadError.title'),
        message: t('settings.joinRequests.loadError.message'),
      });
    } finally {
      setLoading(false);
    }
  }, [contractService, queueToast, t]);

  useEffect(() => {
    if (isReady && contractService && poolId && userIsMember) void loadJoinRequests();
    else if (!contractService) setLoading(false);
  }, [isReady, contractService, poolId, userIsMember, loadJoinRequests]);

  const handleVote = async (request: JoinRequestItem, approve: boolean) => {
    const ok = await confirm({
      title: t('settings.joinRequests.voteConfirm.title'),
      message: approve
        ? t('settings.joinRequests.voteConfirm.approveMessage')
        : t('settings.joinRequests.voteConfirm.rejectMessage'),
      confirmText: approve
        ? t('settings.joinRequests.voteConfirm.approve')
        : t('settings.joinRequests.voteConfirm.reject'),
      cancelText: t('settings.common.cancel'),
      destructive: !approve,
    });
    if (!ok) return;
    setRefreshing(true);
    try {
      const result = await voteJoinRequest(poolId, request.peerId, clusterPeerId ?? '', approve);
      if (result !== null) {
        queueToast({
          type: 'success',
          title: t('settings.joinRequests.voteSubmitted.title'),
          message: approve
            ? t('settings.joinRequests.voteSubmitted.approved')
            : t('settings.joinRequests.voteSubmitted.rejected'),
        });
        await loadJoinRequests();
      }
    } catch {
      queueToast({
        type: 'error',
        title: t('settings.joinRequests.voteFailed.title'),
        message: t('settings.joinRequests.voteFailed.message'),
      });
    } finally {
      setRefreshing(false);
    }
  };

  const screenProps = {
    screen: 'join-requests',
    backTo: poolId ? paths.settings.pool(poolId) : paths.settings.pools,
    backOnDesktop: !isWide,
  } as const;

  if (!userIsMember) {
    return (
      <SettingsScreen title={t('settings.poolDetails.joinRequests')} {...screenProps}>
        <FxEmptyState
          icon={<FxPoolIcon />}
          title={t('settings.joinRequests.accessDenied')}
          description={t('settings.joinRequests.accessDeniedHint')}
          testID="join-requests-denied"
        />
      </SettingsScreen>
    );
  }

  if (!pool) {
    return (
      <SettingsScreen title={t('settings.poolDetails.joinRequests')} {...screenProps}>
        <FxEmptyState
          icon={<FxPoolIcon />}
          title={t('settings.joinRequests.notFound')}
          testID="join-requests-not-found"
        />
      </SettingsScreen>
    );
  }

  return (
    <SettingsScreen
      title={t('settings.joinRequests.title', { name: pool.name })}
      subtitle={t('settings.joinRequests.subtitle', {
        id: poolId,
        chain: CHAIN_DISPLAY_NAMES[selectedChain],
      })}
      actions={
        <FxIconButton
          aria-label={t('settings.joinRequests.refresh')}
          icon={<FxRefreshIcon />}
          loading={refreshing}
          onPress={() => void loadJoinRequests()}
          testID="join-requests-refresh"
        />
      }
      {...screenProps}
    >
      {loading ? (
        <FxListSkeleton rows={3} avatar={false} label={t('settings.pools.loading')} />
      ) : joinRequests.length > 0 ? (
        joinRequests.map((request, index) => (
          <FxCard key={`${request.account}-${index}`} marginBottom="16">
            <FxBox flex={1}>
              <FxText variant="bodyMediumRegular" marginBottom="8">
                {t('settings.joinRequests.request', { n: index + 1 })}
              </FxText>
              <FxText variant="bodySmallRegular" color="content2" marginBottom="4">
                {t('settings.joinRequests.account', {
                  account: `${request.account.slice(0, 6)}...${request.account.slice(-4)}`,
                })}
              </FxText>
              <FxText variant="bodySmallRegular" color="content2" marginBottom="4">
                {t('settings.joinRequests.peerId', {
                  peerId: `${request.peerId.slice(0, 8)}...${request.peerId.slice(-8)}`,
                })}
              </FxText>
              <FxText variant="bodySmallRegular" color="content2" marginBottom="8">
                {t('settings.joinRequests.submitted', {
                  date: new Date(request.timestamp * 1000).toLocaleDateString(i18n.language),
                })}
              </FxText>

              <FxBox flexDirection="row" marginBottom="16" gap="16">
                <FxText variant="bodyXSRegular" color="greenBase">
                  {t('settings.joinRequests.approvals', { n: request.approvals })}
                </FxText>
                <FxText variant="bodyXSRegular" color="errorBase">
                  {t('settings.joinRequests.rejections', { n: request.rejections })}
                </FxText>
              </FxBox>

              {request.status === 1 && (
                <FxBox flexDirection="row" gap="8">
                  <FxButton
                    onPress={() => void handleVote(request, true)}
                    size="small"
                    variant="inverted"
                  >
                    {t('settings.joinRequests.approve')}
                  </FxButton>
                  <FxButton
                    onPress={() => void handleVote(request, false)}
                    size="small"
                    variant="inverted"
                  >
                    {t('settings.joinRequests.reject')}
                  </FxButton>
                </FxBox>
              )}
              {request.status === 2 && (
                <FxText variant="bodySmallRegular" color="greenBase">
                  {t('settings.joinRequests.statusApproved')}
                </FxText>
              )}
              {request.status === 3 && (
                <FxText variant="bodySmallRegular" color="errorBase">
                  {t('settings.joinRequests.statusRejected')}
                </FxText>
              )}
            </FxBox>
          </FxCard>
        ))
      ) : (
        <FxCard testID="join-requests-empty">
          <FxBox padding="20" alignItems="center">
            <FxText variant="bodyLargeRegular" marginBottom="8">
              {t('settings.joinRequests.none')}
            </FxText>
            <FxText variant="bodySmallRegular" color="content2" textAlign="center">
              {t('settings.joinRequests.noneHint')}
            </FxText>
          </FxBox>
        </FxCard>
      )}

      {/* Development placeholder */}
      <FxCard marginTop="16">
        <FxBox padding="16" backgroundColor="backgroundSecondary" borderRadius="m">
          <FxText variant="bodySmallRegular" color="content2" textAlign="center">
            {t('settings.joinRequests.devNote')}
          </FxText>
        </FxBox>
      </FxCard>
      <FxSpacer marginTop="16" />
    </SettingsScreen>
  );
}

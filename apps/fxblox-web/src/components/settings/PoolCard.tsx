/**
 * Port of apps/box/src/components/Cards/PoolCard.tsx. Same two-step join (1: Blox `joinPool`, 2: contract on
 * PC images / `pools.fx.land/join` otherwise), same persisted `joinState_*` keys (KV adapter), Re-send, the
 * 120 s safety timeout + Cancel, Cancel Request / Leave / Force Rejoin, and the 3-way "Blox Not Registered"
 * dialog (`choose()`; the mobile handlers were empty — on web "Contact Sales" opens mailto:sales@fx.land and
 * "Register Blox" goes to the Users tab). Adds "View details" (→ /settings/pools/:poolId) and a `selected`
 * ring for the desktop master-detail. The account comes from `useAccountWithFallback` (wallet, else the
 * manual-signature address) so manual-signature users can join through the join server, matching
 * `usePoolsWithFallback`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxCard,
  FxPoolIcon,
  FxSpacer,
  FxTag,
  FxText,
  cn,
  useConfirm,
  useToast,
  type FxCardProps,
} from '@functionland/fx-ui';
import type { TPool } from '@/models';
import { paths } from '@/app/paths';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useAccountWithFallback } from '@/hooks/useAccountWithFallback';
import { useWallet } from '@/wallet/useWallet';
import { useBloxsStore } from '@/stores/useBloxsStore';
import { usePoolsStore } from '@/stores/usePoolsStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { PoolApiService } from '@/services/poolApiService';
import { openUrl } from '@/platform/linking';
import { errorMessage } from './format';
import {
  clearJoinState,
  EMPTY_JOIN_STATE,
  loadJoinState,
  saveJoinState,
  type JoinState,
} from './joinState';

export const JOIN_TIMEOUT_MS = 120_000;
export const SALES_MAILTO = 'mailto:sales@fx.land';

export interface PoolCardProps extends Omit<FxCardProps, 'children' | 'onPress'> {
  pool: TPool;
  isDetailed: boolean;
  isRequested: boolean;
  isJoined: boolean;
  numVotes: number;
  numVoters: number;
  leavePool: (poolID: number) => Promise<void>;
  cancelJoinPool: (poolID: number) => Promise<void>;
  /** Overrides the default "View details" navigation (`/settings/pools/:poolId`). */
  onViewDetails?: (poolID: string) => void;
  /** Master-detail: this pool is open in the detail column. */
  selected?: boolean;
}

type NotRegisteredChoice = 'sales' | 'register';

/** A PC (`_amd64`) Blox image joins through the contract directly; Armbian boards go through the join server. */
export function useIsPcBlox(): boolean {
  return useBloxsStore((state) =>
    Boolean(
      state.currentBloxPeerId &&
      state.bloxsPropertyInfo?.[state.currentBloxPeerId]?.containerInfo_fula?.image?.includes(
        '_amd64',
      ),
    ),
  );
}

interface DetailInfoProps {
  pool: TPool;
  isDetailed?: boolean;
  isRequested: boolean;
  isJoined: boolean;
  numVotes: number;
  numVoters: number;
  leavePool: (poolID: number) => Promise<void>;
  cancelJoinPool: (poolID: number) => Promise<void>;
}

function DetailInfo({
  pool,
  isDetailed,
  isRequested,
  isJoined,
  numVotes,
  numVoters,
  leavePool,
  cancelJoinPool,
}: DetailInfoProps) {
  const { t } = useTranslation();
  const { queueToast } = useToast();
  const { confirm, choose } = useConfirm();
  const { navigate } = useAppNavigate();
  const [isJoining, setIsJoining] = useState(false);
  const [joinState, setJoinState] = useState<JoinState>({ ...EMPTY_JOIN_STATE });
  const joinCancelledRef = useRef(false);
  const joinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Monotonic attempt id: Cancel or a newer attempt makes an older in-flight attempt stale (its late results
   *  are ignored — a network / libp2p promise cannot be aborted). */
  const attemptRef = useRef(0);

  const fallbackAccount = useAccountWithFallback();
  const { account: walletAccount } = useWallet();
  const currentBloxPeerId = useBloxsStore((state) => state.currentBloxPeerId);
  const bloxsForCluster = useBloxsStore((state) => state.bloxs);
  const bloxsConnectionStatus = useBloxsStore((state) => state.bloxsConnectionStatus);
  const selectedChain = useSettingsStore((state) => state.selectedChain);
  const isPC = useIsPcBlox();
  // Join-server joins accept the manual-signature address (as `usePoolsWithFallback.joinPoolViaAPI` does); a
  // contract join must sign and pay gas, so the PC path requires the connected wallet account (mobile rule).
  const account = isPC ? (walletAccount ?? null) : fallbackAccount;
  // ipfs-cluster peerID for pool API / contract operations. Never fall back to the kubo peerId — it is wrong
  // for on-chain operations (a stale migration default equal to the kubo id is treated as "unknown").
  const storedClusterPeerId = currentBloxPeerId
    ? bloxsForCluster[currentBloxPeerId]?.clusterPeerId
    : undefined;
  const clusterPeerId =
    storedClusterPeerId && storedClusterPeerId !== currentBloxPeerId
      ? storedClusterPeerId
      : undefined;
  const joinPool = usePoolsStore((state) => state.joinPool);
  const forceRejoinPool = usePoolsStore((state) => state.forceRejoinPool);

  const isBloxConnected = Boolean(
    currentBloxPeerId && bloxsConnectionStatus[currentBloxPeerId] === 'CONNECTED',
  );

  // Load the persisted join state for THIS pool + THIS Blox (changes when the user switches Blox).
  useEffect(() => {
    if (!currentBloxPeerId) return undefined;
    let cancelled = false;
    void loadJoinState(pool.poolID, currentBloxPeerId).then((state) => {
      if (!cancelled) setJoinState(state);
    });
    return () => {
      cancelled = true;
    };
  }, [pool.poolID, currentBloxPeerId]);

  useEffect(
    () => () => {
      if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
    },
    [],
  );

  const persist = useCallback(
    async (state: JoinState) => {
      if (currentBloxPeerId) await saveJoinState(pool.poolID, currentBloxPeerId, state);
    },
    [pool.poolID, currentBloxPeerId],
  );

  const clearPersisted = useCallback(async () => {
    if (currentBloxPeerId) await clearJoinState(pool.poolID, currentBloxPeerId);
  }, [pool.poolID, currentBloxPeerId]);

  const disarmTimeout = () => {
    if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
    joinTimeoutRef.current = null;
  };

  /** Starts an attempt: `isJoining`, the 120 s safety timeout, and a `stale()` probe for the awaits. */
  const beginAttempt = () => {
    joinCancelledRef.current = false;
    const attempt = ++attemptRef.current;
    const stale = () => joinCancelledRef.current || attemptRef.current !== attempt;
    setIsJoining(true);
    disarmTimeout();
    joinTimeoutRef.current = setTimeout(() => {
      if (stale()) return;
      setIsJoining(false);
      queueToast({
        type: 'warning',
        title: t('settings.poolCard.timeout.title'),
        message: t('settings.poolCard.timeout.message'),
      });
    }, JOIN_TIMEOUT_MS);
    const end = () => {
      if (stale()) return;
      disarmTimeout();
      setIsJoining(false);
    };
    return { stale, end };
  };

  /** Step 2 through the contract (PC) or the join server (Armbian). Returns the API transaction hash. */
  const performStep2 = async (): Promise<string | undefined> => {
    if (isPC) {
      console.log('Step 2: Direct contract joinPool (PC mode)...');
      const { getContractService } = await import('@/contracts/contractService');
      const service = getContractService(selectedChain);
      await service.ensureTokenApproval(pool.poolID);
      await service.joinPool(pool.poolID, clusterPeerId);
      console.log('Step 2: Contract joinPool succeeded');
      return undefined;
    }
    console.log('Step 2: Calling API joinPool...');
    const response = await PoolApiService.joinPool({
      peerId: clusterPeerId ?? '',
      kuboPeerId: currentBloxPeerId,
      account: account ?? '',
      chain: selectedChain,
      poolId: parseInt(pool.poolID, 10),
    });
    if (response.status === 'ok') {
      console.log('Step 2: API joinPool succeeded');
      return response.transactionHash;
    }
    throw new Error(response.msg || t('settings.poolCard.joinFailed.requestFailed'));
  };

  const showNotRegistered = async () => {
    const choice = await choose<NotRegisteredChoice>({
      title: t('settings.poolCard.notRegistered.title'),
      message: t('settings.poolCard.notRegistered.message'),
      options: [
        { label: t('settings.poolCard.notRegistered.contactSales'), value: 'sales' },
        { label: t('settings.poolCard.notRegistered.registerBlox'), value: 'register' },
      ],
      cancelText: t('settings.poolCard.notRegistered.ok'),
    });
    if (choice === 'sales') openUrl(SALES_MAILTO);
    else if (choice === 'register') void navigate(paths.users);
  };

  const handleJoinPool = async () => {
    if (!account) {
      queueToast({
        type: 'error',
        title: t('settings.poolCard.walletNotConnected.title'),
        message: t('settings.poolCard.walletNotConnected.message'),
      });
      return;
    }
    if (!currentBloxPeerId) {
      queueToast({
        type: 'error',
        title: t('settings.poolCard.bloxPeerIdMissing.title'),
        message: t('settings.poolCard.bloxPeerIdMissing.message'),
      });
      return;
    }

    // Confirmation copy — for PC, include the required token amount.
    let confirmMessage = t('settings.poolCard.joinConfirm.message', {
      name: pool.name,
      chain: selectedChain,
      blox: currentBloxPeerId,
    });
    if (isPC) {
      try {
        console.log(
          'handleJoinPool: PC mode, fetching required tokens for pool',
          pool.poolID,
          'chain',
          selectedChain,
        );
        const { getContractService } = await import('@/contracts/contractService');
        const { ethers } = await import('ethers');
        const service = getContractService(selectedChain);
        const requiredTokens = await service.getRequiredTokens(pool.poolID);
        console.log('handleJoinPool: requiredTokens result:', requiredTokens);
        confirmMessage = t('settings.poolCard.joinConfirm.pcMessage', {
          name: pool.name,
          tokens: ethers.utils.formatEther(requiredTokens),
        });
      } catch (err) {
        console.error('Failed to get required tokens:', err);
      }
    }

    const ok = await confirm({
      title: t('settings.poolCard.joinConfirm.title'),
      message: confirmMessage,
      confirmText: t('settings.poolCard.joinConfirm.confirm'),
      cancelText: t('settings.common.cancel'),
    });
    if (ok) await performJoinPool();
  };

  const cancelJoining = () => {
    joinCancelledRef.current = true;
    attemptRef.current += 1; // the in-flight attempt is now stale
    disarmTimeout();
    setIsJoining(false);
    queueToast({
      type: 'info',
      title: t('settings.poolCard.cancelled.title'),
      message: t('settings.poolCard.cancelled.message'),
    });
  };

  const performJoinPool = async () => {
    const { stale, end } = beginAttempt();
    const poolId = parseInt(pool.poolID, 10);
    const newJoinState: JoinState = { ...joinState };

    try {
      // Step 1: Blox joinPool (if not already completed)
      if (!joinState.step1Complete) {
        try {
          console.log('Step 1: Calling Blox joinPool method...');
          const response = await joinPool(poolId);
          console.log('Step 1: Blox joinPool response:', response);
          newJoinState.step1Complete = true;
          newJoinState.step1Error = undefined;
          console.log('Step 1: Blox joinPool succeeded');
        } catch (error) {
          console.error('Step 1: Blox joinPool failed:', error);
          newJoinState.step1Error = errorMessage(error);
          // Continue to step 2 even if step 1 fails
        }
      }
      if (stale()) return;

      // Step 2: join the pool
      let apiTransactionHash: string | undefined;
      if (!joinState.step2Complete) {
        try {
          apiTransactionHash = await performStep2();
          newJoinState.step2Complete = true;
          newJoinState.step2Error = undefined;
        } catch (error) {
          console.error('Step 2 failed:', error);
          newJoinState.step2Error = errorMessage(error);
        }
      }
      if (stale()) return;

      setJoinState(newJoinState);
      await persist(newJoinState);

      if (newJoinState.step1Complete && newJoinState.step2Complete) {
        queueToast({
          type: 'success',
          title: t('settings.poolCard.joined_toast.title'),
          message: apiTransactionHash
            ? t('settings.poolCard.joined_toast.transaction', {
                hash: apiTransactionHash.slice(0, 10),
              })
            : t('settings.poolCard.joined_toast.member'),
        });
        await clearPersisted();
      } else if (!newJoinState.step1Complete && newJoinState.step2Complete) {
        queueToast({
          type: 'warning',
          title: t('settings.poolCard.submitted.title'),
          message: t('settings.poolCard.submitted.message'),
        });
      } else if (newJoinState.step1Complete && !newJoinState.step2Complete) {
        queueToast({
          type: 'warning',
          title: t('settings.poolCard.partial.title'),
          message: t('settings.poolCard.partial.message'),
        });
      } else {
        const message =
          newJoinState.step2Error ||
          newJoinState.step1Error ||
          t('settings.poolCard.joinFailed.default');
        if (message.includes('401') || message.includes('not registered')) {
          await showNotRegistered();
        } else {
          queueToast({
            type: 'error',
            title: t('settings.poolCard.joinFailed.title'),
            message,
          });
        }
      }
    } finally {
      end();
    }
  };

  const handleResendJoin = async () => {
    // Only step 2 — step 1 is already complete.
    const { stale, end } = beginAttempt();
    const newJoinState: JoinState = { ...joinState };

    try {
      const apiTransactionHash = await performStep2();
      if (stale()) return;
      newJoinState.step2Complete = true;
      newJoinState.step2Error = undefined;
      setJoinState(newJoinState);
      await persist(newJoinState);
      queueToast({
        type: 'success',
        title: t('settings.poolCard.joined_toast.title'),
        message: apiTransactionHash
          ? t('settings.poolCard.joined_toast.transaction', {
              hash: apiTransactionHash.slice(0, 10),
            })
          : t('settings.poolCard.joined_toast.member'),
      });
      await clearPersisted();
    } catch (error) {
      if (stale()) return;
      const message = errorMessage(error);
      newJoinState.step2Error = message;
      setJoinState(newJoinState);
      await persist(newJoinState);
      queueToast({ type: 'error', title: t('settings.poolCard.resendFailed.title'), message });
    } finally {
      end();
    }
  };

  const resetJoinState = async () => {
    await clearPersisted();
    setJoinState({ ...EMPTY_JOIN_STATE });
  };

  const handleLeave = async () => {
    await leavePool(parseInt(pool.poolID, 10));
    await resetJoinState();
  };

  const handleCancelRequest = async () => {
    await cancelJoinPool(parseInt(pool.poolID, 10));
    await resetJoinState();
  };

  const handleForceRejoin = async () => {
    try {
      await forceRejoinPool(parseInt(pool.poolID, 10));
      queueToast({
        type: 'success',
        title: t('settings.poolCard.rejoined.title'),
        message: t('settings.poolCard.rejoined.message', { id: pool.poolID }),
      });
    } catch (error) {
      console.error('Force rejoin error:', error);
      queueToast({
        type: 'error',
        title: t('settings.poolCard.rejoinFailed.title'),
        message: errorMessage(error, t('settings.poolCard.rejoinFailed.message')),
      });
    }
  };

  const primaryAction = isJoining
    ? cancelJoining
    : joinState.step2Complete
      ? handleLeave
      : joinState.step1Complete && !joinState.step2Complete
        ? handleResendJoin
        : handleJoinPool;

  const primaryLabel = isJoining
    ? t('settings.poolCard.buttons.cancel')
    : joinState.step2Complete
      ? t('settings.poolCard.buttons.leavePool')
      : !isBloxConnected
        ? t('settings.poolCard.buttons.bloxDisconnected')
        : joinState.step1Complete && !joinState.step2Complete
          ? isPC
            ? t('settings.poolCard.buttons.resendContract')
            : t('settings.poolCard.buttons.resendJoin')
          : isPC
            ? t('settings.poolCard.buttons.joinContract')
            : t('settings.poolCard.buttons.join');

  const stateLabel = (complete: boolean) =>
    complete ? t('settings.poolCard.complete') : t('settings.poolCard.pending');

  return (
    <FxBox>
      <FxSpacer marginTop="24" />
      <FxCard.Row>
        <FxCard.Row.Title>{t('settings.poolCard.location')}</FxCard.Row.Title>
        <FxCard.Row.Data>{pool.region}</FxCard.Row.Data>
      </FxCard.Row>

      <FxCard.Row>
        <FxCard.Row.Title>{t('settings.poolCard.bloxStatus')}</FxCard.Row.Title>
        <FxCard.Row.Data>
          {isBloxConnected
            ? t('settings.poolCard.bloxConnected')
            : t('settings.poolCard.bloxDisconnected')}
        </FxCard.Row.Data>
      </FxCard.Row>

      {isJoined && (
        <FxCard.Row>
          <FxCard.Row.Title>{t('settings.poolCard.status')}</FxCard.Row.Title>
          <FxCard.Row.Data>{t('settings.poolCard.joined')}</FxCard.Row.Data>
        </FxCard.Row>
      )}

      {isRequested && !isJoined && (
        <FxCard.Row>
          <FxCard.Row.Title>{t('settings.poolCard.status')}</FxCard.Row.Title>
          <FxCard.Row.Data>
            {t('settings.poolCard.requested', { votes: numVotes, voters: numVoters })}
          </FxCard.Row.Data>
        </FxCard.Row>
      )}

      {/* Join / Leave — state-driven */}
      {isDetailed && !isRequested && (
        <FxButton
          onPress={() => void primaryAction()}
          iconLeft={<FxPoolIcon />}
          disabled={!isJoining && !isBloxConnected && !joinState.step2Complete}
          loading={false}
          testID={`pool-${pool.poolID}-primary`}
          alignSelf="flex-start"
        >
          {primaryLabel}
        </FxButton>
      )}

      {/* Partial join status */}
      {isDetailed &&
        !isJoined &&
        !isRequested &&
        (joinState.step1Complete || joinState.step2Complete) && (
          <FxBox
            marginTop="8"
            padding="8"
            backgroundColor="backgroundSecondary"
            borderRadius="s"
            testID={`pool-${pool.poolID}-join-status`}
          >
            <FxText variant="bodyXSRegular" color="content2">
              {t('settings.poolCard.joinStatus')}
            </FxText>
            <FxText
              variant="bodyXSRegular"
              color={joinState.step1Complete ? 'greenBase' : 'errorBase'}
            >
              {t('settings.poolCard.bloxConfiguration', {
                state: stateLabel(joinState.step1Complete),
              })}
            </FxText>
            {joinState.step1Error && (
              <FxText variant="bodyXSRegular" color="errorBase" marginTop="4">
                {t('settings.poolCard.bloxError', { error: joinState.step1Error })}
              </FxText>
            )}
            <FxText
              variant="bodyXSRegular"
              color={joinState.step2Complete ? 'greenBase' : 'errorBase'}
            >
              {t('settings.poolCard.poolRegistration', {
                state: stateLabel(joinState.step2Complete),
              })}
            </FxText>
            {joinState.step2Error && (
              <FxText variant="bodyXSRegular" color="errorBase" marginTop="4">
                {t('settings.poolCard.apiError', { error: joinState.step2Error })}
              </FxText>
            )}
          </FxBox>
        )}

      <FxBox flexDirection="row" flexWrap="wrap" gap="8" marginTop="8">
        {/* Cancel join request */}
        {isDetailed && isRequested && !isJoined && (
          <FxButton
            variant="inverted"
            onPress={() => void handleCancelRequest()}
            testID={`pool-${pool.poolID}-cancel-request`}
          >
            {t('settings.poolCard.buttons.cancelRequest')}
          </FxButton>
        )}

        {/* Leave pool */}
        {isDetailed && isJoined && (
          <FxButton
            variant="inverted"
            onPress={() => void handleLeave()}
            testID={`pool-${pool.poolID}-leave`}
          >
            {t('settings.poolCard.buttons.leavePool')}
          </FxButton>
        )}

        {/* Force rejoin — re-sends the pool id to the Blox config without contract interaction */}
        {isDetailed && isJoined && (
          <FxButton
            variant="inverted"
            onPress={() => void handleForceRejoin()}
            testID={`pool-${pool.poolID}-force-rejoin`}
          >
            {t('settings.poolCard.buttons.forceRejoin')}
          </FxButton>
        )}
      </FxBox>

      {/* Voting status */}
      {isDetailed && isJoined && (
        <FxCard.Row marginTop="16">
          <FxCard.Row.Title>{t('settings.poolCard.votingStatus')}</FxCard.Row.Title>
          <FxCard.Row.Data>
            {numVotes}/{numVoters}
          </FxCard.Row.Data>
        </FxCard.Row>
      )}
    </FxBox>
  );
}

export function PoolCard({
  pool,
  isDetailed,
  isRequested,
  isJoined,
  numVotes,
  numVoters,
  leavePool,
  cancelJoinPool,
  onViewDetails,
  selected,
  className,
  ...rest
}: PoolCardProps) {
  const { t } = useTranslation();
  const { navigate } = useAppNavigate();
  const viewDetails = () =>
    onViewDetails ? onViewDetails(pool.poolID) : void navigate(paths.settings.pool(pool.poolID));

  return (
    <FxCard
      marginTop="16"
      className={cn(selected && 'ring-2 ring-primary', className)}
      aria-current={selected ? 'true' : undefined}
      testID={`pool-card-${pool.poolID}`}
      {...rest}
    >
      <FxBox flexDirection="row" alignItems="flex-start" justifyContent="space-between" gap="12">
        <FxBox minWidth={0}>
          <FxCard.Title>{pool.name}</FxCard.Title>
          <FxText variant="bodyXSRegular">{t('settings.poolCard.id', { id: pool.poolID })}</FxText>
          <FxSpacer marginTop="16" />
          <FxBox flexDirection="row">
            <FxTag>{t('settings.poolCard.tag')}</FxTag>
          </FxBox>
        </FxBox>
        <FxButton
          variant="inverted"
          size="small"
          onPress={viewDetails}
          flexShrink={0}
          testID={`pool-${pool.poolID}-details`}
        >
          {t('settings.pools.viewDetails')}
        </FxButton>
      </FxBox>
      {isDetailed && (
        <DetailInfo
          pool={pool}
          isDetailed={isDetailed}
          isRequested={isRequested}
          isJoined={isJoined}
          numVotes={numVotes}
          numVoters={numVoters}
          leavePool={leavePool}
          cancelJoinPool={cancelJoinPool}
        />
      )}
    </FxCard>
  );
}

export default PoolCard;

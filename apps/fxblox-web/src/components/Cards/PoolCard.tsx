/**
 * Port of apps/box/src/components/Cards/PoolCard.tsx. Logic unchanged; platform swaps: `Alert.alert` →
 * `useConfirm().confirm()` (Join) and `choose()` ("Blox Not Registered" 3-way), AsyncStorage → `platform/kvStore`
 * (join-state adapter, same `joinState_<pool>_<peer>` keys), strings → `main.poolCard.*`. The settings Pools screen
 * supplies `leavePool` / `cancelJoinPool` (contract calls — pools.fx.land has no /leave or /cancel).
 * Must render inside a `WalletGate`.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ethers } from 'ethers';
import {
  FxBox,
  FxButton,
  FxCard,
  FxPoolIcon,
  FxSpacer,
  FxTag,
  FxText,
  useConfirm,
  useToast,
  type FxCardProps,
} from '@functionland/fx-ui';
import { useBloxsStore } from '@/stores/useBloxsStore';
import { usePoolsStore } from '@/stores/usePoolsStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useWallet } from '@/wallet/useWallet';
import { PoolApiService } from '@/services/poolApiService';
import { getContractService } from '@/contracts/contractService';
import { kvStore, type KeyValueStore } from '@/platform/kvStore';
import { openUrl } from '@/platform/linking';

export type PoolCardPool = { poolID: string; name: string; region: string };

export interface JoinState {
  step1Complete: boolean;
  step2Complete: boolean;
  step1Error?: string;
  step2Error?: string;
}

const EMPTY_JOIN_STATE: JoinState = { step1Complete: false, step2Complete: false };
const JOIN_TIMEOUT_MS = 120_000;

let store: KeyValueStore = kvStore;
/** Test hook. */
export function _setPoolCardStoreForTests(s: KeyValueStore): void {
  store = s;
}

export const joinStateKey = (poolID: string, peerId: string | undefined): string => `joinState_${poolID}_${peerId}`;

export async function loadJoinState(poolID: string, peerId: string | undefined): Promise<JoinState | null> {
  try {
    const raw = await store.getItem(joinStateKey(poolID, peerId));
    return raw ? (JSON.parse(raw) as JoinState) : null;
  } catch (error) {
    console.error('Error loading join state:', error);
    return null;
  }
}

export async function saveJoinState(poolID: string, peerId: string | undefined, state: JoinState): Promise<void> {
  try {
    await store.setItem(joinStateKey(poolID, peerId), JSON.stringify(state));
  } catch (error) {
    console.error('Error saving join state:', error);
  }
}

export async function clearJoinState(poolID: string, peerId: string | undefined): Promise<void> {
  try {
    await store.removeItem(joinStateKey(poolID, peerId));
  } catch (error) {
    console.error('Error clearing join state:', error);
  }
}

export type PoolCardProps = Omit<FxCardProps, 'children' | 'onPress' | 'onLongPress' | 'href'> & {
  pool: PoolCardPool;
  isDetailed: boolean;
  isRequested: boolean;
  isJoined: boolean;
  numVotes: number;
  numVoters: number;
  leavePool: (poolID: number) => Promise<void>;
  cancelJoinPool: (poolID: number) => Promise<void>;
  /** "Blox Not Registered" → Register Blox (mobile: navigate to the Users tab). */
  onRegisterBlox?: () => void;
};

type DetailInfoProps = Pick<
  PoolCardProps,
  'pool' | 'isRequested' | 'isJoined' | 'numVotes' | 'numVoters' | 'leavePool' | 'cancelJoinPool' | 'onRegisterBlox'
> & { isDetailed?: boolean };

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const DetailInfo = ({
  pool,
  isDetailed,
  isRequested,
  isJoined,
  numVotes,
  numVoters,
  leavePool,
  cancelJoinPool,
  onRegisterBlox,
}: DetailInfoProps) => {
  const { t } = useTranslation();
  const [isJoining, setIsJoining] = useState(false);
  const [joinState, setJoinState] = useState<JoinState>(EMPTY_JOIN_STATE);
  const joinCancelledRef = useRef(false);
  const joinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { queueToast } = useToast();
  const { confirm, choose } = useConfirm();
  const { account } = useWallet();
  const currentBloxPeerId = useBloxsStore((state) => state.currentBloxPeerId);
  const bloxsForCluster = useBloxsStore((state) => state.bloxs);
  const bloxsConnectionStatus = useBloxsStore((state) => state.bloxsConnectionStatus);
  const selectedChain = useSettingsStore((state) => state.selectedChain);
  const bloxsPropertyInfo = useBloxsStore((state) => state.bloxsPropertyInfo);
  const isPC = Boolean(
    currentBloxPeerId && bloxsPropertyInfo?.[currentBloxPeerId]?.containerInfo_fula?.image?.includes('_amd64'),
  );
  const storedClusterPeerId = currentBloxPeerId ? bloxsForCluster[currentBloxPeerId]?.clusterPeerId : undefined;
  const clusterPeerId = storedClusterPeerId && storedClusterPeerId !== currentBloxPeerId ? storedClusterPeerId : undefined;
  const joinPool = usePoolsStore((state) => state.joinPool);
  const forceRejoinPool = usePoolsStore((state) => state.forceRejoinPool);

  const isBloxConnected = Boolean(currentBloxPeerId && bloxsConnectionStatus[currentBloxPeerId] === 'CONNECTED');

  useEffect(() => {
    let cancelled = false;
    if (currentBloxPeerId) {
      void loadJoinState(pool.poolID, currentBloxPeerId).then((s) => {
        if (!cancelled && s) setJoinState(s);
      });
    }
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

  const persist = (state: JoinState) => saveJoinState(pool.poolID, currentBloxPeerId, state);
  const clear = () => clearJoinState(pool.poolID, currentBloxPeerId);

  const startJoinTimeout = () => {
    joinTimeoutRef.current = setTimeout(() => {
      if (!joinCancelledRef.current) {
        setIsJoining(false);
        queueToast({ type: 'warning', title: t('main.poolCard.timeoutTitle'), message: t('main.poolCard.timeoutMessage') });
      }
    }, JOIN_TIMEOUT_MS);
  };

  const handleJoinPool = async () => {
    if (!account) {
      queueToast({ type: 'error', title: t('main.poolCard.walletNotConnectedTitle'), message: t('main.poolCard.walletNotConnectedMessage') });
      return;
    }
    if (!currentBloxPeerId) {
      queueToast({ type: 'error', title: t('main.poolCard.peerIdMissingTitle'), message: t('main.poolCard.peerIdMissingMessage') });
      return;
    }

    let confirmMessage = t('main.poolCard.joinMessage', { name: pool.name, chain: selectedChain, peerId: currentBloxPeerId });
    if (isPC) {
      try {
        const service = getContractService(selectedChain);
        const requiredTokens = await service.getRequiredTokens(pool.poolID);
        const formattedTokens = ethers.utils.formatEther(requiredTokens);
        confirmMessage = t('main.poolCard.joinMessagePc', { name: pool.name, tokens: formattedTokens });
      } catch (err) {
        console.error('Failed to get required tokens:', err);
      }
    }

    const ok = await confirm({
      title: t('main.poolCard.joinTitle'),
      message: confirmMessage,
      confirmText: t('main.poolCard.joinConfirm'),
      cancelText: t('main.poolCard.joinCancel'),
    });
    if (ok) await performJoinPool();
  };

  const cancelJoining = () => {
    joinCancelledRef.current = true;
    if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
    setIsJoining(false);
    queueToast({ type: 'info', title: t('main.poolCard.cancelledTitle'), message: t('main.poolCard.cancelledMessage') });
  };

  const performJoinPool = async () => {
    joinCancelledRef.current = false;
    setIsJoining(true);
    startJoinTimeout();
    const poolId = parseInt(pool.poolID, 10);
    const newJoinState: JoinState = { ...joinState };

    try {
      // Step 1: Blox join pool method (if not already completed)
      if (!joinState.step1Complete) {
        try {
          await joinPool(poolId);
          newJoinState.step1Complete = true;
          newJoinState.step1Error = undefined;
        } catch (error) {
          console.error('Step 1: Blox joinPool failed:', error);
          newJoinState.step1Error = errorText(error);
        }
      }

      // Step 2: join the pool (contract on PC, API server on Armbian)
      let apiTransactionHash: string | undefined;
      if (!joinState.step2Complete) {
        try {
          if (isPC) {
            const service = getContractService(selectedChain);
            await service.ensureTokenApproval(pool.poolID);
            await service.joinPool(pool.poolID, clusterPeerId);
            newJoinState.step2Complete = true;
            newJoinState.step2Error = undefined;
          } else {
            const response = await PoolApiService.joinPool({
              peerId: clusterPeerId ?? '',
              kuboPeerId: currentBloxPeerId,
              account: account ?? '',
              chain: selectedChain,
              poolId,
            });
            if (response.status === 'ok') {
              newJoinState.step2Complete = true;
              newJoinState.step2Error = undefined;
              apiTransactionHash = response.transactionHash;
            } else {
              throw new Error(response.msg || t('main.poolCard.joinRequestFailed'));
            }
          }
        } catch (error) {
          console.error('Step 2 failed:', error);
          newJoinState.step2Error = errorText(error);
        }
      }

      setJoinState(newJoinState);
      await persist(newJoinState);

      if (newJoinState.step1Complete && newJoinState.step2Complete) {
        queueToast({
          type: 'success',
          title: t('main.poolCard.joinedTitle'),
          message: apiTransactionHash
            ? t('main.poolCard.joinedTransaction', { hash: apiTransactionHash.slice(0, 10) })
            : t('main.poolCard.joinedMember'),
        });
        await clear();
      } else if (!newJoinState.step1Complete && newJoinState.step2Complete) {
        queueToast({ type: 'warning', title: t('main.poolCard.submittedTitle'), message: t('main.poolCard.submittedMessage') });
      } else if (newJoinState.step1Complete && !newJoinState.step2Complete) {
        queueToast({ type: 'warning', title: t('main.poolCard.partialTitle'), message: t('main.poolCard.partialMessage') });
      } else {
        const errorMessage = newJoinState.step2Error || newJoinState.step1Error || t('main.poolCard.joinFailedDefault');
        if (errorMessage.includes('401') || errorMessage.includes('not registered')) {
          const choice = await choose<'sales' | 'register'>({
            title: t('main.poolCard.notRegisteredTitle'),
            message: t('main.poolCard.notRegisteredMessage'),
            options: [
              { label: t('main.poolCard.contactSales'), value: 'sales' },
              { label: t('main.poolCard.registerBlox'), value: 'register' },
            ],
            cancelText: t('main.common.ok'),
          });
          if (choice === 'sales') openUrl('mailto:sales@fx.land', { newTab: false });
          else if (choice === 'register') onRegisterBlox?.();
        } else {
          queueToast({ type: 'error', title: t('main.poolCard.joinFailedTitle'), message: errorMessage });
        }
      }
    } finally {
      if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
      if (!joinCancelledRef.current) setIsJoining(false);
    }
  };

  const handleResendJoin = async () => {
    joinCancelledRef.current = false;
    setIsJoining(true);
    startJoinTimeout();
    const newJoinState: JoinState = { ...joinState };

    try {
      if (isPC) {
        const service = getContractService(selectedChain);
        await service.ensureTokenApproval(pool.poolID);
        await service.joinPool(pool.poolID, clusterPeerId);
        newJoinState.step2Complete = true;
        newJoinState.step2Error = undefined;
        setJoinState(newJoinState);
        await persist(newJoinState);
        queueToast({ type: 'success', title: t('main.poolCard.joinedTitle'), message: t('main.poolCard.joinedMember') });
        await clear();
      } else {
        const response = await PoolApiService.joinPool({
          peerId: clusterPeerId ?? '',
          kuboPeerId: currentBloxPeerId,
          account: account ?? '',
          chain: selectedChain,
          poolId: parseInt(pool.poolID, 10),
        });
        if (response.status === 'ok') {
          newJoinState.step2Complete = true;
          newJoinState.step2Error = undefined;
          setJoinState(newJoinState);
          await persist(newJoinState);
          queueToast({
            type: 'success',
            title: t('main.poolCard.joinedTitle'),
            message: response.transactionHash
              ? t('main.poolCard.joinedTransaction', { hash: response.transactionHash.slice(0, 10) })
              : t('main.poolCard.joinedMember'),
          });
          await clear();
        } else {
          throw new Error(response.msg || t('main.poolCard.joinRequestFailed'));
        }
      }
    } catch (error) {
      const errorMessage = errorText(error);
      newJoinState.step2Error = errorMessage;
      setJoinState(newJoinState);
      await persist(newJoinState);
      queueToast({ type: 'error', title: t('main.poolCard.resendFailedTitle'), message: errorMessage });
    } finally {
      if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
      if (!joinCancelledRef.current) setIsJoining(false);
    }
  };

  const leaveAndClear = async () => {
    await leavePool(parseInt(pool.poolID, 10));
    await clear();
    setJoinState(EMPTY_JOIN_STATE);
  };

  const stateText = (done: boolean) => (done ? t('main.poolCard.complete') : t('main.poolCard.pendingState'));

  return (
    <FxBox>
      <FxSpacer marginTop="24" />
      <FxCard.Row>
        <FxCard.Row.Title>{t('main.poolCard.location')}</FxCard.Row.Title>
        <FxCard.Row.Data>{pool.region}</FxCard.Row.Data>
      </FxCard.Row>
      <FxCard.Row>
        <FxCard.Row.Title>{t('main.poolCard.bloxStatus')}</FxCard.Row.Title>
        <FxCard.Row.Data>{isBloxConnected ? t('main.poolCard.bloxConnected') : t('main.poolCard.bloxDisconnected')}</FxCard.Row.Data>
      </FxCard.Row>

      {isJoined && (
        <FxCard.Row>
          <FxCard.Row.Title>{t('main.poolCard.status')}</FxCard.Row.Title>
          <FxCard.Row.Data>{t('main.poolCard.joined')}</FxCard.Row.Data>
        </FxCard.Row>
      )}

      {isRequested && !isJoined && (
        <FxCard.Row>
          <FxCard.Row.Title>{t('main.poolCard.status')}</FxCard.Row.Title>
          <FxCard.Row.Data>{t('main.poolCard.requested', { votes: numVotes, voters: numVoters })}</FxCard.Row.Data>
        </FxCard.Row>
      )}

      {isDetailed && !isRequested && (
        <FxButton
          onPress={() =>
            void (isJoining
              ? cancelJoining()
              : joinState.step2Complete
                ? leaveAndClear()
                : joinState.step1Complete && !joinState.step2Complete
                  ? handleResendJoin()
                  : handleJoinPool())
          }
          paddingHorizontal="16"
          iconLeft={<FxPoolIcon />}
          disabled={!isJoining && !isBloxConnected && !joinState.step2Complete}
          testID="pool-card-join"
        >
          {isJoining
            ? t('main.poolCard.cancel')
            : joinState.step2Complete
              ? t('main.poolCard.leavePool')
              : !isBloxConnected
                ? t('main.poolCard.bloxDisconnectedButton')
                : joinState.step1Complete && !joinState.step2Complete
                  ? isPC
                    ? t('main.poolCard.resendContract')
                    : t('main.poolCard.resendJoin')
                  : isPC
                    ? t('main.poolCard.joinContract')
                    : t('main.poolCard.join')}
        </FxButton>
      )}

      {isDetailed && !isJoined && !isRequested && (joinState.step1Complete || joinState.step2Complete) && (
        <FxBox marginTop="8" padding="8" backgroundColor="backgroundSecondary" borderRadius="s" testID="pool-card-join-status">
          <FxText variant="bodyXSRegular" color="content2">
            {t('main.poolCard.joinStatus')}
          </FxText>
          <FxText variant="bodyXSRegular" color={joinState.step1Complete ? 'greenBase' : 'errorBase'}>
            {t('main.poolCard.bloxConfiguration', { state: stateText(joinState.step1Complete) })}
          </FxText>
          {joinState.step1Error && (
            <FxText variant="bodyXSRegular" color="errorBase" marginTop="4">
              {t('main.poolCard.bloxError', { error: joinState.step1Error })}
            </FxText>
          )}
          <FxText variant="bodyXSRegular" color={joinState.step2Complete ? 'greenBase' : 'errorBase'}>
            {t('main.poolCard.poolRegistration', { state: stateText(joinState.step2Complete) })}
          </FxText>
          {joinState.step2Error && (
            <FxText variant="bodyXSRegular" color="errorBase" marginTop="4">
              {t('main.poolCard.apiError', { error: joinState.step2Error })}
            </FxText>
          )}
        </FxBox>
      )}

      {isDetailed && isRequested && !isJoined && (
        <FxButton
          onPress={() =>
            void (async () => {
              await cancelJoinPool(parseInt(pool.poolID, 10));
              await clear();
              setJoinState(EMPTY_JOIN_STATE);
            })()
          }
          paddingHorizontal="16"
          marginTop="8"
          variant="inverted"
          testID="pool-card-cancel-request"
        >
          {t('main.poolCard.cancelRequest')}
        </FxButton>
      )}

      {isDetailed && isJoined && (
        <FxButton onPress={() => void leaveAndClear()} paddingHorizontal="16" marginTop="8" variant="inverted" testID="pool-card-leave">
          {t('main.poolCard.leavePool')}
        </FxButton>
      )}

      {isDetailed && isJoined && (
        <FxButton
          onPress={() =>
            void (async () => {
              try {
                await forceRejoinPool(parseInt(pool.poolID, 10));
                queueToast({ type: 'success', title: t('main.poolCard.rejoinedTitle'), message: t('main.poolCard.rejoinedMessage', { id: pool.poolID }) });
              } catch (error) {
                console.error('Force rejoin error:', error);
                queueToast({
                  type: 'error',
                  title: t('main.poolCard.rejoinFailedTitle'),
                  message: error instanceof Error ? error.message : t('main.poolCard.rejoinFailedMessage'),
                });
              }
            })()
          }
          paddingHorizontal="16"
          marginTop="8"
          variant="inverted"
          testID="pool-card-force-rejoin"
        >
          {t('main.poolCard.forceRejoin')}
        </FxButton>
      )}

      {isDetailed && isJoined && (
        <FxCard.Row>
          <FxCard.Row.Title>{t('main.poolCard.votingStatus')}</FxCard.Row.Title>
          <FxCard.Row.Data>
            {numVotes}/{numVoters}
          </FxCard.Row.Data>
        </FxCard.Row>
      )}
    </FxBox>
  );
};

export function PoolCard({
  pool,
  isDetailed,
  isRequested,
  isJoined,
  numVotes,
  numVoters,
  leavePool,
  cancelJoinPool,
  onRegisterBlox,
  testID = 'pool-card',
  ...rest
}: PoolCardProps) {
  const { t } = useTranslation();
  return (
    <FxCard marginTop="16" testID={testID} {...rest}>
      <FxBox flexDirection="row" alignItems="center">
        <FxBox>
          <FxCard.Title>{pool.name}</FxCard.Title>
          <FxText variant="bodyXSRegular">{t('main.poolCard.id', { id: pool.poolID })}</FxText>
          <FxSpacer marginTop="16" />
          <FxBox flexDirection="row">
            <FxTag>{t('main.poolCard.tag')}</FxTag>
          </FxBox>
        </FxBox>
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
          onRegisterBlox={onRegisterBlox}
        />
      )}
    </FxCard>
  );
}

export default PoolCard;

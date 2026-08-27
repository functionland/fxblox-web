/**
 * Port of apps/box/src/screens/InitialSetup/SetupComplete.screen.tsx — the mobile state machine kept intact:
 * 20 s internet grace → `network.isOnline()` (no-cors generate_204) → 20 s later `Helper.initFula({ password,
 * signiture, bloxPeerId })` → `checkBloxConnection` with the ×2 / 4 s retry → COMPLETED / NOTCOMPLETED / ERROR,
 * `getClusterInfo` → `updateBlox({ clusterPeerId })`, a 10 s `HEAD /properties` poll while offline, the hotspot
 * check behind "Back" in the ERROR state, and "Home" — the deep-link consumption point (plan §WS4).
 * Multi-Blox invariant: readiness is `fulaIsReady && fulaReadyForPeerId === currentBloxPeerId`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxLedDot,
  FxSpinner,
  FxText,
  FxTower,
  useToast,
} from '@functionland/fx-ui';
import { API_URL } from '@/api';
import { consumeDeepLinkStash } from '@/app/deepLinkStash';
import { paths } from '@/app/paths';
import { SetupNav } from '@/components/setup/SetupNav';
import { SetupScreen } from '@/components/setup/SetupScreen';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useLogger } from '@/hooks/useLogger';
import { fxblox } from '@/lib/fula';
import { lanFetch } from '@/platform/lanHttp';
import { isOnline, onOnlineChange } from '@/platform/network';
import { useBloxsStore } from '@/stores/useBloxsStore';
import { useUserProfileStore } from '@/stores/useUserProfileStore';
import * as Helper from '@/utils/helper';

export type SetupStatus = 'COMPLETED' | 'CHECKING' | 'NOTCOMPLETED' | 'ERROR' | undefined;
export type InternetStatus = 'CONNECTED' | 'CHECKING' | 'NOTCONNECTED' | undefined;

/** Mobile delays (ms); tests shrink them through `_setTimingsForTests`. */
export const TIMINGS = {
  internetGraceMs: 20_000,
  fulaInitDelayMs: 20_000,
  reachStartDelayMs: 1000,
  reachRetryDelayMs: 4000,
  internetRetryDelayMs: 1000,
  hotspotPollMs: 10_000,
};
export function _setTimingsForTests(next: Partial<typeof TIMINGS>): () => void {
  const prev = { ...TIMINGS };
  Object.assign(TIMINGS, next);
  return () => Object.assign(TIMINGS, prev);
}

const MAX_REACH_RETRIES = 2;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export default function SetupComplete() {
  const { t } = useTranslation();
  const { navigate, back } = useAppNavigate();
  const { queueToast } = useToast();
  const logger = useLogger();
  const [search] = useSearchParams();
  const manualParam = search.get('manual');
  const isManualSetup = manualParam === '1' || manualParam === 'true';

  const [internetStatus, setInternetStatus] = useState<InternetStatus>();
  const [initialWaitForInternet, setInitialWaitForInternet] = useState(true);
  const [setupStatus, setSetupStatus] = useState<SetupStatus>('CHECKING');
  const [bloxReachOutTryCount, setBloxReachOutTryCount] = useState(0);
  const [offInterval, setOffInterval] = useState(500);
  const [towerColor, setTowerColor] = useState('lightblue');
  const [isHeaderStatus200, setIsHeaderStatus200] = useState(false);

  const password = useUserProfileStore((state) => state.password);
  const signiture = useUserProfileStore((state) => state.signiture);
  const fulaIsReady = useUserProfileStore((state) => state.fulaIsReady);
  const fulaReadyForPeerId = useUserProfileStore((state) => state.fulaReadyForPeerId);
  const setFulaIsReady = useUserProfileStore((state) => state.setFulaIsReady);

  // currentBloxPeerId can be undefined when the user skipped SetBloxAuthorizer
  const currentBloxPeerId = useBloxsStore((state) => state.currentBloxPeerId);
  const bloxsConnectionStatus = useBloxsStore((state) => state.bloxsConnectionStatus);
  const updateBlox = useBloxsStore((state) => state.updateBlox);
  const checkBloxConnection = useBloxsStore((state) => state.checkBloxConnection);

  const fulaReadyForCurrent =
    fulaIsReady && !!currentBloxPeerId && fulaReadyForPeerId === currentBloxPeerId;
  const bloxStatus = currentBloxPeerId ? bloxsConnectionStatus[currentBloxPeerId] : undefined;

  // Pending timers are cleared on unmount (mobile leaked them).
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) clearTimeout(id);
      pending.clear();
    };
  }, []);

  const latest = useRef({ fulaReadyForCurrent, internetStatus, checkBloxConnection, logger });
  latest.current = { fulaReadyForCurrent, internetStatus, checkBloxConnection, logger };

  /**
   * This screen fires network probes (internet reachability, `HEAD /properties`) that outlive a fast
   * navigation away — the user can press Home or Reconnect while one is in flight. Writing state after that
   * is at best a wasted render and at worst a crash: under CI timings a probe settled after the test
   * environment had been torn down and React's `dispatchSetState` threw `window is not defined`, failing the
   * run even though every test passed. Every post-await state write below is guarded by this.
   */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const checkInternetStatus = useCallback(async () => {
    try {
      const online = await isOnline();
      if (!alive.current) return;
      if (online) {
        setInternetStatus('CONNECTED');
        setInitialWaitForInternet(false);
      } else {
        setInternetStatus('NOTCONNECTED');
        setSetupStatus('NOTCOMPLETED');
      }
      latest.current.logger.log('checkInternetStatus:network', { online });
    } catch (error) {
      if (!alive.current) return;
      setInternetStatus('NOTCONNECTED');
      setSetupStatus('NOTCOMPLETED');
      console.error('checkInternetConnectivity', error);
      latest.current.logger.logError('checkInternetConnectivity', error);
    }
  }, []);

  const checkHttpHeaderStatus = useCallback(async () => {
    try {
      await lanFetch(`${API_URL}/properties`, { method: 'HEAD', timeoutMs: 5000 });
      if (alive.current) setIsHeaderStatus200(true);
    } catch (error) {
      if (!alive.current) return;
      console.error('Failed to fetch properties', error);
      setIsHeaderStatus200(false);
    }
  }, []);

  const handleTryReachBlox = useCallback(() => {
    setSetupStatus('CHECKING');
    later(() => {
      void (async () => {
        try {
          if (latest.current.fulaReadyForCurrent && latest.current.internetStatus === 'CONNECTED') {
            const result = await latest.current.checkBloxConnection();
            if (!alive.current) return;
            latest.current.logger.log('handleTryReachBlox:checkBloxConnection', result);
          } else {
            setSetupStatus('NOTCOMPLETED');
          }
        } catch (error) {
          if (!alive.current) return;
          latest.current.logger.logError('handleTryReachBlox', error);
        }
      })();
    }, TIMINGS.reachStartDelayMs);
  }, [later]);

  // Initial grace period for the phone/computer to be back on the internet
  useEffect(() => {
    const timer = setTimeout(() => setInitialWaitForInternet(false), TIMINGS.internetGraceMs);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!initialWaitForInternet && latest.current.internetStatus !== 'CONNECTED') {
      void checkInternetStatus();
    }
  }, [initialWaitForInternet, checkInternetStatus]);

  // Mobile: re-check on every NetInfo change
  useEffect(() => {
    void checkInternetStatus();
    return onOnlineChange(() => void checkInternetStatus());
  }, [checkInternetStatus]);

  // Initiate fula
  useEffect(() => {
    if (
      password &&
      signiture &&
      currentBloxPeerId &&
      internetStatus === 'CONNECTED' &&
      !fulaReadyForCurrent
    ) {
      let cancelled = false;
      void (async () => {
        await sleep(TIMINGS.fulaInitDelayMs);
        if (cancelled) return;
        latest.current.logger.log('SetupCompleteScreen:initFula', {
          password: 'Has password',
          signiture: 'Has signiture',
          bloxPeerId: currentBloxPeerId,
        });
        try {
          await Helper.initFula({ password, signiture, bloxPeerId: currentBloxPeerId });
          if (!cancelled) setFulaIsReady(true, currentBloxPeerId);
        } catch (error) {
          if (cancelled) return;
          setFulaIsReady(false);
          setSetupStatus('ERROR');
          queueToast({
            type: 'error',
            message: t('setupComplete.unableToInitialize', {
              error: error instanceof Error ? error.message : String(error),
              fulaIsReady: String(fulaReadyForCurrent),
            }),
          });
          latest.current.logger.logError('SetupCompleteScreen:initFula', error);
        }
      })();
      return () => {
        cancelled = true;
      };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mobile deps (+ readiness for the current blox)
  }, [password, signiture, currentBloxPeerId, internetStatus, fulaReadyForCurrent]);

  // Check the blox connectivity
  useEffect(() => {
    if (fulaReadyForCurrent && internetStatus === 'CONNECTED' && currentBloxPeerId) {
      handleTryReachBlox();
    }
  }, [fulaReadyForCurrent, internetStatus, currentBloxPeerId, handleTryReachBlox]);

  // Set the setup completion status
  useEffect(() => {
    if (fulaReadyForCurrent) {
      if (bloxStatus === 'DISCONNECTED') {
        if (bloxReachOutTryCount < MAX_REACH_RETRIES) {
          setBloxReachOutTryCount(bloxReachOutTryCount + 1);
          later(() => handleTryReachBlox(), TIMINGS.reachRetryDelayMs);
        } else {
          setSetupStatus('NOTCOMPLETED');
        }
      } else if (bloxStatus === 'CONNECTED') {
        setSetupStatus('COMPLETED');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mobile deps
  }, [bloxsConnectionStatus, currentBloxPeerId, fulaReadyForCurrent]);

  // Fetch the cluster peerID from the blox once connected when clusterPeerId is missing or stale.
  useEffect(() => {
    if (bloxStatus !== 'CONNECTED' || !currentBloxPeerId) return;
    const currentBlox = useBloxsStore.getState().bloxs[currentBloxPeerId];
    if (
      currentBlox &&
      (!currentBlox.clusterPeerId || currentBlox.clusterPeerId === currentBloxPeerId)
    ) {
      fxblox
        .getClusterInfo()
        .then((info) => {
          if (info?.cluster_peer_id) {
            updateBlox({ peerId: currentBloxPeerId, clusterPeerId: info.cluster_peer_id });
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mobile deps
  }, [bloxsConnectionStatus, currentBloxPeerId]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (internetStatus === 'NOTCONNECTED' && setupStatus === 'NOTCOMPLETED') {
        void checkHttpHeaderStatus();
      }
    }, TIMINGS.hotspotPollMs);
    if (setupStatus === 'COMPLETED') {
      setOffInterval(0);
      setTowerColor('green');
    }
    return () => clearInterval(interval);
  }, [internetStatus, setupStatus, checkHttpHeaderStatus]);

  const checkHotspotConnection = async () => {
    try {
      // Attempt to reach the hotspot API; if it answers, go back
      await lanFetch(`${API_URL}/properties`, { timeoutMs: 5000 });
      if (!alive.current) return;
      back(paths.setup.connectWifi);
    } catch {
      if (!alive.current) return;
      queueToast({ type: 'error', message: t('setupComplete.notConnectedToHotspot') });
    }
  };

  /** "Home" — the single deep-link consumption point (plan §WS4). */
  const handleHome = () => {
    void navigate(consumeDeepLinkStash() ?? paths.blox, { replace: true });
  };

  const handleTryCheckInternet = () => {
    setSetupStatus('CHECKING');
    later(() => void checkInternetStatus(), TIMINGS.internetRetryDelayMs);
  };

  const handleReconnectBlox = () => {
    if (isManualSetup) back(paths.setup.connectExisting);
    else void navigate(paths.setup.connectBlox, { replace: true });
  };

  const handleBackToHome = () => void navigate(paths.setup.welcome, { replace: true });

  const warning = (key: string, extra?: Record<string, unknown>) => (
    <FxText
      variant="bodyMediumRegular"
      color="warningBase"
      textAlign="center"
      paddingHorizontal="16"
      lineHeight={20}
    >
      {t(key, extra)}
    </FxText>
  );

  return (
    <SetupScreen id="complete">
      <FxBox alignItems="center" marginTop="16" marginBottom="16">
        <FxTower
          onInterval={2000}
          offColor="gray"
          offInterval={offInterval}
          onColor={towerColor}
          height={160}
          width={70}
          label={t('setup.setupComplete.towerLabel')}
        />
      </FxBox>

      <FxBox alignItems="center" gap="8" testID="setup-complete-status">
        {currentBloxPeerId && (setupStatus === 'CHECKING' || initialWaitForInternet) && (
          <>
            <FxSpinner size="large" label={t('setupComplete.completing')} />
            <FxText variant="bodyLargeRegular" paddingVertical="8" role="status">
              {t('setupComplete.completing')}
            </FxText>
            <FxText variant="bodyXSRegular" color="content3">
              {t('setup.setupComplete.keepTabOpen')}
            </FxText>
          </>
        )}
        {(internetStatus === 'CHECKING' || initialWaitForInternet) && currentBloxPeerId && (
          <FxText variant="bodyMediumRegular">{t('setupComplete.connectPhone')}</FxText>
        )}
        {internetStatus === 'CONNECTED' && bloxStatus === 'CHECKING' && (
          <FxText variant="bodyMediumRegular">
            {t('setupComplete.reachingBlox', { number: bloxReachOutTryCount })}
          </FxText>
        )}
        {currentBloxPeerId &&
          internetStatus === 'NOTCONNECTED' &&
          setupStatus === 'NOTCOMPLETED' && (
            <>
              <FxLedDot color="green" offInterval={0} />
              {warning('setupComplete.greenLed')}
              {warning('setupComplete.internetReminder')}
              <FxLedDot color="lightblue" offInterval={500} onInterval={2000} marginTop="8" />
              {warning('setupComplete.lightBlueLed')}
            </>
          )}
        {bloxStatus === 'DISCONNECTED' &&
          internetStatus === 'CONNECTED' &&
          setupStatus === 'NOTCOMPLETED' &&
          warning('setupComplete.notReachable')}
        {!currentBloxPeerId && (
          <>
            {warning('setupComplete.updating')}
            <FxText
              variant="bodyMediumLight"
              color="warningBase"
              textAlign="center"
              paddingHorizontal="16"
              paddingVertical="16"
              lineHeight={20}
            >
              {t('setupComplete.disconnectHotspot')}
            </FxText>
            <FxButton marginTop="24" width="80%" onPress={handleBackToHome} testID="home-screen">
              {t('setupComplete.homeScreen')}
            </FxButton>
          </>
        )}
        {setupStatus === 'ERROR' && (
          <>
            <FxLedDot color="red" onInterval={1000} offInterval={1000} />
            <FxText
              variant="bodyMediumLight"
              color="warningBase"
              textAlign="center"
              paddingHorizontal="16"
              paddingVertical="16"
              lineHeight={20}
            >
              {t('setupComplete.cyanFlashing')}
            </FxText>
          </>
        )}
        {setupStatus === 'COMPLETED' && (
          <FxBox alignItems="center" marginTop="16" testID="setup-completed">
            <FxText
              letterSpacing={2}
              variant="bodyXXSRegular"
              textAlign="center"
              textTransform="uppercase"
              marginBottom="16"
            >
              {t('setupComplete.congratulations')}
            </FxText>
            <FxText
              as="h1"
              fontFamily="var(--fx-font-heading)"
              fontWeight={600}
              fontSize={36}
              lineHeight={48}
              textAlign="center"
              marginBottom="16"
            >
              {t('setupComplete.setupComplete')}
            </FxText>
          </FxBox>
        )}
      </FxBox>

      <SetupNav
        above={
          <>
            {setupStatus === 'COMPLETED' && (
              <FxButton size="large" onPress={handleHome} testID="setup-continue">
                {t('setupComplete.home')}
              </FxButton>
            )}
            {currentBloxPeerId &&
              internetStatus === 'NOTCONNECTED' &&
              setupStatus === 'NOTCOMPLETED' && (
                <>
                  <FxButton size="large" onPress={handleTryCheckInternet} testID="check-internet">
                    {t('setupComplete.checkInternet')}
                  </FxButton>
                  <FxButton variant="inverted" size="large" onPress={handleHome} testID="home">
                    {t('setupComplete.home')}
                  </FxButton>
                  {isHeaderStatus200 && (
                    <FxButton
                      variant="inverted"
                      size="large"
                      onPress={() => back(paths.setup.connectWifi)}
                      testID="wrong-password"
                    >
                      {t('setupComplete.wrongPassword')}
                    </FxButton>
                  )}
                </>
              )}
            {currentBloxPeerId &&
              internetStatus === 'CONNECTED' &&
              setupStatus === 'NOTCOMPLETED' && (
                <>
                  <FxButton
                    variant="inverted"
                    size="large"
                    onPress={() => {
                      setBloxReachOutTryCount(0);
                      handleTryReachBlox();
                    }}
                    testID="check-connection-again"
                  >
                    {t('setupComplete.checkConnection')}
                  </FxButton>
                  <FxButton variant="inverted" size="large" onPress={handleHome} testID="home">
                    {t('setupComplete.home')}
                  </FxButton>
                  {bloxStatus === 'DISCONNECTED' && (
                    <FxButton size="large" onPress={handleReconnectBlox} testID="reconnect-blox">
                      {isManualSetup ? t('setupComplete.back') : t('setupComplete.reconnectWifi')}
                    </FxButton>
                  )}
                </>
              )}
            {setupStatus === 'ERROR' && (
              <>
                <FxButton
                  size="large"
                  onPress={() => void checkHotspotConnection()}
                  testID="error-back"
                >
                  {t('setupComplete.back')}
                </FxButton>
                <FxButton variant="inverted" size="large" onPress={handleHome} testID="home">
                  {t('setupComplete.home')}
                </FxButton>
              </>
            )}
          </>
        }
      />
    </SetupScreen>
  );
}

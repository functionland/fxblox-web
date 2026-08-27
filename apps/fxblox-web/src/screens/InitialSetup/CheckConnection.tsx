/**
 * Port of apps/box/src/screens/InitialSetup/CheckConnection.screen.tsx — unreachable on mobile, wired on web
 * from ConnectToWifi (plan §WS3). The browser cannot rejoin the `FxBlox` hotspot by itself, so the screen gives
 * the instructions and "I'm connected" polls `GET wifi/status` every 5 s; once the Blox reports connected the
 * hotspot is disabled best-effort (`GET /ap/disable` — the request usually dies with the hotspot, which is
 * expected) and the flow moves to SetupComplete.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxSpinner, FxText, useToast } from '@functionland/fx-ui';
import { getWifiStatus, putApDisable } from '@/api/wifi';
import { paths } from '@/app/paths';
import { SetupNav } from '@/components/setup/SetupNav';
import { SetupScreen } from '@/components/setup/SetupScreen';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useLogger } from '@/hooks/useLogger';
import { DEFAULT_NETWORK_NAME } from '@/utils/constants';

export enum NetworkStatus {
  Connected = 'connected',
  Connecting = 'connecting',
  CheckConnection = 'check-connection',
  FailedConnection = 'failed-connection',
  Disconnected = 'disconnected',
}

export const TIMINGS = { pollMs: 5000 };
export function _setTimingsForTests(next: Partial<typeof TIMINGS>): () => void {
  const prev = { ...TIMINGS };
  Object.assign(TIMINGS, next);
  return () => Object.assign(TIMINGS, prev);
}

/** go-fula answers `{ status: true|false }` today; older builds used the mobile enum strings. */
export function statusFromWifiStatus(status: unknown): NetworkStatus {
  if (status === true || status === NetworkStatus.Connected) return NetworkStatus.Connected;
  if (status === NetworkStatus.FailedConnection) return NetworkStatus.FailedConnection;
  if (status === NetworkStatus.Disconnected) return NetworkStatus.Disconnected;
  return NetworkStatus.Connecting;
}

export default function CheckConnection() {
  const { t } = useTranslation();
  const { navigate, back } = useAppNavigate();
  const { queueToast } = useToast();
  const logger = useLogger();
  const [search] = useSearchParams();
  const ssid = search.get('ssid') ?? '';

  const [status, setStatus] = useState<NetworkStatus>(NetworkStatus.Connecting);
  const [polling, setPolling] = useState(false);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    let inFlight = false;
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      setAttempts((a) => a + 1);
      setStatus(NetworkStatus.CheckConnection);
      try {
        const { data } = await getWifiStatus();
        if (cancelled) return;
        const wifiStatus = statusFromWifiStatus(data?.status);
        setStatus(wifiStatus);
        if (wifiStatus === NetworkStatus.Connected) {
          setPolling(false);
          queueToast({ type: 'success', message: t('checkConnection.allDone') });
          try {
            await putApDisable();
          } catch (error) {
            // Expected: the hotspot drops as soon as the Blox is on the network.
            console.log('ap/disable failed (expected once the hotspot is gone)', error);
          }
          if (!cancelled) void navigate(paths.setup.complete(), { replace: true });
        }
      } catch (error) {
        logger.logError('CheckConnection:getWifiStatus', error);
        if (!cancelled) setStatus(NetworkStatus.Disconnected);
      } finally {
        inFlight = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), TIMINGS.pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- (re)start only when polling toggles
  }, [polling]);

  const statusMessage = useMemo(() => {
    switch (status) {
      case NetworkStatus.Connected:
        return t('checkConnection.successfullyConnected', { ssid });
      case NetworkStatus.CheckConnection:
        return t('checkConnection.verifyingConnection');
      case NetworkStatus.FailedConnection:
        return t('checkConnection.couldntConnect', { ssid });
      case NetworkStatus.Disconnected:
        return t('checkConnection.couldntConnectTryAgain', { ssid });
      case NetworkStatus.Connecting:
      default:
        return t('checkConnection.connectingWith', { ssid });
    }
  }, [status, ssid, t]);

  return (
    <SetupScreen
      id="check-connection"
      title={t('setup.checkConnection.title')}
      subtitle={t('checkConnection.verifyingConnectionWith', { ssid })}
    >
      <FxBox gap="16">
        <FxBox backgroundColor="backgroundPrimary" borderRadius="m" padding="16" gap="8">
          <FxText variant="bodySmallRegular" color="content1">
            {t('setup.checkConnection.instructions', { ssid })}
          </FxText>
          <ol className="m-0 flex list-decimal flex-col gap-1 ps-5">
            <FxText as="li" variant="bodySmallRegular" color="content2">
              {t('setup.checkConnection.step1', { hotspot: DEFAULT_NETWORK_NAME })}
            </FxText>
            <FxText as="li" variant="bodySmallRegular" color="content2">
              {t('setup.checkConnection.step2', { ssid })}
            </FxText>
            <FxText as="li" variant="bodySmallRegular" color="content2">
              {t('setup.checkConnection.step3')}
            </FxText>
          </ol>
        </FxBox>
        <FxBox flexDirection="row" alignItems="center" gap="8" role="status">
          {polling && <FxSpinner label={null} />}
          <FxText
            variant="bodyMediumRegular"
            color={status === NetworkStatus.Connected ? 'successBase' : 'secondary'}
            testID="connection-status"
          >
            {statusMessage}
          </FxText>
        </FxBox>
        {polling && (
          <FxText variant="bodyXSRegular" color="content3">
            {t('setup.checkConnection.checking', { count: attempts })}
          </FxText>
        )}
      </FxBox>

      <SetupNav
        onBack={() => back(paths.setup.connectWifi)}
        below={
          <FxButton
            variant="inverted"
            size="small"
            onPress={() => void navigate(paths.setup.complete())}
            testID="skip-check"
          >
            {t('setup.checkConnection.skip')}
          </FxButton>
        }
      >
        <FxButton
          flex={1}
          onPress={() => setPolling((p) => !p)}
          variant={polling ? 'inverted' : 'defaults'}
          testID="im-connected"
        >
          {polling ? t('setup.checkConnection.stop') : t('setup.checkConnection.imConnected')}
        </FxButton>
      </SetupNav>
    </SetupScreen>
  );
}

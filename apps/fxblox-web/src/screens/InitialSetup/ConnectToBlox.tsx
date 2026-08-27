/**
 * Port of apps/box/src/screens/InitialSetup/ConnectToBlox.screen.tsx.
 *
 * Mobile: one "Continue" that tries BLE, then (after 2 s) the hotspot API. Web (plan §WS4): two explicit buttons —
 *  - "Connect via Bluetooth": `BleSession.pick()` from the click (Chrome's chooser), `properties` over BLE, then
 *    on to SetBloxAuthorizer (the BLE session stays registered for the next steps);
 *  - "I'm on the FxBlox hotspot — check": a one-shot `HEAD /properties` (the FIRST LAN call — Chrome's Local
 *    Network Access prompt needs this gesture) whose `LanHttpError.kind` selects the help card, then background
 *    polling via `useHotspotReachable`. A success on the click navigates; a later background success shows a
 *    "Continue" button instead of pulling the screen away (advisor item).
 * After a BLE failure the HTTP check is NOT auto-fired (the chooser may have consumed the user activation the
 * LNA prompt needs) — the hotspot instructions + button are shown instead.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxText, FxTower, useToast } from '@functionland/fx-ui';
import { API_URL } from '@/api';
import { paths } from '@/app/paths';
import { errorMessage, runBleCommand, useBleConnect } from '@/components/setup/ble';
import { LanErrorCard, type LanFailureKind } from '@/components/setup/LanErrorCard';
import { LedGuide } from '@/components/setup/LedGuide';
import { SetupNav } from '@/components/setup/SetupNav';
import { SetupScreen } from '@/components/setup/SetupScreen';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useHotspotReachable } from '@/hooks/useHotspotReachable';
import { useLogger } from '@/hooks/useLogger';
import { EConnectionStatus } from '@/models';
import { isLanHttpError, lanFetch } from '@/platform/lanHttp';

export const HOTSPOT_PROBE_TIMEOUT_MS = 5000;

/** Mobile `checkApiAvailability` over HTTP: `HEAD /properties` (5 s) → reachable, or the failure kind. */
export async function probeHotspotDetailed(
  baseUrl: string = API_URL,
): Promise<'reachable' | LanFailureKind> {
  try {
    await lanFetch(`${baseUrl}/properties`, {
      method: 'HEAD',
      timeoutMs: HOTSPOT_PROBE_TIMEOUT_MS,
    });
    return 'reachable';
  } catch (e) {
    if (!isLanHttpError(e)) return 'unreachable';
    switch (e.kind) {
      case 'http':
        return 'reachable'; // the server answered (a HEAD on old firmware may 405)
      case 'aborted':
        return 'unreachable';
      default:
        return e.kind;
    }
  }
}

const CONNECTED_STATES = new Set<EConnectionStatus>([
  EConnectionStatus.connected,
  EConnectionStatus.bleConnected,
]);

export default function ConnectToBlox() {
  const { t } = useTranslation();
  const { navigate, back } = useAppNavigate();
  const { queueToast } = useToast();
  const logger = useLogger();
  const { connect: connectBle, connecting: bleConnecting } = useBleConnect();

  const [connectionStatus, setConnectionStatus] = useState<EConnectionStatus>(
    EConnectionStatus.notConnected,
  );
  const [showHotspotInstructions, setShowHotspotInstructions] = useState(false);
  const [lanError, setLanError] = useState<LanFailureKind | null>(null);
  const [checkingHotspot, setCheckingHotspot] = useState(false);
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const [backgroundReachable, setBackgroundReachable] = useState(false);
  const reachability = useHotspotReachable({ enabled: pollingEnabled });

  const handleNext = useCallback(() => {
    void navigate(paths.setup.setAuthorizer());
  }, [navigate]);

  // Background poll (after a failed explicit check) — offer Continue instead of navigating away (advisor item).
  useEffect(() => {
    if (pollingEnabled && reachability === 'reachable') {
      setPollingEnabled(false);
      setLanError(null);
      setShowHotspotInstructions(false);
      setConnectionStatus(EConnectionStatus.connected);
      setBackgroundReachable(true);
    }
  }, [pollingEnabled, reachability]);

  // Use translations for connection status strings
  const getConnectionStatusText = (status: EConnectionStatus): string => {
    switch (status) {
      case EConnectionStatus.connecting:
        return t('connectToBlox.checkingConnection');
      case EConnectionStatus.connected:
        return t('connectToBlox.connected');
      case EConnectionStatus.failed:
        return t('connectToBlox.failed');
      case EConnectionStatus.notConnected:
        return t('connectToBlox.notConnected');
      case EConnectionStatus.bleConnecting:
        return t('connectToBlox.bleConnecting');
      case EConnectionStatus.bleConnected:
        return t('connectToBlox.bleConnected');
      case EConnectionStatus.bleFailed:
        return t('connectToBlox.bleFailed');
      default:
        return '';
    }
  };

  const connectViaBLE = async () => {
    console.log('started connectToBox (BLE)');
    setConnectionStatus(EConnectionStatus.bleConnecting);
    setLanError(null);
    const { session, failure, error } = await connectBle();
    if (!session) {
      if (failure === 'cancelled') {
        setConnectionStatus(EConnectionStatus.notConnected);
        return;
      }
      setConnectionStatus(EConnectionStatus.bleFailed);
      setShowHotspotInstructions(true);
      logger.logError('connectViaBLE', error);
      queueToast({
        type: 'error',
        title: t('setup.bluetoothCommands.connectionFailed'),
        message:
          failure === 'unavailable' ? t('setup.connectToBlox.bleUnavailable') : errorMessage(error),
        autoHideDuration: 5000,
      });
      return;
    }
    setConnectionStatus(EConnectionStatus.bleConnected);
    console.log('checking API availability over BLE');
    try {
      const response = await runBleCommand('properties', session.id);
      if (response) {
        setConnectionStatus(EConnectionStatus.connected);
        handleNext();
        return;
      }
    } catch (error) {
      console.log('API availability check (BLE) failed:', error);
      logger.logError('connectToBox:bleProperties', error);
    }
    setConnectionStatus(EConnectionStatus.failed);
    setShowHotspotInstructions(true);
    queueToast({
      title: t('setup.connectToBlox.connectionError'),
      message: t('setup.connectToBlox.connectionErrorMessage'),
      type: 'error',
      autoHideDuration: 5000,
    });
  };

  const checkHotspot = async () => {
    console.log('started connectToBox (hotspot)');
    setCheckingHotspot(true);
    setConnectionStatus(EConnectionStatus.connecting);
    setLanError(null);
    setBackgroundReachable(false);
    try {
      const result = await probeHotspotDetailed();
      if (result === 'reachable') {
        setConnectionStatus(EConnectionStatus.connected);
        setShowHotspotInstructions(false);
        handleNext();
        return;
      }
      setConnectionStatus(EConnectionStatus.failed);
      setLanError(result);
      setShowHotspotInstructions(result === 'timeout' || result === 'unreachable');
      setPollingEnabled(true); // keep checking in the background (every 3 s)
      queueToast({
        title: t('setup.connectToBlox.connectionError'),
        message: t('setup.connectToBlox.connectionErrorMessage'),
        type: 'error',
        autoHideDuration: 5000,
      });
    } catch (error) {
      console.log('connectToBox', error);
      setConnectionStatus(EConnectionStatus.notConnected);
    } finally {
      setCheckingHotspot(false);
    }
  };

  const isConnected = CONNECTED_STATES.has(connectionStatus);
  const busy = bleConnecting || checkingHotspot;

  return (
    <SetupScreen id="connect-blox" title={t('connectToBlox.title')}>
      <FxBox alignItems="center" gap="16">
        <FxText variant="bodySmallRegular" color="content2" textAlign="center">
          {t('setup.connectToBlox.intro')}
        </FxText>
        <FxTower
          onColor="lightblue"
          onInterval={3000}
          offInterval={500}
          height={160}
          width={70}
          label={t('setup.setupComplete.towerLabel')}
        />

        {!isConnected && (
          <FxText
            as="p"
            variant="h200"
            textAlign="center"
            color={connectionStatus === EConnectionStatus.bleFailed ? 'warningBase' : 'primary'}
            role="status"
            testID="connection-status"
          >
            {getConnectionStatusText(connectionStatus)}
          </FxText>
        )}

        {isConnected ? (
          <FxText variant="h200" textAlign="center" color="primary" role="status">
            {t('connectToBlox.connectedMessage')}
          </FxText>
        ) : (
          <FxBox gap="16" width="100%">
            {pollingEnabled && (
              <FxText variant="bodySmallRegular" color="content3" textAlign="center">
                {t('setup.connectToBlox.checkingHotspot')}
              </FxText>
            )}
            {lanError && <LanErrorCard kind={lanError} />}
            {showHotspotInstructions && (
              <FxBox gap="8" testID="hotspot-instructions">
                <FxText variant="bodyMediumRegular" textAlign="center" color="content1">
                  {t('connectToBlox.hotspotInstructions')}
                </FxText>
                <FxText variant="bodySmallRegular" textAlign="center" color="content2">
                  {t('setup.connectToBlox.hotspotJoin')}
                </FxText>
              </FxBox>
            )}
            <LedGuide />
            {!lanError && (
              <FxText variant="bodyXSRegular" color="content3" textAlign="center">
                {t('setup.connectToBlox.lnaExplainer')}
              </FxText>
            )}
          </FxBox>
        )}
      </FxBox>

      <SetupNav
        onBack={() => back(paths.setup.linkPassword)}
        backDisabled={busy}
        above={
          backgroundReachable ? undefined : (
            <FxButton
              size="large"
              loading={checkingHotspot}
              disabled={bleConnecting}
              onPress={() => void checkHotspot()}
              testID="hotspot-check"
            >
              {t('setup.connectToBlox.hotspotCheck')}
            </FxButton>
          )
        }
      >
        {backgroundReachable ? (
          <FxButton size="large" flex={1} onPress={handleNext} testID="setup-continue">
            {t('connectToBlox.continue')}
          </FxButton>
        ) : (
          <FxButton
            variant="inverted"
            flex={1}
            loading={bleConnecting}
            disabled={checkingHotspot}
            onPress={() => void connectViaBLE()}
            testID="connect-ble"
          >
            {t('setup.connectToBlox.connectViaBluetooth')}
          </FxButton>
        )}
      </SetupNav>
    </SetupScreen>
  );
}

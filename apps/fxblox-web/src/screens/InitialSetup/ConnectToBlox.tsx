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
import { FxBox, FxButton, FxText, FxTextInput, FxTower, useToast } from '@functionland/fx-ui';
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
import { ipIsPrivateLan } from '@/utils/ipIsPrivateLan';
import { isLanHttpError, lanFetch } from '@/platform/lanHttp';

/** The WAP API port. An unconfigured Blox serves setup here on its LAN address as well as on the hotspot. */
export const DEFAULT_WAP_PORT = 3500;

export const HOTSPOT_PROBE_TIMEOUT_MS = 5000;

/**
 * `http://<ip>:3500` for a user-typed address, or null when it is not a private LAN address.
 *
 * The RFC1918/link-local gate is the hard backstop, applied here exactly as `aiTransport.qualifyManual` does
 * it: a typo or a paste of a public address must never send setup traffic — which includes `/peer/exchange`,
 * the call that claims the box — off the local network.
 */
export function bloxLanUrl(ip: string): string | null {
  const trimmed = ip.trim();
  return ipIsPrivateLan(trimmed) ? `http://${trimmed}:${DEFAULT_WAP_PORT}` : null;
}

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
  const [lanError, setLanError] = useState<LanFailureKind | null>(null);
  const [checkingHotspot, setCheckingHotspot] = useState(false);
  const [pollingEnabled, setPollingEnabled] = useState(false);
  const [backgroundReachable, setBackgroundReachable] = useState(false);
  const reachability = useHotspotReachable({ enabled: pollingEnabled });

  /**
   * One question at a time, in the order that needs least from the user.
   *
   *   bluetooth  no cables, no addresses, no network — just Chrome's device chooser.
   *   lan        only if Bluetooth failed. Needs the Blox on the network AND its address, so it is offered
   *              rather than assumed; the user can say "I don't know it" and move on.
   *   hotspot    the always-works fallback: join the Blox's own Wi-Fi. Costs the user their internet for a
   *              minute, which is why it is last rather than first.
   */
  const [stage, setStage] = useState<'bluetooth' | 'lan' | 'hotspot'>('bluetooth');
  const [lanIp, setLanIp] = useState('');
  const [checkingLan, setCheckingLan] = useState(false);
  const [lanIpRejected, setLanIpRejected] = useState(false);
  const [lanNotFound, setLanNotFound] = useState(false);

  const handleNext = useCallback(() => {
    void navigate(paths.setup.setAuthorizer());
  }, [navigate]);

  // Background poll (after a failed explicit check) — offer Continue instead of navigating away (advisor item).
  useEffect(() => {
    if (pollingEnabled && reachability === 'reachable') {
      setPollingEnabled(false);
      setLanError(null);
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
      setStage('lan');
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
    setStage('lan');
    queueToast({
      title: t('setup.connectToBlox.connectionError'),
      message: t('setup.connectToBlox.connectionErrorMessage'),
      type: 'error',
      autoHideDuration: 5000,
    });
  };

  /**
   * Try the Blox at a user-supplied LAN address.
   *
   * Fired ONLY from its own button press. The Bluetooth chooser that ran before this may have consumed the
   * user activation Chrome's local-network prompt needs, so probing automatically on entering this step would
   * ask for a permission the browser then refuses to show — the same reason the hotspot check was never
   * auto-fired after a BLE failure.
   */
  const connectViaLan = async () => {
    const base = bloxLanUrl(lanIp);
    if (!base) {
      setLanIpRejected(true);
      return;
    }
    setLanIpRejected(false);
    setLanNotFound(false);
    setCheckingLan(true);
    setConnectionStatus(EConnectionStatus.connecting);
    setLanError(null);
    try {
      const result = await probeHotspotDetailed(base);
      if (result === 'reachable') {
        setConnectionStatus(EConnectionStatus.connected);
        void navigate(paths.setup.setAuthorizer({ ip: lanIp.trim() }));
        return;
      }
      setConnectionStatus(EConnectionStatus.failed);
      // No answer is the EXPECTED outcome on firmware that predates the LAN setup listener, and on a Blox
      // that simply is not on this network. Treat it as "not found here" rather than an error; only a real
      // browser-level problem (permission, CORS) earns the error card.
      if (result === 'timeout' || result === 'unreachable') setLanNotFound(true);
      else setLanError(result);
    } finally {
      setCheckingLan(false);
    }
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
        handleNext();
        return;
      }
      setConnectionStatus(EConnectionStatus.failed);
      setLanError(result);
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
            {lanError && (
              <LanErrorCard
                kind={lanError}
                probeUrl={`${API_URL}/properties`}
                onGranted={() => void checkHotspot()}
              />
            )}

            {/* Step 2 — offered only after Bluetooth failed. */}
            {stage === 'lan' && (
              <FxBox
                gap="8"
                backgroundColor="backgroundPrimary"
                borderRadius="m"
                padding="16"
                testID="lan-step"
              >
                <FxText as="h2" variant="bodySmallSemibold" color="content1">
                  {t('setup.connectToBlox.lan.title')}
                </FxText>
                <FxText variant="bodySmallRegular" color="content2">
                  {t('setup.connectToBlox.lan.body')}
                </FxText>
                <FxTextInput
                  value={lanIp}
                  onChangeText={(v) => {
                    setLanIp(v);
                    setLanIpRejected(false);
                    setLanNotFound(false);
                  }}
                  placeholder={t('setup.connectToBlox.lan.placeholder')}
                  aria-label={t('setup.connectToBlox.lan.title')}
                  inputMode="numeric"
                  testID="lan-ip-input"
                />
                {lanIpRejected && (
                  <FxText variant="bodyXSRegular" color="errorBase" testID="lan-ip-rejected">
                    {t('setup.connectToBlox.lan.badAddress')}
                  </FxText>
                )}
                {lanNotFound && (
                  <FxText variant="bodyXSRegular" color="content2" testID="lan-not-found">
                    {t('setup.connectToBlox.lan.notFound')}
                  </FxText>
                )}
                <FxButton
                  loading={checkingLan}
                  disabled={bleConnecting || lanIp.trim().length === 0}
                  onPress={() => void connectViaLan()}
                  testID="lan-connect"
                >
                  {t('setup.connectToBlox.lan.connect')}
                </FxButton>
                <FxButton
                  variant="inverted"
                  size="small"
                  onPress={() => setStage('hotspot')}
                  testID="lan-skip"
                >
                  {t('setup.connectToBlox.lan.skip')}
                </FxButton>
              </FxBox>
            )}

            {/* Step 3 — the always-works fallback. */}
            {stage === 'hotspot' && (
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
            {/*
              One hint per stage, about the button the user is looking at. The local-network explainer used to
              show from the first paint, where it describes a permission nothing is about to ask for and reads
              as jargon; it belongs to the two stages that actually make a LAN request.
            */}
            {!lanError && (
              <FxText variant="bodyXSRegular" color="content3" textAlign="center">
                {stage === 'bluetooth'
                  ? t('setup.connectToBlox.bleChooserHint')
                  : t('setup.connectToBlox.lnaExplainer')}
              </FxText>
            )}
          </FxBox>
        )}
      </FxBox>

      <SetupNav
        onBack={() => back(paths.setup.linkPassword)}
        backDisabled={busy}
        above={
          // The hotspot check appears only once we have actually got that far. Showing all three routes at
          // once is what made this screen a menu of technical choices rather than a next step.
          !backgroundReachable && stage === 'hotspot' ? (
            <FxButton
              size="large"
              loading={checkingHotspot}
              disabled={bleConnecting}
              onPress={() => void checkHotspot()}
              testID="hotspot-check"
            >
              {t('setup.connectToBlox.hotspotCheck')}
            </FxButton>
          ) : undefined
        }
      >
        {backgroundReachable ? (
          <FxButton size="large" flex={1} onPress={handleNext} testID="setup-continue">
            {t('connectToBlox.continue')}
          </FxButton>
        ) : (
          <FxButton
            variant={stage === 'bluetooth' ? 'defaults' : 'inverted'}
            flex={1}
            loading={bleConnecting}
            disabled={checkingHotspot || checkingLan}
            onPress={() => void connectViaBLE()}
            testID="connect-ble"
          >
            {stage === 'bluetooth'
              ? t('setup.connectToBlox.connectViaBluetooth')
              : t('setup.connectToBlox.retryBluetooth')}
          </FxButton>
        )}
      </SetupNav>
    </SetupScreen>
  );
}

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
import { discoverUnownedBloxes } from '@/services/setupDiscovery';
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

const FAILED_STATES = new Set<EConnectionStatus>([
  EConnectionStatus.failed,
  EConnectionStatus.bleFailed,
  EConnectionStatus.lanFailed,
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
   * One question at a time, easiest route first.
   *
   *   lan        plug an ethernet adapter in and press Search. go-fula opens the setup API on the LAN for as
   *              long as the box is unowned, and keeps those listeners in step with the interfaces, so a cable
   *              plugged in AFTER boot is picked up too. Nothing to type, nothing to pair, and the browser
   *              keeps its internet — which is why it leads.
   *   bluetooth  when there is no adapter, or the search found nothing. Chrome's device chooser, no cables.
   *   hotspot    the always-works fallback: join the Blox's own Wi-Fi. Costs the user their internet for a
   *              minute, which is why it is last.
   */
  const [stage, setStage] = useState<'lan' | 'bluetooth' | 'hotspot'>('lan');
  const [lanIp, setLanIp] = useState('');
  const [checkingLan, setCheckingLan] = useState(false);
  const [lanIpRejected, setLanIpRejected] = useState(false);
  const [lanNotFound, setLanNotFound] = useState(false);
  const [searching, setSearching] = useState(false);
  /** Shown once a search came back empty: the manual-address field is the next thing worth trying. */
  const [searchFailed, setSearchFailed] = useState(false);

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
      case EConnectionStatus.lanFailed:
        return t('connectToBlox.lanFailed');
      default:
        return '';
    }
  };

  /**
   * Search the network for a Blox that has not been set up yet.
   *
   * Its own button press, like every other LAN call here: Chrome's local-network prompt needs a gesture, and a
   * scan fired on mount would ask for a permission the browser then refuses to show.
   */
  const searchNetwork = async () => {
    setSearching(true);
    setSearchFailed(false);
    setLanNotFound(false);
    setLanError(null);
    setConnectionStatus(EConnectionStatus.connecting);
    try {
      const outcome = await discoverUnownedBloxes();
      const first = outcome.found[0];
      if (first) {
        setConnectionStatus(EConnectionStatus.connected);
        void navigate(paths.setup.setAuthorizer({ ip: first.host }));
        return;
      }
      setConnectionStatus(EConnectionStatus.lanFailed);
      // A refused permission is not an absent Blox, and saying so sends the user after a cable fault they do
      // not have. The error card explains the permission; everything else is an honest "not on this network".
      if (outcome.failure === 'blocked') setLanError('lna-denied');
      else setSearchFailed(true);
    } finally {
      setSearching(false);
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
      // The LAN step already had its turn before this one, so the next thing to offer is the hotspot.
      setStage('hotspot');
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
    setStage('hotspot');
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
      // NOT `failed`: that status reads "Unable to connect to Hotspot", and the hotspot is not what was
      // tried — naming it here tells the user something untrue about a step they have not reached.
      setConnectionStatus(EConnectionStatus.lanFailed);
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
        {/*
          The intro promises Bluetooth and says other ways will follow. Once one of those other ways is on
          screen it is describing a step the user has already left, so it goes with the stage it belongs to.
        */}
        {stage !== 'hotspot' && (
          <FxText variant="bodySmallRegular" color="content2" textAlign="center">
            {stage === 'lan'
              ? t('setup.connectToBlox.lanIntro')
              : t('setup.connectToBlox.intro')}
          </FxText>
        )}
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
            // A failure printed in the same teal as "Connected" reads as good news at a glance.
            color={FAILED_STATES.has(connectionStatus) ? 'warningBase' : 'primary'}
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

            {/* Step 1 — the easiest route: a cable and one button. */}
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
                <FxButton
                  loading={searching}
                  disabled={bleConnecting || checkingLan}
                  onPress={() => void searchNetwork()}
                  testID="lan-search"
                >
                  {t('setup.connectToBlox.lan.search')}
                </FxButton>
                {searchFailed && (
                  <FxText variant="bodyXSRegular" color="content2" testID="lan-search-failed">
                    {t('setup.connectToBlox.lan.searchFailed')}
                  </FxText>
                )}
                {/*
                  The address field is the second thing to try, not the first — it only helps someone who can
                  read their router's device list, so it stays out of the way until the search has come up empty.
                */}
                {searchFailed && (
                  <FxText variant="bodyXSRegular" color="content3">
                    {t('setup.connectToBlox.lan.manualHint')}
                  </FxText>
                )}
                {searchFailed && (
                  <>
                    <FxTextInput
                      value={lanIp}
                      onChangeText={(v) => {
                        setLanIp(v);
                        setLanIpRejected(false);
                        setLanNotFound(false);
                      }}
                      placeholder={t('setup.connectToBlox.lan.placeholder')}
                      aria-label={t('setup.connectToBlox.lan.manualHint')}
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
                      variant="inverted"
                      loading={checkingLan}
                      disabled={bleConnecting || lanIp.trim().length === 0}
                      onPress={() => void connectViaLan()}
                      testID="lan-connect"
                    >
                      {t('setup.connectToBlox.lan.connect')}
                    </FxButton>
                  </>
                )}
                {/*
                  The way out, for someone with no adapter — and, after a failed search, the way on. Both land
                  on Bluetooth, which is the next-easiest route and the one that needs no network at all.
                */}
                <FxButton
                  variant="inverted"
                  size="small"
                  onPress={() => {
                    // Leave the previous step's verdict behind. Carrying it forward pre-announces a Bluetooth
                    // failure the user has not had the chance to cause yet.
                    setStage('bluetooth');
                    setConnectionStatus(EConnectionStatus.notConnected);
                    setLanError(null);
                    setLanNotFound(false);
                    setSearchFailed(false);
                  }}
                  testID="lan-skip"
                >
                  {searchFailed
                    ? t('setup.connectToBlox.lan.useBluetooth')
                    : t('setup.connectToBlox.lan.noAdapter')}
                </FxButton>
              </FxBox>
            )}

            {/* Step 3 — the always-works fallback. */}
            {stage === 'hotspot' && (
              <FxBox gap="8" testID="hotspot-instructions">
                {/*
                  One instruction, not two. The mobile app's line ("connect your PHONE to the hotspot and turn
                  off mobile data") said the same thing again in terms that are wrong here — the browser is as
                  often a laptop — so the web wording carries it alone.
                */}
                <FxText variant="bodyMediumRegular" textAlign="center" color="content1">
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
          // Not on the LAN step: there the primary action is Search, inside the card, and a Bluetooth button
          // beside it would put the two routes back on screen at once — the menu-of-choices this ladder exists
          // to avoid. Bluetooth is one tap away via "I don't have an adapter".
          stage !== 'lan' && (
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
          )
        )}
      </SetupNav>
    </SetupScreen>
  );
}

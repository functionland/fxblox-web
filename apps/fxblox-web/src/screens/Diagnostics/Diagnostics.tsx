/**
 * Blox AI / Diagnostics (`/blox-ai?scenario=`) — port of apps/box/src/screens/Diagnostics/Diagnostics.screen.tsx.
 *
 * Web specifics (plan §WS4): this device's connectivity uses `navigator.onLine` + the no-cors internet probe;
 * discovery + relay list come from `services/discoveryClient.listRelays` and relay reachability is `'unsupported'`
 * ("Can't be tested from a browser") with the list's freshness; Web Bluetooth needs a gesture, so "Connect
 * Bluetooth" is a button; `?scenario` is consumed once (`useConsumeOnce`); the Blox AI LAN-only notice.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxCard, FxSpinner, FxText, cn } from '@functionland/fx-ui';
import { useConsumeOnce } from '@/hooks/useConsumeOnce';
import { useActivePluginsForCurrentBlox, useRefetchActivePluginsOnConnect } from '@/hooks/usePluginsForBlox';
import { useBloxsStore } from '@/stores/useBloxsStore';
import { useUserProfileStore } from '@/stores/useUserProfileStore';
import { onOnlineChange } from '@/platform/network';
import { QUICK_START_SCENARIOS, type ScenarioId } from '@/features/diagnostics/quickStartPrompts';
import { MainScreen } from '@/components/main/MainScreen';
import { useEnsureFulaClient } from '@/components/main/useEnsureFulaClient';
import { BloxAiSessionBlock } from './BloxAiSessionBlock';
import { RawDiagnosticsCard } from './RawDiagnosticsCard';
import { useBleTransport } from './useBleTransport';
import {
  computePluginPresence,
  probeBrowserInternet,
  probeDiscoveryAndListRelays,
  relayFreshness,
  type PluginPresence,
  type ProbeStatus,
  type RelayInfo,
  type RelaySource,
} from './probes';

const isScenarioId = (v: string | null): v is ScenarioId => !!v && v in QUICK_START_SCENARIOS;

function ProbeLine({ status, checking, ok, failed, testID }: { status: ProbeStatus; checking: string; ok: string; failed: string; testID?: string }) {
  if (status === 'checking') {
    return (
      <FxBox flexDirection="row" alignItems="center" gap="8" testID={testID} data-status={status}>
        <FxSpinner label={null} />
        <FxText>{checking}</FxText>
      </FxBox>
    );
  }
  return (
    <FxText color={status === 'ok' ? 'successBase' : 'errorBase'} testID={testID} data-status={status}>
      {status === 'ok' ? ok : failed}
    </FxText>
  );
}

export default function Diagnostics() {
  const { t } = useTranslation();
  useEnsureFulaClient();
  // `?scenario=` — the mobile `prefillScenario` param: read once, stripped from the URL.
  const scenarioParam = useConsumeOnce('scenario');
  const prefillScenario: ScenarioId | null = isScenarioId(scenarioParam) ? scenarioParam : null;
  const [showPrefillNote, setShowPrefillNote] = useState(prefillScenario !== null);
  const hidePrefillNote = useCallback(() => setShowPrefillNote(false), []);

  const { plugins: activePlugins, status: pluginsStatus } = useActivePluginsForCurrentBlox();
  useRefetchActivePluginsOnConnect();
  const appPeerId = useUserProfileStore((s) => s.appPeerId) ?? '';
  const currentBloxPeerId = useBloxsStore((s) => s.currentBloxPeerId) ?? '';
  // ipfs-cluster peer id; a value equal to the kubo id is a stale migration default → null.
  const clusterPeerId = useBloxsStore((s) => {
    const id = s.currentBloxPeerId;
    if (!id) return null;
    const stored = s.bloxs[id]?.clusterPeerId;
    return stored && stored !== id ? stored : null;
  });

  const [online, setOnline] = useState<boolean | null>(() =>
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : null,
  );
  const [internet, setInternet] = useState<ProbeStatus>('checking');
  const [discoveryStatus, setDiscoveryStatus] = useState<ProbeStatus>('checking');
  const [relays, setRelays] = useState<RelayInfo[] | null>(null);
  const [relaySource, setRelaySource] = useState<RelaySource>('none');
  const [relayFetchedAt, setRelayFetchedAt] = useState<number | undefined>(undefined);
  const [manualIp, setManualIp] = useState<string | null>(null);

  const ble = useBleTransport(currentBloxPeerId || undefined);

  useEffect(() => {
    let cancelled = false;
    const off = onOnlineChange(setOnline);
    void probeBrowserInternet().then((s) => {
      if (!cancelled) setInternet(s);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void probeDiscoveryAndListRelays().then((r) => {
      if (cancelled) return;
      setDiscoveryStatus(r.discovery);
      setRelays(r.relays);
      setRelaySource(r.source);
      setRelayFetchedAt(r.fetchedAt);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pluginPresence: PluginPresence = computePluginPresence(activePlugins, pluginsStatus);

  const freshness = relayFetchedAt !== undefined ? relayFreshness(relayFetchedAt) : null;

  return (
    <MainScreen screen="blox-ai" width="diagnostics" className="gap-3" testID="diagnostics-screen">
      <FxText as="h1" variant="h300">
        {t('diagnostics.screenTitle')}
      </FxText>
      {prefillScenario && showPrefillNote && (
        <FxText variant="bodySmallRegular" color="content2" testID="diagnostics-prefill">
          {t('main.diagnostics.prefillHint')}{' '}
          <code data-param="prefillScenario" className="rounded-fx-s bg-background-secondary px-1 font-mono">
            {prefillScenario}
          </code>
        </FxText>
      )}

      {/* ───────── This device ───────── */}
      <FxCard testID="diag-connectivity-card">
        <FxCard.Title>{t('main.diagnostics.browserConnectivityTitle')}</FxCard.Title>
        <FxBox paddingVertical="8" gap="4">
          <FxText testID="diag-online" data-online={online}>
            {online === null
              ? t('main.diagnostics.onlineChecking')
              : online
                ? t('main.diagnostics.onlineConnected')
                : t('main.diagnostics.onlineDisconnected')}
          </FxText>
          <ProbeLine
            status={internet}
            checking={t('main.diagnostics.internetChecking')}
            ok={t('main.diagnostics.internetOk')}
            failed={t('main.diagnostics.internetFailed')}
            testID="diag-internet"
          />
        </FxBox>
      </FxCard>

      {/* ───────── Fula network ───────── */}
      <FxCard testID="diag-fula-network-card">
        <FxCard.Title>{t('diagnostics.fulaNetworkTitle')}</FxCard.Title>
        <FxBox paddingVertical="8" gap="8">
          <ProbeLine
            status={discoveryStatus}
            checking={t('diagnostics.discoveryChecking')}
            ok={t('diagnostics.discoveryOk')}
            failed={t('diagnostics.discoveryFailed')}
            testID="diag-discovery"
          />
          {relays === null ? (
            <FxBox flexDirection="row" alignItems="center" gap="8">
              <FxSpinner label={null} />
              <FxText>{t('diagnostics.relaysChecking')}</FxText>
            </FxBox>
          ) : relays.length === 0 ? (
            <FxText variant="bodySmallRegular" testID="diag-relays-none">
              {t('diagnostics.relaysUnknown')}
            </FxText>
          ) : (
            <FxBox gap="4">
              <FxText variant="bodySmallRegular">{t('diagnostics.relaysListLabel')}</FxText>
              <FxText variant="bodyXSRegular" color="content3" testID="diag-relays-source" data-source={relaySource}>
                {/* `hardcoded` used to fall through to "No relay list is available." and print that line
                    directly above the relay it had just listed. */}
                {relaySource === 'live'
                  ? t('main.diagnostics.relaysSourceLive')
                  : relaySource === 'cache'
                    ? t('main.diagnostics.relaysSourceCache')
                    : relaySource === 'hardcoded'
                      ? t('main.diagnostics.relaysSourceHardcoded')
                      : t('main.diagnostics.relaysSourceNone')}
                {freshness
                  ? ` · ${t('main.diagnostics.relaysFetched', { when: t(`main.diagnostics.${freshness.key}`, { count: freshness.count }) })}`
                  : ''}
              </FxText>
              <FxBox as="ul" className="m-0 list-none p-0" gap="4" testID="diag-relays">
                {relays.map((r) => (
                  <FxBox as="li" key={r.dnsName} flexDirection="row" alignItems="center" justifyContent="space-between" gap="8" data-relay={r.dnsName}>
                    <FxText variant="bodySmallRegular" className="font-mono">
                      {r.dnsName}
                    </FxText>
                    <FxText variant="bodyXSRegular" color="content3" data-relay-status={r.status}>
                      {r.status === 'unsupported'
                        ? t('main.diagnostics.relaysUnsupported')
                        : r.status === 'ok'
                          ? '✓'
                          : r.status === 'failed'
                            ? '✗'
                            : '…'}
                    </FxText>
                  </FxBox>
                ))}
              </FxBox>
              <FxText variant="bodyXSRegular" color="content3">
                {t('main.diagnostics.relaysUnsupportedHint')}
              </FxText>
            </FxBox>
          )}
        </FxBox>
      </FxCard>

      {/* ───────── Plugin presence ───────── */}
      <FxCard testID="diag-plugin-card" data-presence={pluginPresence}>
        <FxCard.Title>{t('diagnostics.pluginStatusTitle')}</FxCard.Title>
        <FxBox paddingVertical="8" gap="4">
          {pluginPresence === 'checking' ? (
            <FxBox flexDirection="row" alignItems="center" gap="8">
              <FxSpinner label={null} />
              <FxText>{t('diagnostics.pluginChecking')}</FxText>
            </FxBox>
          ) : pluginPresence === 'installed' ? (
            <>
              <FxText color="successBase">{t('diagnostics.pluginInstalled')}</FxText>
              <FxText variant="bodySmallRegular">{t('diagnostics.pluginInstalledHint')}</FxText>
            </>
          ) : (
            <>
              <FxText>{t('diagnostics.pluginNotDetected')}</FxText>
              <FxText variant="bodySmallRegular">{t('diagnostics.pluginNotDetectedHint')}</FxText>
            </>
          )}
        </FxBox>
      </FxCard>

      {/* ───────── Bluetooth (explicit user gesture) ───────── */}
      <FxCard testID="diag-bluetooth-card" data-ble-status={ble.status}>
        <FxCard.Title>{t('main.diagnostics.bluetoothTitle')}</FxCard.Title>
        <FxBox paddingVertical="8" gap="8">
          <FxText variant="bodySmallRegular" testID="diag-bluetooth-status">
            {ble.status === 'unsupported'
              ? t('main.diagnostics.bluetoothUnsupported')
              : ble.status === 'connected'
                ? t('main.diagnostics.bluetoothConnected', { name: ble.deviceName ?? ble.blePeripheralId ?? '' })
                : ble.status === 'error'
                  ? t('main.diagnostics.bluetoothFailed', { error: ble.error ?? '' })
                  : t('main.diagnostics.bluetoothNotConnected')}
          </FxText>
          {ble.status !== 'unsupported' && ble.status !== 'connected' && (
            <FxButton
              variant="inverted"
              onPress={() => void ble.connect()}
              loading={ble.status === 'connecting'}
              className={cn('self-start')}
              testID="diag-connect-bluetooth"
            >
              {ble.status === 'connecting' ? t('main.diagnostics.connectingBluetooth') : t('main.diagnostics.connectBluetooth')}
            </FxButton>
          )}
          <FxText variant="bodyXSRegular" color="content3">
            {t('main.diagnostics.bluetoothHint')}
          </FxText>
        </FxBox>
      </FxCard>

      <FxText variant="bodyXSRegular" color="content3" role="note" testID="diag-lan-notice">
        {t('main.diagnostics.lanOnlyNotice')}
      </FxText>

      {pluginPresence === 'installed' && appPeerId && currentBloxPeerId && (
        <BloxAiSessionBlock
          appPeerId={appPeerId}
          bloxPeerId={currentBloxPeerId}
          prefillScenario={prefillScenario}
          bleManager={ble.bleManager}
          blePeripheralId={ble.blePeripheralId}
          onManualIpChange={setManualIp}
          onSessionStarted={hidePrefillNote}
        />
      )}

      {pluginPresence !== 'checking' && (
        <RawDiagnosticsCard
          pluginInstalled={pluginPresence === 'installed'}
          bloxKuboPeerId={currentBloxPeerId}
          bloxClusterPeerId={clusterPeerId}
          appPeerId={appPeerId}
          phoneInternet={internet}
          discoveryStatus={discoveryStatus}
          relays={relays}
          bleManager={ble.bleManager}
          blePeripheralId={ble.blePeripheralId}
          manualIp={manualIp}
        />
      )}
    </MainScreen>
  );
}

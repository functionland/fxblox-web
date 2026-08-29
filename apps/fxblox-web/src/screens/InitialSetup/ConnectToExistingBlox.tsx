/**
 * Port of apps/box/src/screens/InitialSetup/ConnectToExistingBlox.screen.tsx ("Bloxs in your network").
 *
 * "Scan" does two unrelated things at once.
 *
 * The first probes candidate addresses with `GET /properties` and maps the answers to the mobile
 * `MDNSBloxService` record shape (dedupe by hardwareID, feed `lanIpCache.noteRecord`): the FxBlox hotspot host,
 * every LAN-IP cache record, the manual IPs saved for known Bloxs, and the private `/ip4/` addrs the discovery
 * service (`findBox`) reports for known Bloxs. Note what those have in common — every one is derived from a
 * Blox the app ALREADY knows. On a fresh install this list is empty but for the hotspot, so the scan could only
 * ever come back empty, which is precisely the state this screen exists to get out of.
 *
 * The second closes that circle: `services/lanDiscovery.ts` resolves the Blox's `.local` name and reads its
 * peer id, finding a device the app has never seen. It cannot learn anything else — no authorizer, no hardware
 * id, since those live in an mDNS TXT record no browser can read — so those results render in their own section
 * and go down the same route as the manual peer-id field rather than pretending to be full device records.
 *
 * "Scan via Bluetooth" reads `properties` over a BLE session picked from the click; the manual-IP card goes
 * straight to SetBloxAuthorizer (LAN setup).
 *
 * Device cards, the Authorized / Not Authorized / New Device tags, multi-select, "Setup" for unpaired devices,
 * the peer-id-mismatch help and `addBloxs` (re-keying by hardwareID / cluster id, unique names, first selected
 * becomes current) are verbatim. "Add selected" then consumes a stashed deep link (plan §WS4) or goes to /blox.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxCard,
  FxExclamationIcon,
  FxIconButton,
  FxInfoIcon,
  FxRadioButton,
  FxSpinner,
  FxTag,
  FxText,
  FxTextInput,
  useConfirm,
  useToast,
} from '@functionland/fx-ui';
import { API_URL } from '@/api';
import { getBloxPropertiesAtIp } from '@/api/bloxHardware';
import { consumeDeepLinkStash } from '@/app/deepLinkStash';
import { paths } from '@/app/paths';
import { errorMessage, runBleCommand, useBleConnect } from '@/components/setup/ble';
import { PeerIdRow } from '@/components/setup/PeerIdRow';
import { SetupNav } from '@/components/setup/SetupNav';
import { SetupScreen } from '@/components/setup/SetupScreen';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useLogger } from '@/hooks/useLogger';
import type { MDNSBloxService, TBloxProperty } from '@/models';
import { hostOf } from '@/platform/lanHttp';
import { findBox } from '@/services/discoveryClient';
import { discoverBloxesOnLan, type LanBlox } from '@/services/lanDiscovery';
import { useBloxsStore } from '@/stores/useBloxsStore';
import { useUserProfileStore } from '@/stores/useUserProfileStore';
import { normalizeBloxPeerId } from '@/utils/bloxPeerId';
import { generateUniqueBloxName } from '@/utils/bloxName';
import * as Helper from '@/utils/helper';
import { ipIsPrivateLan } from '@/utils/ipIsPrivateLan';
import * as lanIpCache from '@/utils/lanIpCache';
import { loadManualBloxIp } from '@/utils/manualBloxIp';

export const DEFAULT_WAP_PORT = 3500;

export type DiscoveredBlox = MDNSBloxService & { source: 'lan' | 'ble' };

/** `/properties` answer at `ip:port` → the mDNS record shape the pairing flow consumes. */
export function deviceFromProperties(
  props: Partial<TBloxProperty>,
  opts: { ip?: string; port?: number; source: 'lan' | 'ble'; host?: string },
): DiscoveredBlox {
  const ip = opts.ip ?? '';
  const peerId = props.kubo_peer_id || 'NA';
  return {
    addresses: ip ? [ip] : [],
    fullName: `${opts.host ?? ip}._fulatower._tcp`,
    host: opts.host ?? ip,
    name: 'fulatower',
    port: opts.port ?? DEFAULT_WAP_PORT,
    txt: {
      authorizer: props.authorizer ?? '',
      bloxPeerIdString: peerId,
      hardwareID: props.hardwareID || peerId || ip,
      poolName: '',
      ipfsClusterID: props.ipfs_cluster_peer_id,
      ipAddress: ip || undefined,
    },
    source: opts.source,
  };
}

function portOf(url: string): number | undefined {
  try {
    const p = new URL(url).port;
    return p ? Number(p) : undefined;
  } catch {
    return undefined;
  }
}

/** Candidate `ip:port` targets for the LAN scan (see the file header). */
export async function collectScanCandidates(
  knownPeerIds: string[],
): Promise<Array<{ ip: string; port: number }>> {
  const targets = new Map<string, number>();
  const apHost = hostOf(API_URL);
  if (apHost) targets.set(apHost, portOf(API_URL) ?? DEFAULT_WAP_PORT);
  for (const rec of lanIpCache._internalRecords().values()) {
    const ip = rec.service.txt?.ipAddress ?? rec.service.addresses[0];
    if (ip && !targets.has(ip)) {
      const port = rec.service.port;
      targets.set(ip, port && port !== 8080 ? port : DEFAULT_WAP_PORT);
    }
  }
  for (const peerId of knownPeerIds) {
    try {
      const manual = await loadManualBloxIp(peerId);
      if (manual && ipIsPrivateLan(manual) && !targets.has(manual))
        targets.set(manual, DEFAULT_WAP_PORT);
    } catch {
      /* ignore */
    }
    try {
      const addrs = await findBox(peerId);
      for (const ip of lanIpCache.privateIpsFromMultiaddrs(addrs)) {
        if (!targets.has(ip)) targets.set(ip, DEFAULT_WAP_PORT);
      }
    } catch {
      /* discovery is best effort */
    }
  }
  return [...targets].map(([ip, port]) => ({ ip, port }));
}

export default function ConnectToExistingBlox() {
  const { t } = useTranslation();
  const { navigate, back } = useAppNavigate();
  const { queueToast, showToast } = useToast();
  const { alert } = useConfirm();
  const logger = useLogger();
  const { connect: connectBle, connecting: bleConnecting } = useBleConnect();

  const [data, setData] = useState<DiscoveredBlox[]>([]);
  const [scanning, setScanning] = useState(false);
  /** Bloxes found by resolving a .local name — peer id only, so they render in their own section. */
  const [lanFound, setLanFound] = useState<LanBlox[]>([]);
  /** "Nothing found" is only true once something has looked. Nothing scans on arrival any more. */
  const [hasScanned, setHasScanned] = useState(false);
  const [addingBloxs, setAddingBloxs] = useState(false);
  const [checkboxState, setCheckboxState] = useState<Record<string, boolean>>({});
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualPeerId, setManualPeerId] = useState('');

  const appPeerId = useUserProfileStore((state) => state.appPeerId);
  const setAppPeerId = useUserProfileStore((state) => state.setAppPeerId);
  const signiture = useUserProfileStore((state) => state.signiture);
  const password = useUserProfileStore((state) => state.password);
  const bloxs = useBloxsStore((state) => state.bloxs);
  const bloxsPropertyInfo = useBloxsStore((state) => state.bloxsPropertyInfo);
  const addBlox = useBloxsStore((state) => state.addBlox);
  const removeBlox = useBloxsStore((state) => state.removeBlox);
  const updateBloxStore = useBloxsStore((state) => state.update);

  // Persist uniqueDevices across renders (dedupe by hardwareID, as mobile)
  const uniqueDevicesRef = useRef(new Map<string, true>());
  const scanGeneration = useRef(0);

  const addDevice = useCallback((resolved: DiscoveredBlox) => {
    try {
      lanIpCache.noteRecord(resolved);
    } catch {
      // Never let cache plumbing break the pairing flow.
    }
    const hw = resolved.txt?.hardwareID;
    if (!uniqueDevicesRef.current.has(hw)) {
      uniqueDevicesRef.current.set(hw, true);
      setData((prev) => [resolved, ...prev.filter((device) => device.txt?.hardwareID !== hw)]);
    } else {
      // Same hardware seen again (e.g. via Bluetooth after LAN): refresh the record in place.
      setData((prev) => prev.map((device) => (device.txt?.hardwareID === hw ? resolved : device)));
    }
  }, []);

  const generateAppPeerId = useCallback(async () => {
    try {
      const peerId = await Helper.initFula({
        password: password ?? '',
        signiture: signiture ?? '',
      });
      setAppPeerId(peerId);
    } catch (error) {
      showToast({
        type: 'error',
        message: t('connectToExistingBlox.generateAppPeerIdError') + errorMessage(error),
      });
      logger.logError('ConnectToExistingBloxScreen:generateAppPeerId', error);
    }
  }, [password, signiture, setAppPeerId, showToast, t, logger]);

  const scanLan = useCallback(async () => {
    const generation = ++scanGeneration.current;
    console.log('[Scan] Starting LAN scan for Blox devices');
    setScanning(true);
    setData([]);
    setLanFound([]);
    uniqueDevicesRef.current = new Map();
    try {
      const candidates = await collectScanCandidates(Object.keys(bloxs));
      await Promise.all([
        ...candidates.map(async ({ ip, port }) => {
          try {
            const res = await getBloxPropertiesAtIp(ip, port);
            if (scanGeneration.current !== generation) return;
            if (res?.data && typeof res.data === 'object')
              addDevice(deviceFromProperties(res.data, { ip, port, source: 'lan' }));
          } catch (error) {
            console.log(`[Scan] ${ip}:${port} did not answer`, error);
          }
        }),
        // The candidates above are all derived from Bloxes the app ALREADY knows, so on a fresh install there
        // is nothing to probe and the scan could only ever come back empty — which is what it did. This finds
        // a Blox the app has never seen, by resolving its `.local` name. See services/lanDiscovery.ts.
        (async () => {
          try {
            const found = await discoverBloxesOnLan();
            if (scanGeneration.current !== generation) return;
            console.log(`[Scan] mDNS name probe found ${found.length}`, found);
            // Deliberately NOT filtered to Bloxes the app lacks. Hiding the ones it already has meant that
            // finding your only Blox, already added, rendered "Nothing answered on this network" — which is
            // false, and is the single most confusing thing this screen could say. They are shown and marked.
            setLanFound(found);
          } catch (error) {
            console.log('[Scan] mDNS name probe failed', error);
          }
        })(),
      ]);
    } catch (error) {
      console.log('[Scan] Error scanning:', error);
      logger.logError('ConnectToExistingBloxScreen:scan', error);
    } finally {
      if (scanGeneration.current === generation) {
        setScanning(false);
        setHasScanned(true);
      }
    }
  }, [bloxs, addDevice, logger]);

  const scanBle = async () => {
    const { session, failure, error } = await connectBle();
    if (!session) {
      if (failure !== 'cancelled') {
        logger.logError('ConnectToExistingBloxScreen:scanBle', error);
        queueToast({
          type: 'error',
          title: t('setup.bluetoothCommands.connectionFailed'),
          message:
            failure === 'unavailable'
              ? t('setup.connectToBlox.bleUnavailable')
              : errorMessage(error),
        });
      }
      return;
    }
    try {
      // Kept as `unknown`: narrowing it to the happy-path type up front is what made the failure branch
      // unable to describe what actually came back.
      const response: unknown = await runBleCommand('properties', session.id);
      if (response && typeof response === 'object') {
        addDevice(
          deviceFromProperties(response as Partial<TBloxProperty>, {
            source: 'ble',
            host: session.name ?? 'bluetooth',
          }),
        );
      } else {
        // Say what came back. "empty properties response" was reported for anything that was not an object,
        // including a perfectly non-empty string, which told nobody anything.
        throw new Error(
          `the Blox answered with ${typeof response}${
            typeof response === 'string' ? `: ${response.slice(0, 120)}` : ''
          }, not its properties`,
        );
      }
    } catch (error) {
      logger.logError('ConnectToExistingBloxScreen:scanBle', error);
      queueToast({
        type: 'error',
        title: t('setup.connectToExistingBlox.bleScanFailed'),
        message: errorMessage(error),
      });
    }
  };

  const mountedScan = useRef(false);
  useEffect(() => {
    if (mountedScan.current) return;
    mountedScan.current = true;
    if (!appPeerId) void generateAppPeerId();
    // The network scan is NOT fired on arrival any more. This screen exists to add a Blox you already own,
    // and such a Blox answers nothing on the network — it stops serving the setup API the moment it has an
    // owner. So the scan structurally cannot find the very thing this screen is for, yet it ran for ~15 s
    // (the hotspot probe alone waits that long) before the user could do anything, and then said "make sure
    // your Blox is powered on and connected to the same network" — advice that could not have helped.
    // It stays available as an explicit button: it does find a Blox that has NOT been set up yet, and one
    // reached over its own hotspot.
  }, [appPeerId, generateAppPeerId]);

  const handleOnItemPress = (id: string) => {
    setCheckboxState((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  };

  const addBloxs = () => {
    const bloxsCount = Object.values(bloxs).length;
    let firstBlox = true;
    setAddingBloxs(true);

    const propertyInfo = bloxsPropertyInfo ?? {};
    const bloxsProperties: Record<string, string> = Object.keys(propertyInfo).reduce(
      (obj, peerId) => {
        const hardwareID = propertyInfo[peerId]?.hardwareID;
        if (hardwareID) obj[hardwareID] = peerId;
        return obj;
      },
      {} as Record<string, string>,
    );

    setTimeout(() => {
      try {
        data.forEach((device, index) => {
          const bloxPeerId = device?.txt?.bloxPeerIdString;
          if (bloxPeerId && checkboxState[bloxPeerId]) {
            // Remove bloxes with same hardware Id and different peerId
            const existingForHardware = bloxsProperties[device.txt.hardwareID];
            if (existingForHardware && existingForHardware !== bloxPeerId) {
              removeBlox(existingForHardware);
            }
            // Ensure unique name for each new Blox
            const existingNames = Object.values(bloxs).map((b) => b.name);
            const baseName =
              bloxs[bloxPeerId]?.name ??
              `${t('connectToExistingBlox.bloxUnitPrefix')} #${bloxsCount + index + 1}`;
            const uniqueName = generateUniqueBloxName(baseName, existingNames);
            // Handle re-keying: if a device exists under old key matching ipfsClusterID, remove it
            if (device.txt.ipfsClusterID) {
              for (const [oldPeerId, oldBlox] of Object.entries(bloxs)) {
                if (
                  oldPeerId !== bloxPeerId &&
                  (oldBlox.clusterPeerId === device.txt.ipfsClusterID ||
                    oldPeerId === device.txt.ipfsClusterID)
                ) {
                  removeBlox(oldPeerId);
                  break;
                }
              }
            }
            addBlox({
              peerId: bloxPeerId,
              clusterPeerId: device.txt.ipfsClusterID || undefined,
              name: uniqueName,
            });
            if (firstBlox) {
              firstBlox = false;
              updateBloxStore({ currentBloxPeerId: bloxPeerId });
            }
          }
        });
        // "Add selected" is a deep-link consumption point (plan §WS4).
        void navigate(consumeDeepLinkStash() ?? paths.blox, { replace: true });
      } catch (error) {
        setAddingBloxs(false);
        console.log(error);
        logger.logError('ConnectToExistingBloxScreen:addBloxs', error);
      }
    }, 0);
  };

  const selectedIds = Object.keys(checkboxState);
  /** The normalised id, or null — doubles as the validity flag and as what gets sent on. */
  const manualPeerIdValid = normalizeBloxPeerId(manualPeerId);

  const renderItem = (item: DiscoveredBlox) => {
    const bloxPeerId = item.txt?.bloxPeerIdString;
    const authorizerValue = item.txt?.authorizer || '';
    const isUnpaired = !authorizerValue || authorizerValue === '';
    const authorized = !isUnpaired && authorizerValue === appPeerId;
    const alreadyExist = !!bloxs[bloxPeerId];
    const selectable = !isUnpaired && !(!authorized || !appPeerId || alreadyExist);
    const address = item.txt?.ipAddress || item.addresses[0];
    const addressLabel =
      address ??
      (item.source === 'ble' ? t('setup.connectToExistingBlox.viaBluetooth') : item.host);
    return (
      <FxCard
        key={item.txt?.hardwareID}
        disabled={!isUnpaired && !selectable}
        onPress={selectable ? () => handleOnItemPress(bloxPeerId) : undefined}
        accessibilityLabel={selectable ? addressLabel : undefined}
        testID={`blox-card-${item.txt?.hardwareID}`}
      >
        <FxCard.Row>
          <FxBox flexDirection="row" alignItems="center" gap="16">
            {!isUnpaired && (
              <FxRadioButton
                value={bloxPeerId}
                disabled={!selectable}
                aria-label={addressLabel}
                testID={`blox-select-${item.txt?.hardwareID}`}
              />
            )}
            <FxText variant="bodyMediumRegular">{addressLabel}</FxText>
          </FxBox>
        </FxCard.Row>
        <FxText variant="bodySmallLight">
          <FxText variant="bodySmallSemibold">{t('connectToExistingBlox.ip')}: </FxText>
          {address ?? '—'}
        </FxText>
        <PeerIdRow
          label={`${t('connectToExistingBlox.peerId')}:`}
          value={bloxPeerId}
          copiedMessage={t('connectToExistingBlox.peerIdCopied')}
          testID="blox-peer-id"
        />
        {item.txt?.ipfsClusterID && item.txt.ipfsClusterID !== bloxPeerId && (
          <PeerIdRow
            label={`${t('connectToExistingBlox.poolPeerId')}:`}
            value={item.txt.ipfsClusterID}
            copiedMessage={t('connectToExistingBlox.poolPeerIdCopied')}
            testID="blox-cluster-peer-id"
          />
        )}
        <FxText variant="bodySmallSemibold">{t('connectToExistingBlox.hardwareId')}:</FxText>
        <FxText variant="bodySmallLight" className="break-all">
          {item.txt?.hardwareID}
        </FxText>
        <FxBox flexDirection="row" alignItems="center" marginTop="8" gap="8">
          {!isUnpaired && bloxPeerId === item.txt?.authorizer && (
            <FxExclamationIcon color="warningBase" width={22} height={22} />
          )}
          <FxTag
            backgroundColor={
              isUnpaired
                ? 'backgroundSecondary'
                : appPeerId && authorized
                  ? 'successBase'
                  : appPeerId
                    ? 'errorBase'
                    : 'warningBase'
            }
          >
            {isUnpaired
              ? t('setup.connectToExistingBlox.newDevice')
              : appPeerId && authorized
                ? t('connectToExistingBlox.authorized')
                : appPeerId
                  ? t('connectToExistingBlox.notAuthorized')
                  : t('connectToExistingBlox.checking')}
          </FxTag>
          {alreadyExist && <FxTag>{t('connectToExistingBlox.alreadyExist')}</FxTag>}
        </FxBox>
        {isUnpaired && appPeerId && (
          <FxBox marginTop="8">
            <FxButton
              onPress={() =>
                void navigate(
                  paths.setup.setAuthorizer({
                    ip: address,
                    port: address ? item.port || DEFAULT_WAP_PORT : undefined,
                    peerId: bloxPeerId !== 'NA' ? bloxPeerId : undefined,
                  }),
                )
              }
              testID={`blox-setup-${item.txt?.hardwareID}`}
            >
              {t('setup.connectToExistingBlox.setup')}
            </FxButton>
          </FxBox>
        )}
        {appPeerId && !authorized && !isUnpaired && (
          <FxBox marginTop="8" gap="8">
            <FxBox flexDirection="row" alignItems="center" gap="8">
              <FxIconButton
                aria-label={t('connectToExistingBlox.peerIdMismatchTitle')}
                icon={<FxInfoIcon />}
                color="warningBase"
                onPress={() =>
                  void alert({
                    title: t('connectToExistingBlox.peerIdMismatchTitle'),
                    message: t('connectToExistingBlox.peerIdMismatchHelp'),
                  })
                }
              />
              <FxText variant="bodySmallLight" color="content2" flex={1}>
                {t('connectToExistingBlox.peerIdMismatchBrief')}
              </FxText>
            </FxBox>
            <FxButton variant="inverted" onPress={() => void navigate(paths.setup.bluetooth)}>
              {t('connectToExistingBlox.goToBluetoothCommands')}
            </FxButton>
          </FxBox>
        )}
      </FxCard>
    );
  };

  return (
    <SetupScreen
      id="connect-existing"
      title={t('connectToExistingBlox.title')}
      subtitle={t('connectToExistingBlox.selectBloxs')}
    >
      <FxBox gap="12">
        <FxBox flexDirection="row" gap="12">
          {/*
            The two scans are independent — one talks to the network, the other opens Chrome's device
            chooser — so neither blocks the other. They used to, which meant the Bluetooth button sat
            disabled for the ~15 s the network scan takes, on a screen whose network scan cannot find an
            already-owned Blox in the first place. The button the user needs was the one they had to wait for.
          */}
          {/* Bluetooth leads: it is the one route that actually reaches a Blox that already has an owner. */}
          <FxButton
            flex={1}
            loading={bleConnecting}
            onPress={() => void scanBle()}
            testID="scan-ble"
          >
            {t('setup.connectToExistingBlox.scanViaBluetooth')}
          </FxButton>
          <FxButton
            flex={1}
            variant="inverted"
            loading={scanning}
            onPress={() => void scanLan()}
            testID="scan-lan"
          >
            {t('setup.connectToExistingBlox.scan')}
          </FxButton>
        </FxBox>
        <FxText variant="bodyXSRegular" color="content3">
          {t('setup.connectToExistingBlox.webScanHint')}
        </FxText>
        {scanning && (
          <FxBox flexDirection="row" alignItems="center" gap="8" role="status">
            <FxSpinner label={null} />
            <FxText variant="bodySmallRegular" color="content2">
              {t('setup.connectToExistingBlox.scanning')}
            </FxText>
          </FxBox>
        )}
        {/*
          Bloxes found by name on the local network. Kept separate from the `/properties` list on purpose: all
          the LAN probe can learn is the peer id, so the Authorized / New tags and the multi-select those cards
          carry would be guesses. The peer id is the whole of what "add an existing Blox" needs, so these go
          straight down the same route the manual field uses.
        */}
        {lanFound.length > 0 && (
          <FxBox gap="8" testID="lan-found">
            <FxText variant="bodySmallSemibold" color="content1">
              {t('setup.connectToExistingBlox.foundOnNetwork')}
            </FxText>
            {lanFound.map((blox) => {
              const known = !!bloxs[blox.peerId];
              return (
                <FxCard key={blox.peerId} padding="12" gap="8" testID={`lan-found-${blox.peerId}`}>
                  <FxBox flexDirection="row" alignItems="center" justifyContent="space-between" gap="8">
                    <FxText variant="bodySmallRegular" color="content1">
                      {blox.host}
                    </FxText>
                    {known && (
                      <FxTag testID={`lan-found-known-${blox.peerId}`}>
                        {t('setup.connectToExistingBlox.alreadyAdded')}
                      </FxTag>
                    )}
                  </FxBox>
                  <PeerIdRow
                    label={t('setup.connectToExistingBlox.bloxPeerId')}
                    value={blox.peerId}
                    testID={`lan-found-peer-${blox.peerId}`}
                  />
                  {!known && (
                    <FxButton
                      disabled={!appPeerId}
                      onPress={() =>
                        void navigate(
                          paths.setup.setAuthorizer({ manual: true, peerId: blox.peerId }),
                        )
                      }
                      testID={`lan-found-add-${blox.peerId}`}
                    >
                      {t('setup.connectToExistingBlox.addThisBlox')}
                    </FxButton>
                  )}
                </FxCard>
              );
            })}
          </FxBox>
        )}
        {!scanning && hasScanned && data.length === 0 && lanFound.length === 0 && (
          <FxText variant="bodySmallRegular" color="content2" testID="no-devices">
            {t('setup.connectToExistingBlox.noDevices')}
          </FxText>
        )}

        <FxRadioButton.Group
          value={selectedIds}
          onValueChange={(vals: (string | number)[]) =>
            setCheckboxState(Object.fromEntries(vals.map((v) => [String(v), true])))
          }
          aria-label={t('connectToExistingBlox.selectBloxs')}
          className="gap-2"
          testID="blox-list"
        >
          {data.map(renderItem)}
        </FxRadioButton.Group>

        {!scanning && (
          <FxBox marginTop="8">
            {!showManualEntry ? (
              <FxButton
                variant="inverted"
                onPress={() => setShowManualEntry(true)}
                testID="add-manually"
              >
                {t('setup.connectToExistingBlox.addManually')}
              </FxButton>
            ) : (
              <FxCard>
                {/*
                  Peer id only. This screen adds a Blox you ALREADY own, and such a Blox stops serving the
                  setup API on the LAN the moment it has an owner — there is no address that reaches it, so
                  asking for one here could only ever fail. Claiming a not-yet-set-up Blox by address is a
                  different job and belongs to the LAN step in ConnectToBlox.
                */}
                <FxText variant="bodyMediumRegular" marginBottom="4">
                  {t('setup.connectToExistingBlox.enterPeerId')}
                </FxText>
                <FxText variant="bodyXSRegular" color="content3" marginBottom="8">
                  {t('setup.connectToExistingBlox.peerIdHint')}
                </FxText>
                <FxTextInput
                  placeholder="12D3KooW…"
                  value={manualPeerId}
                  onChangeText={setManualPeerId}
                  mono
                  autoFocus
                  errorMessage={
                    manualPeerId.trim() && !manualPeerIdValid
                      ? t('setup.connectToExistingBlox.invalidPeerId')
                      : undefined
                  }
                  testID="manual-peer-id"
                />
                <FxBox flexDirection="row" marginTop="12" gap="8">
                  <FxButton
                    flex={1}
                    variant="inverted"
                    onPress={() => {
                      setShowManualEntry(false);
                      setManualPeerId('');
                    }}
                  >
                    {t('setup.connectToExistingBlox.cancel')}
                  </FxButton>
                  <FxButton
                    flex={1}
                    disabled={!manualPeerIdValid || !appPeerId}
                    onPress={() =>
                      void navigate(
                        paths.setup.setAuthorizer({
                          manual: true,
                          peerId: manualPeerIdValid ?? undefined,
                        }),
                      )
                    }
                    testID="manual-peer-id-add"
                  >
                    {t('setup.connectToExistingBlox.addThisBlox')}
                  </FxButton>
                </FxBox>
              </FxCard>
            )}
          </FxBox>
        )}
      </FxBox>

      <SetupNav onBack={() => back(paths.setup.linkPassword)}>
        <FxButton
          size="large"
          flex={1}
          disabled={!appPeerId || selectedIds.length === 0}
          loading={addingBloxs}
          onPress={addBloxs}
          testID="add-selected"
        >
          {t('connectToExistingBlox.addSelectedBloxs')}
        </FxButton>
      </SetupNav>
    </SetupScreen>
  );
}

/**
 * Port of apps/box/src/screens/InitialSetup/ConnectToExistingBlox.screen.tsx ("Bloxs in your network").
 *
 * The browser has no mDNS, so "Scan" probes candidate addresses with `GET /properties` and maps the answers to
 * the mobile `MDNSBloxService` record shape (dedupe by hardwareID, feed `lanIpCache.noteRecord`): the FxBlox
 * hotspot host, every LAN-IP cache record, the manual IPs saved for known Bloxs, and the private `/ip4/` addrs
 * the discovery service (`findBox`) reports for known Bloxs. "Scan via Bluetooth" reads `properties` over a
 * BLE session picked from the click; the manual-IP card goes straight to SetBloxAuthorizer (LAN setup).
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
import { useBloxsStore } from '@/stores/useBloxsStore';
import { useUserProfileStore } from '@/stores/useUserProfileStore';
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
  const [addingBloxs, setAddingBloxs] = useState(false);
  const [checkboxState, setCheckboxState] = useState<Record<string, boolean>>({});
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualIp, setManualIp] = useState('');

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
    uniqueDevicesRef.current = new Map();
    try {
      const candidates = await collectScanCandidates(Object.keys(bloxs));
      await Promise.all(
        candidates.map(async ({ ip, port }) => {
          try {
            const res = await getBloxPropertiesAtIp(ip, port);
            if (scanGeneration.current !== generation) return;
            if (res?.data && typeof res.data === 'object')
              addDevice(deviceFromProperties(res.data, { ip, port, source: 'lan' }));
          } catch (error) {
            console.log(`[Scan] ${ip}:${port} did not answer`, error);
          }
        }),
      );
    } catch (error) {
      console.log('[Scan] Error scanning:', error);
      logger.logError('ConnectToExistingBloxScreen:scan', error);
    } finally {
      if (scanGeneration.current === generation) setScanning(false);
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
      const response = (await runBleCommand(
        'properties',
        session.id,
      )) as Partial<TBloxProperty> | null;
      if (response && typeof response === 'object') {
        addDevice(
          deviceFromProperties(response, { source: 'ble', host: session.name ?? 'bluetooth' }),
        );
      } else {
        throw new Error('empty properties response');
      }
    } catch (error) {
      logger.logError('ConnectToExistingBloxScreen:scanBle', error);
      queueToast({ type: 'error', message: t('setup.connectToExistingBlox.bleScanFailed') });
    }
  };

  const mountedScan = useRef(false);
  useEffect(() => {
    if (mountedScan.current) return;
    mountedScan.current = true;
    if (!appPeerId) void generateAppPeerId();
    void scanLan();
  }, [appPeerId, generateAppPeerId, scanLan]);

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
  const manualIpValid = ipIsPrivateLan(manualIp.trim());

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
          <FxButton
            flex={1}
            loading={scanning}
            disabled={bleConnecting}
            onPress={() => void scanLan()}
            testID="scan-lan"
          >
            {t('setup.connectToExistingBlox.scan')}
          </FxButton>
          <FxButton
            flex={1}
            variant="inverted"
            loading={bleConnecting}
            disabled={scanning}
            onPress={() => void scanBle()}
            testID="scan-ble"
          >
            {t('setup.connectToExistingBlox.scanViaBluetooth')}
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
        {!scanning && data.length === 0 && (
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
                <FxText variant="bodyMediumRegular" marginBottom="8">
                  {t('setup.connectToExistingBlox.enterIpAddress')}
                </FxText>
                <FxTextInput
                  placeholder="192.168.1.100"
                  value={manualIp}
                  onChangeText={setManualIp}
                  keyboardType="decimal-pad"
                  mono
                  autoFocus
                  errorMessage={
                    manualIp.trim() && !manualIpValid
                      ? t('setup.connectToExistingBlox.invalidIp')
                      : undefined
                  }
                  testID="manual-ip"
                />
                <FxBox flexDirection="row" marginTop="12" gap="8">
                  <FxButton
                    flex={1}
                    variant="inverted"
                    onPress={() => {
                      setShowManualEntry(false);
                      setManualIp('');
                    }}
                  >
                    {t('setup.connectToExistingBlox.cancel')}
                  </FxButton>
                  <FxButton
                    flex={1}
                    disabled={!manualIpValid || !appPeerId}
                    onPress={() =>
                      void navigate(
                        paths.setup.setAuthorizer({ ip: manualIp.trim(), port: DEFAULT_WAP_PORT }),
                      )
                    }
                    testID="manual-connect"
                  >
                    {t('setup.connectToExistingBlox.connect')}
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

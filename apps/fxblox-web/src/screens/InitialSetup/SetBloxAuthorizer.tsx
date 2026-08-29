/**
 * Port of apps/box/src/screens/InitialSetup/SetBloxAuthorizer.screen.tsx ("Set Blox Owner").
 *
 * Route params (`?manual&ip&port&peerId`): `manual=1` = the mobile `isManualSetup` (type the Blox peer id, no
 * exchange); `ip` (+ `port`) = the mobile `deviceIp`/`devicePort` LAN setup (exchange over HTTP at that address);
 * neither = the hotspot / BLE path. Everything else is the mobile logic: app peer id via `resolveAppPeerId`
 * (reuse the stored id, else `initFula`), `/properties` first, `peer/exchange` (HTTP, or BLE when a session
 * opened in this page exists — mobile tried BLE blindly, which surfaced a spurious "No BLE devices connected"
 * error + `delete-fula-config` on the hotspot path), the 52-char peer id check, Format Disk (`partition`),
 * the 10 s Skip / Format Disk timers, the support-code (1234) skip dialog, Blox naming, and `handleNext`
 * (setAppPeerId, addBlox, current blox, property/space info) → ConnectToWifi or SetupComplete.
 * Web additions on success: the LAN address feeds `lanIpCache` and a BLE session is bound to the Blox peer id.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxDialog,
  FxText,
  FxTextInput,
  FxWarning,
  useConfirm,
  useToast,
} from '@functionland/fx-ui';
import {
  bloxDeleteFulaConfig,
  bloxFormatDisk,
  exchangeConfig,
  exchangeConfigAtIp,
  getBloxProperties,
  getBloxPropertiesAtIp,
  type ExchangeResponse,
  type GeneralResponse,
} from '@/api/bloxHardware';
import { API_URL, apiUrlFor } from '@/api';
import { paths } from '@/app/paths';
import { runBleCommand } from '@/components/setup/ble';
import { DiskCard } from '@/components/setup/DiskCard';
import { PeerIdRow } from '@/components/setup/PeerIdRow';
import { SetupNav } from '@/components/setup/SetupNav';
import { SetupScreen } from '@/components/setup/SetupScreen';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useFetch, useFetchWithBLE } from '@/hooks/useFetch';
import { useLogger } from '@/hooks/useLogger';
import type { TBloxProperty } from '@/models';
import { BleRegistry } from '@/platform/bluetooth';
import { isLanHttpError } from '@/platform/lanHttp';
import { useBloxsStore } from '@/stores/useBloxsStore';
import { useUserProfileStore } from '@/stores/useUserProfileStore';
import { resolveAppPeerId } from '@/utils/appPeerId';
import { normalizeBloxPeerId } from '@/utils/bloxPeerId';
import { safeGetConnectedPeripherals } from '@/utils/ble';
import { generateUniqueBloxName } from '@/utils/bloxName';
import * as Helper from '@/utils/helper';
import { noteLanIp } from '@/utils/lanIpCache';

export const SKIP_CODE = '1234';
export const DEFAULT_WAP_PORT = 3500;

/** Mobile timers (ms). Overridable in tests through `_setTimingsForTests`. */
export const TIMINGS = { skipButtonMs: 10_000, formatDiskButtonMs: 10_000 };
export function _setTimingsForTests(next: Partial<typeof TIMINGS>): () => void {
  const prev = { ...TIMINGS };
  Object.assign(TIMINGS, next);
  return () => Object.assign(TIMINGS, prev);
}

/** Mobile compared `error.message === 'Network Error'` (axios); on web every non-HTTP LAN failure counts. */
export function isNetworkError(error: Error | null | undefined): boolean {
  if (!error) return false;
  if (isLanHttpError(error)) return error.kind !== 'http';
  return /network/i.test(error.message);
}

type ExchangeParams = { peer_id?: string; seed?: string };
type ExchangeData = { data: ExchangeResponse };

export default function SetBloxAuthorizer() {
  const { t } = useTranslation();
  const { navigate, back } = useAppNavigate();
  const { queueToast } = useToast();
  const { alert } = useConfirm();
  const logger = useLogger();
  const [search] = useSearchParams();

  const manualParam = search.get('manual');
  const isManualSetup = manualParam === '1' || manualParam === 'true';
  const deviceIp = search.get('ip') || undefined;
  const devicePort = Number(search.get('port')) || DEFAULT_WAP_PORT;
  const isLanSetup = !!deviceIp;
  // Where this screen's plain HTTP calls go. The exchange and properties calls pick their own ip-scoped
  // variant; these are the ones that would otherwise always talk to the hotspot.
  const setupBaseUrl = deviceIp ? apiUrlFor(deviceIp, devicePort) : API_URL;

  const [newPeerId, setNewPeerId] = useState<string | undefined>(undefined);
  /**
   * Seeded from `?peerId` in the initialiser, not an effect: the field is this state, so an effect that
   * wrote to it would fight the user the moment they corrected a bad paste.
   */
  const [newBloxPeerId, setNewBloxPeerId] = useState<string | undefined>(() => {
    const fromRoute = search.get('peerId');
    return fromRoute ? (normalizeBloxPeerId(fromRoute) ?? undefined) : undefined;
  });
  const [showSkipButton, setShowSkipButton] = useState(false);
  const [showFormatDiskButton, setShowFormatDiskButton] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [skipCode, setSkipCode] = useState('');
  const [newClusterPeerId, setNewClusterPeerId] = useState<string | undefined>(undefined);

  const setAppPeerId = useUserProfileStore((state) => state.setAppPeerId);
  const appPeerId = useUserProfileStore((state) => state.appPeerId);
  const signiture = useUserProfileStore((state) => state.signiture);
  const password = useUserProfileStore((state) => state.password);

  const bloxs = useBloxsStore((state) => state.bloxs) ?? {};
  const currentBloxPeerId = useBloxsStore((state) => state.currentBloxPeerId);
  const updateBloxsStore = useBloxsStore((state) => state.update);
  const addBlox = useBloxsStore((state) => state.addBlox);
  const removeBlox = useBloxsStore((state) => state.removeBlox);
  const updateBloxPropertyInfo = useBloxsStore((state) => state.updateBloxPropertyInfo);
  const updateBloxSpaceInfo = useBloxsStore((state) => state.updateBloxSpaceInfo);

  const bloxsArray = Object.values(bloxs);
  const [newBloxName, setNewBloxName] = useState<string>(() =>
    generateUniqueBloxName(
      `${t('setBloxAuthorizer.bloxUnitPrefix')} #${bloxsArray.length + 1}`,
      bloxsArray.map((b) => b.name),
    ),
  );

  const blePeerExchange = async (params: ExchangeParams): Promise<ExchangeData | null> => {
    const connectedPeripherals = await safeGetConnectedPeripherals([]);
    const first = connectedPeripherals[0];
    if (!first) {
      throw new Error(t('setBloxAuthorizer.noBleDevicesConnected'));
    }
    const command = `peer/exchange ${params.peer_id} ${params.seed}`;
    // useFetchWithBLE wraps the raw BLE reply as `{ data }` itself.
    return (await runBleCommand(command, first.id)) as ExchangeData | null;
  };

  const {
    loading: loading_exchange,
    data: data_exchange,
    error: error_exchange,
    refetch: refetch_exchangeConfig,
  } = useFetchWithBLE<ExchangeData, ExchangeParams>({
    initialLoading: false,
    apiMethod: (params) =>
      isLanSetup && deviceIp
        ? exchangeConfigAtIp(deviceIp, devicePort, params ?? {})
        : exchangeConfig(params ?? {}),
    bleMethod: blePeerExchange,
  });

  const {
    loading: loading_bloxFormatDisk,
    data: data_bloxFormatDisk,
    error: error_bloxFormatDisk,
    refetch: refetch_bloxFormatDisk,
  } = useFetch<{ data: GeneralResponse }, undefined>({
    initialLoading: false,
    apiMethod: () => bloxFormatDisk(setupBaseUrl),
  });
  const { refetch: refetch_bloxDeleteFulaConfig } = useFetch<{ data: GeneralResponse }, undefined>({
    initialLoading: false,
    apiMethod: () => bloxDeleteFulaConfig(setupBaseUrl),
  });
  const {
    loading: loading_bloxProperties,
    data: data_bloxProperties,
    error: error_bloxProperties,
    refetch: refetch_bloxProperties,
  } = useFetch<{ data: TBloxProperty }, undefined>({
    initialLoading: false,
    apiMethod: () =>
      isLanSetup && deviceIp ? getBloxPropertiesAtIp(deviceIp, devicePort) : getBloxProperties(),
  });

  const properties = data_bloxProperties?.data;

  const generateAppPeerId = useCallback(async () => {
    try {
      // Reuse the stored (deterministic) app peerId instead of re-initing fula (mobile: avoids tearing down the
      // shared client mid-flight when re-setting-up the current blox).
      const peerId = await resolveAppPeerId(appPeerId, async () => {
        const id = await Helper.initFula({ password: password ?? '', signiture: signiture ?? '' });
        if (!id) throw new Error('initFula returned no peer id');
        return id;
      });
      setNewPeerId(peerId);
      logger.log('generateAppPeerId:Result', { peerId });
    } catch (error) {
      logger.logError('generateAppPeerId', error);
    }
  }, [appPeerId, password, signiture, logger]);

  const handleExchangeConfig = useCallback(async () => {
    try {
      if (!password || !signiture) throw new Error('Missing identity');
      const { secretKey } = Helper.getMyDIDKeyPair(password, signiture);
      const peer_id = newPeerId;
      const seed = Helper.identityStringFromSecretKey(secretKey);
      // Only try BLE when this page actually holds a session (see the file header).
      const peripherals = await safeGetConnectedPeripherals([]);
      await refetch_exchangeConfig({
        params: { peer_id, seed },
        withLoading: true,
        tryBLE: !isLanSetup && peripherals.length > 0, // LAN setup: skip BLE, use HTTP directly
      });
    } catch (error) {
      logger.logError('exchangeConfig', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch is a stable hook function
  }, [password, signiture, newPeerId, isLanSetup, logger]);

  const latest = useRef({
    handleExchangeConfig,
    refetch_bloxProperties,
    refetch_bloxDeleteFulaConfig,
  });
  latest.current = { handleExchangeConfig, refetch_bloxProperties, refetch_bloxDeleteFulaConfig };

  useEffect(() => {
    if (password && signiture) void generateAppPeerId();
  }, [password, signiture, generateAppPeerId]);

  useEffect(() => {
    if (!isManualSetup) {
      void latest.current.refetch_bloxProperties({ withLoading: true });
    }
    const timer = setTimeout(() => setShowSkipButton(true), TIMINGS.skipButtonMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only (mobile)
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setShowFormatDiskButton(true), TIMINGS.formatDiskButtonMs);
    return () => clearTimeout(timer);
  }, []);

  // Exchange config with the blox when the app peerId is ready (and the properties look sane on the hotspot)
  useEffect(() => {
    if (newPeerId && !isManualSetup) {
      // LAN/PC setup: skip restartNeeded and storage checks (not applicable to PC nodes)
      if (isLanSetup && properties) {
        void latest.current.handleExchangeConfig();
      } else if (
        properties?.restartNeeded === 'false' &&
        (properties?.bloxFreeSpace?.size || 0) > 0
      ) {
        void latest.current.handleExchangeConfig();
      }
    }
  }, [newPeerId, isManualSetup, isLanSetup, properties, error_bloxProperties]);

  useEffect(() => {
    if (!properties?.bloxFreeSpace && error_bloxProperties) {
      console.log({ error_bloxProperties });
      queueToast({
        type: 'warning',
        title: t('setBloxAuthorizer.unableToGetProperties'),
        message: error_bloxProperties?.message,
      });
    }
    // Extract ipfs-cluster peerID from /properties response
    if (properties?.ipfs_cluster_peer_id) {
      setNewClusterPeerId(properties.ipfs_cluster_peer_id);
    }
    logger.log('refetch_bloxProperties:result', { data_bloxProperties, error_bloxProperties });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mobile deps
  }, [data_bloxProperties, error_bloxProperties]);

  useEffect(() => {
    if (data_exchange?.data?.peer_id) {
      const peer_id = String(data_exchange.data.peer_id).trim().split(/\r?\n/)[0];
      if (!peer_id || peer_id.length !== 52) {
        queueToast({
          type: 'error',
          title: t('setBloxAuthorizer.setAuthorizer'),
          message: t('setBloxAuthorizer.bloxPeerIdInvalid'),
        });
        void latest.current.refetch_bloxDeleteFulaConfig();
      } else {
        setNewBloxPeerId(peer_id);
      }
    } else if (error_exchange) {
      console.log('data exchange error', { data_exchange, error_exchange });
      queueToast({
        type: 'error',
        title: t('setBloxAuthorizer.setAuthorizer'),
        message: error_exchange?.message,
      });
      void latest.current.refetch_bloxDeleteFulaConfig();
    }
    logger.log('handleExchangeConfig:result', { data_exchange, error_exchange });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mobile deps
  }, [data_exchange, error_exchange]);

  // Handle format disk API response
  useEffect(() => {
    if (data_bloxFormatDisk?.data && !data_bloxFormatDisk.data.status) {
      queueToast({
        type: 'error',
        title: t('setBloxAuthorizer.formatDisk'),
        message: data_bloxFormatDisk.data.msg,
      });
    } else if (error_bloxFormatDisk?.message) {
      queueToast({
        type: 'error',
        title: t('setBloxAuthorizer.formatDisk'),
        message: error_bloxFormatDisk.message,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mobile deps
  }, [data_bloxFormatDisk, error_bloxFormatDisk]);

  const goBack = () => back(isLanSetup ? paths.setup.connectExisting : paths.setup.connectBlox);
  const skipConnectToInternet = () => void navigate(paths.setup.connectWifi);

  const handleNext = () => {
    if (!loading_exchange && newBloxName && newBloxPeerId && newPeerId) {
      setAppPeerId(newPeerId);
      if (currentBloxPeerId === newBloxPeerId) {
        removeBlox(currentBloxPeerId);
      }
      // Ensure unique name before adding
      const finalName = generateUniqueBloxName(
        newBloxName,
        Object.values(bloxs).map((b) => b.name),
      );
      addBlox({ peerId: newBloxPeerId, clusterPeerId: newClusterPeerId, name: finalName });
      updateBloxsStore({ currentBloxPeerId: newBloxPeerId });
      if (!isManualSetup && properties) {
        updateBloxPropertyInfo(newBloxPeerId, properties);
        updateBloxSpaceInfo(newBloxPeerId, properties.bloxFreeSpace);
      }
      // Web: remember where this Blox answers on the LAN, and which BLE device it is.
      if (isLanSetup && deviceIp) {
        try {
          noteLanIp({
            ip: deviceIp,
            port: devicePort,
            bloxPeerId: newBloxPeerId,
            authorizer: newPeerId,
            hardwareID: properties?.hardwareID,
            clusterPeerId: newClusterPeerId,
          });
        } catch {
          /* cache is best effort */
        }
      }
      const ble = BleRegistry.current();
      if (ble?.isConnected()) void BleRegistry.bind(newBloxPeerId, ble.id).catch(() => undefined);
      logger.log('SetBloxAuthorizer.Screen:handleNext', {
        peerId: newBloxPeerId,
        name: newBloxName,
        freeSpace: properties?.bloxFreeSpace,
        propertyInfo: properties,
      });
      if (isManualSetup || isLanSetup) {
        void navigate(paths.setup.complete({ manual: isManualSetup }));
      } else {
        void navigate(paths.setup.connectWifi);
      }
    } else {
      logger.logError('SetBloxAuthorizer.Screen:handleNext', {
        loading_exchange,
        newBloxName,
        newBloxPeerId,
        newPeerId,
      });
    }
  };

  const handleSetOwnerPeerId = () => {
    if (newPeerId) void handleExchangeConfig();
  };

  const handleFormatDisk = async () => {
    try {
      // Check for a BLE session first
      const connectedPeripherals = await safeGetConnectedPeripherals([]);
      const first = connectedPeripherals[0];
      if (first) {
        try {
          const response = await runBleCommand('partition', first.id);
          if (response) {
            console.log('partition response received', { response });
            queueToast({ type: 'success', message: t('setup.setBloxAuthorizer.formatDiskSent') });
            goBack();
            return;
          }
        } catch (bleError) {
          console.log('BLE format disk failed:', bleError);
          // Continue to the HTTP fallback
        }
      }
      // Fallback to useFetch if BLE failed or not connected
      void refetch_bloxFormatDisk({ withLoading: true });
      goBack();
    } catch (error) {
      console.error('Format disk failed:', error);
    }
  };

  const confirmSkip = () => {
    if (skipCode === SKIP_CODE) {
      setShowSkipModal(false);
      setSkipCode('');
      skipConnectToInternet();
    } else {
      void alert({
        title: t('setBloxAuthorizer.invalidCode'),
        message: t('setBloxAuthorizer.invalidCodeMessage'),
      });
    }
  };

  const freeSize = properties?.bloxFreeSpace?.size;
  const storageMissing = !freeSize || freeSize === 0 || Number.isNaN(freeSize);
  const showSetAuthorizer = !newBloxPeerId && !isManualSetup;
  const setAuthorizerDisabled =
    !newPeerId ||
    loading_exchange ||
    loading_bloxProperties ||
    (!isLanSetup &&
      (!properties?.restartNeeded ||
        properties.restartNeeded === 'true' ||
        (properties.bloxFreeSpace?.size || 0) === 0));
  const nextDisabled =
    loading_exchange || !newBloxName || !newBloxPeerId || !newPeerId || loading_bloxProperties;

  return (
    <SetupScreen
      id="set-authorizer"
      title={t('setBloxAuthorizer.title')}
      subtitle={t('setBloxAuthorizer.description')}
    >
      <FxBox gap="16">
        {isLanSetup && (
          <FxText variant="bodyXSRegular" color="content3" textAlign="center">
            {t('setup.setBloxAuthorizer.lanTarget', { ip: deviceIp, port: devicePort })}
          </FxText>
        )}
        {(isNetworkError(error_exchange) || isNetworkError(error_bloxProperties)) && (
          <FxWarning padding="16" error={t('setBloxAuthorizer.networkError')} />
        )}
        {!isLanSetup &&
          properties &&
          (!properties.restartNeeded || properties.restartNeeded === 'true') && (
            <FxWarning
              padding="16"
              error={
                properties.restartNeeded // backend zero → the update needs a manual restart
                  ? t('setBloxAuthorizer.updateNeeded')
                  : t('setBloxAuthorizer.backendUpdate')
              }
            />
          )}
        {!isManualSetup && !isLanSetup && storageMissing && !loading_bloxProperties && (
          <FxWarning padding="16" error={t('setBloxAuthorizer.storageNeeded')} />
        )}

        {password && signiture ? (
          newPeerId ? (
            <PeerIdRow
              centered
              label={t('setBloxAuthorizer.appPeerId')}
              value={newPeerId}
              copiedMessage={t('setup.setBloxAuthorizer.copied')}
              shareTitle={t('setBloxAuthorizer.appPeerId')}
              testID="app-peer-id"
            />
          ) : (
            <FxBox>
              <FxText variant="h200" textAlign="center" marginBottom="8">
                {t('setBloxAuthorizer.appPeerId')}
              </FxText>
              <FxText color="content3" textAlign="center" role="status">
                {t('setBloxAuthorizer.generating')}
              </FxText>
            </FxBox>
          )
        ) : null}

        {newBloxPeerId && !isManualSetup && (
          <PeerIdRow
            centered
            label={t('setBloxAuthorizer.bloxPeerId')}
            value={newBloxPeerId}
            copiedMessage={t('setup.setBloxAuthorizer.copied')}
            shareTitle={t('setBloxAuthorizer.bloxPeerId')}
            testID="blox-peer-id"
          />
        )}
        {isManualSetup && (
          <FxBox gap="8">
            <FxText variant="h200" textAlign="center">
              {t('setBloxAuthorizer.enterBloxPeerId')}
            </FxText>
            <FxText variant="bodyXSRegular" color="content3" textAlign="center">
              {t('setup.setBloxAuthorizer.manualHint')}
            </FxText>
            <FxTextInput
              mono
              value={newBloxPeerId ?? ''}
              onChangeText={(v) => setNewBloxPeerId(v.trim() || undefined)}
              testID="manual-blox-peer-id"
            />
          </FxBox>
        )}
        {(newBloxPeerId || isManualSetup) && (
          <FxTextInput
            caption={t('setBloxAuthorizer.setBloxName')}
            value={newBloxName}
            onChangeText={setNewBloxName}
            testID="blox-name"
          />
        )}

        {properties?.bloxFreeSpace && (
          <DiskCard
            name={t('setBloxAuthorizer.hardDisk')}
            tag={t('setBloxAuthorizer.bloxSetUp')}
            capacity={properties.bloxFreeSpace.size || 0}
            used={properties.bloxFreeSpace.used}
            free={properties.bloxFreeSpace.avail}
            available={!!properties.bloxFreeSpace}
            loading={loading_bloxProperties}
            onRefresh={() => void refetch_bloxProperties({ withLoading: true })}
          >
            {/* Only show Format Disk when the storage size is invalid (0, NaN, undefined) */}
            {showFormatDiskButton && storageMissing && (
              <FxButton
                marginTop="12"
                loading={loading_bloxFormatDisk}
                onPress={() => void handleFormatDisk()}
                testID="format-disk"
              >
                {t('setBloxAuthorizer.formatDisk')}
              </FxButton>
            )}
          </DiskCard>
        )}
      </FxBox>

      <FxDialog
        open={showSkipModal}
        onOpenChange={(open) => {
          setShowSkipModal(open);
          if (!open) setSkipCode('');
        }}
        title={t('setBloxAuthorizer.skipAuthorization')}
        description={t('setBloxAuthorizer.skipDescription')}
        size="sm"
        testID="skip-dialog"
        footer={
          <>
            <FxButton
              variant="inverted"
              onPress={() => {
                setShowSkipModal(false);
                setSkipCode('');
              }}
            >
              {t('setBloxAuthorizer.cancel')}
            </FxButton>
            <FxButton onPress={confirmSkip} testID="skip-confirm">
              {t('setBloxAuthorizer.confirm')}
            </FxButton>
          </>
        }
      >
        <FxTextInput
          caption={t('setup.setBloxAuthorizer.enterCode')}
          value={skipCode}
          onChangeText={setSkipCode}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={4}
          autoFocus
          onSubmitEditing={confirmSkip}
          testID="skip-code"
        />
      </FxDialog>

      <SetupNav
        onBack={goBack}
        above={
          showSkipButton ? (
            <FxButton variant="inverted" onPress={() => setShowSkipModal(true)} testID="skip">
              {t('setBloxAuthorizer.skip')}
            </FxButton>
          ) : undefined
        }
      >
        {showSetAuthorizer ? (
          <FxButton
            flex={1}
            disabled={setAuthorizerDisabled}
            loading={loading_exchange || loading_bloxProperties}
            onPress={handleSetOwnerPeerId}
            testID="set-authorizer"
          >
            {t('setBloxAuthorizer.setAuthorizer')}
          </FxButton>
        ) : (
          <FxButton
            flex={1}
            disabled={nextDisabled}
            loading={loading_exchange}
            onPress={handleNext}
            testID="setup-continue"
          >
            {t('setBloxAuthorizer.next')}
          </FxButton>
        )}
      </SetupNav>
    </SetupScreen>
  );
}

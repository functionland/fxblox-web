/**
 * Port of apps/box/src/screens/InitialSetup/ConnectToWifi/ConnectToWifi.screen.tsx.
 *
 * Documented difference (plan §WS3): the phone Wi-Fi scan is replaced by the BLOX-side list (`GET wifi/list`
 * over HTTP, or BLE when a session exists) — it shows the networks the Blox can see, which is what matters for it
 * to connect. Hidden-SSID manual entry, the password sheet (editable country code), "Use Wired LAN" (confirm)
 * and Back/Next are as on mobile. After `wifi/connect` (success, or the hotspot dropping) the flow goes to
 * CheckConnection (`?ssid=`); the LAN path goes straight to SetupComplete.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxIconButton,
  FxRefreshIcon,
  FxSpinner,
  FxText,
  FxTextInput,
  useConfirm,
  type FxSheetMethods,
} from '@functionland/fx-ui';
import { getWifiList, type WifiNetwork } from '@/api/wifi';
import { paths } from '@/app/paths';
import { SetupNav } from '@/components/setup/SetupNav';
import { SetupScreen } from '@/components/setup/SetupScreen';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useLogger } from '@/hooks/useLogger';
import bloxWifiDevice from '@/assets/images/blox-wifi-device.svg';
import { InputWifiPasswordSheet } from './InputWifiPasswordSheet';
import { WifiNetworkItem } from './WifiNetworkItem';

export const LAN_SSID = 'LAN';

/** Mobile: strip quotes, drop empties, sort, unique. */
export function ssidsFromWifiList(list: unknown): string[] {
  const items: WifiNetwork[] = Array.isArray(list) ? (list as WifiNetwork[]) : [];
  const ssids = items
    .map((network) => String(network?.ssid ?? network?.essid ?? '').replaceAll('"', ''))
    .filter((ssid) => ssid)
    .sort();
  return [...new Set(ssids)];
}

export default function ConnectToWifi() {
  const { t } = useTranslation();
  const { navigate, back } = useAppNavigate();
  const { confirm } = useConfirm();
  const logger = useLogger();
  const sheetRef = useRef<FxSheetMethods>(null);

  const [selectedSsid, setSelectedSsid] = useState<string>('');
  const [connectedSsid, setConnectedSsid] = useState<string | null>(null);
  const [enabledHiddenNetwork, setEnableHiddenNetwork] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [networks, setNetworks] = useState<string[]>([]);

  const scanWifiNetworks = useCallback(async () => {
    try {
      console.log('scan wifi called');
      setLoading(true);
      setError(null);
      const { data } = await getWifiList();
      const uniqueSsids = ssidsFromWifiList(data);
      console.log({ uniqueSsids });
      setNetworks(uniqueSsids);
    } catch (err) {
      logger.logError('scanWifiNetworks', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [logger]);

  const scannedOnMount = useRef(false);
  useEffect(() => {
    if (scannedOnMount.current) return;
    scannedOnMount.current = true;
    void scanWifiNetworks();
  }, [scanWifiNetworks]);

  const handleBack = () => back(paths.setup.setAuthorizer());

  const handleNext = (ssid: string | null = connectedSsid) => {
    if (!ssid) return;
    if (ssid === LAN_SSID) void navigate(paths.setup.complete());
    else void navigate(paths.setup.checkConnection({ ssid }));
  };

  const handleSelectedWifiDevice = (ssid: string) => {
    const clean = ssid.trim();
    if (!clean) return;
    setSelectedSsid(clean);
    sheetRef.current?.present();
  };

  const handleOnConnectWifi = (ssid: string) => {
    sheetRef.current?.close();
    setConnectedSsid(ssid);
    handleNext(ssid);
  };

  const handleUseLAN = async () => {
    const ok = await confirm({
      title: t('connectToWifi.lanTitle'),
      message: t('connectToWifi.lanInstructions'),
      confirmText: t('connectToWifi.continue'),
      cancelText: t('connectToWifi.cancel'),
    });
    if (!ok) return;
    setConnectedSsid(LAN_SSID);
    handleNext(LAN_SSID);
  };

  return (
    <SetupScreen id="connect-wifi">
      <FxBox alignItems="center" marginBottom="16">
        <img
          src={bloxWifiDevice}
          alt={t('setup.connectToWifi.imageAlt')}
          className="h-40 w-auto max-w-full"
          draggable={false}
        />
      </FxBox>
      <FxBox gap="12">
        <FxText as="h1" variant="h300">
          {t('connectToWifi.title')}
        </FxText>
        <FxButton
          variant={enabledHiddenNetwork ? 'inverted' : 'defaults'}
          onPress={() => setEnableHiddenNetwork(!enabledHiddenNetwork)}
          testID="toggle-hidden-network"
        >
          {enabledHiddenNetwork ? t('connectToWifi.showNetworks') : t('connectToWifi.manualEntry')}
        </FxButton>

        {enabledHiddenNetwork && (
          <FxBox gap="8">
            <FxTextInput
              value={selectedSsid}
              onChangeText={setSelectedSsid}
              onSubmitEditing={() => handleSelectedWifiDevice(selectedSsid)}
              placeholder={t('connectToWifi.enterWifiName')}
              aria-label={t('connectToWifi.enterWifiName')}
              testID="hidden-ssid"
            />
            <FxText variant="bodySmallRegular" color="content2">
              {t('connectToWifi.caseSensitiveWarning')}
            </FxText>
            <FxButton
              disabled={!selectedSsid.trim()}
              onPress={() => handleSelectedWifiDevice(selectedSsid)}
              testID="enter-password-for"
            >
              {t('connectToWifi.enterPasswordFor')} {selectedSsid}
            </FxButton>
          </FxBox>
        )}

        {!enabledHiddenNetwork && (
          <>
            <FxBox flexDirection="row" alignItems="center" gap="8">
              {loading ? (
                <>
                  <FxSpinner label={null} />
                  <FxText variant="bodySmallRegular" role="status">
                    {t('connectToWifi.searching')}
                  </FxText>
                </>
              ) : (
                <>
                  <FxText variant="bodySmallRegular">{t('connectToWifi.selectNetwork')}</FxText>
                  <FxIconButton
                    aria-label={t('setup.connectToWifi.refresh')}
                    icon={<FxRefreshIcon />}
                    onPress={() => void scanWifiNetworks()}
                    testID="refresh-wifi"
                  />
                </>
              )}
            </FxBox>
            <FxText variant="bodyXSRegular" color="content3">
              {t('setup.connectToWifi.bloxSideHint')}
            </FxText>
            <FxBox
              borderColor="border"
              borderWidth={1}
              borderRadius="s"
              paddingHorizontal="8"
              className="max-h-[240px] min-h-[120px] overflow-y-auto"
              testID="wifi-list"
            >
              {networks.length === 0 && !loading ? (
                <FxBox flex={1} justifyContent="center" alignItems="center" padding="16" gap="8">
                  <FxText variant="bodySmallRegular" textAlign="center" color="content2">
                    {error
                      ? t('setup.connectToWifi.listError')
                      : t('connectToWifi.noNetworksFound')}
                  </FxText>
                  {error && (
                    <FxText variant="bodyXSRegular" textAlign="center" color="errorBase">
                      {error.message}
                    </FxText>
                  )}
                </FxBox>
              ) : (
                <ul className="m-0 flex list-none flex-col divide-y divide-background-secondary p-0">
                  {networks.map((item) => (
                    <WifiNetworkItem
                      key={item}
                      ssid={item}
                      connected={item === connectedSsid}
                      onSelect={handleSelectedWifiDevice}
                    />
                  ))}
                </ul>
              )}
            </FxBox>
          </>
        )}

        <FxButton variant="inverted" onPress={() => void handleUseLAN()} testID="use-lan">
          {t('connectToWifi.useLAN')}
        </FxButton>
      </FxBox>

      <InputWifiPasswordSheet
        ssid={selectedSsid || null}
        ref={sheetRef}
        onConnect={handleOnConnectWifi}
      />

      <SetupNav onBack={handleBack} backLabel={t('connectToWifi.back')}>
        <FxButton
          flex={1}
          onPress={() => handleNext()}
          disabled={!connectedSsid}
          testID="setup-continue"
        >
          {t('connectToWifi.next')}
        </FxButton>
      </SetupNav>
    </SetupScreen>
  );
}

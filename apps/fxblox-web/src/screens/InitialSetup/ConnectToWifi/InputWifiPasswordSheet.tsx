/**
 * Port of apps/box/src/screens/InitialSetup/ConnectToWifi/modals/InputWifiPasswordModal.tsx on `FxSheet`.
 * The country code is editable (default `locale.country()` → navigator region → 'CA') and remembered.
 * `postWifiConnect` result: "Wifi connected!" → `onConnect(ssid)`; a hotspot drop (the Blox joined the network)
 * surfaces as a LAN network failure and is treated as success, as on mobile; a definite failure (HTTP error,
 * CORS, LNA denied) is shown as a toast instead of proceeding.
 */
import { useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxSheet,
  FxText,
  FxTextInput,
  useToast,
  type FxSheetMethods,
} from '@functionland/fx-ui';
import { postWifiConnect } from '@/api/wifi';
import { useLogger } from '@/hooks/useLogger';
import { EConnectionStatus } from '@/models';
import { isLanHttpError } from '@/platform/lanHttp';
import { country as defaultCountry, setCountry } from '@/platform/locale';

export interface InputWifiPasswordSheetProps {
  ssid: string | null;
  onConnect: (ssid: string) => void;
  ref?: Ref<FxSheetMethods>;
}

/** A failure that means the request could not even reach the Blox → the AP dropped because it joined Wi-Fi. */
export function isApDropFailure(error: unknown): boolean {
  if (!isLanHttpError(error)) return true; // plain TypeError / unknown → assume the hotspot went away
  return error.kind === 'timeout' || error.kind === 'unreachable' || error.kind === 'aborted';
}

export function InputWifiPasswordSheet({ ssid, onConnect, ref }: InputWifiPasswordSheetProps) {
  const { t } = useTranslation();
  const { queueToast } = useToast();
  const logger = useLogger();
  const [connectionStatus, setConnectionStatus] = useState<EConnectionStatus | null>(null);
  const [password, setPassword] = useState('');
  const [countryCode, setCountryCode] = useState(() => defaultCountry());
  const countryValid = /^[A-Za-z]{2}$/.test(countryCode.trim());

  const connectWifi = async () => {
    if (!ssid) return;
    const code = countryCode.trim().toUpperCase();
    setCountry(code);
    logger.log('connectWifi:FormData', { ssid, password: '***', countryCode: code });
    setConnectionStatus(EConnectionStatus.connecting);
    try {
      const result = await postWifiConnect({ ssid, password, countryCode: code });
      logger.log('connectWifi', result);
      const body =
        typeof result.data === 'string' ? result.data : JSON.stringify(result.data ?? '');
      if (body.includes('Wifi connected!')) {
        setConnectionStatus(EConnectionStatus.connected);
        onConnect(ssid);
      } else {
        setConnectionStatus(EConnectionStatus.failed);
        queueToast({
          title: t('setup.connectToWifi.password.unableToConnect'),
          message: body,
          type: 'error',
          autoHideDuration: 5000,
        });
      }
    } catch (err) {
      console.log('connectWifi', err);
      logger.logError('connectWifi', err);
      if (isApDropFailure(err)) {
        // The hotspot dropped as the Blox joined the network — proceed, as mobile does.
        setConnectionStatus(EConnectionStatus.connected);
        onConnect(ssid);
      } else {
        setConnectionStatus(EConnectionStatus.failed);
        queueToast({
          title: t('setup.connectToWifi.password.unableToConnect'),
          message: err instanceof Error ? err.message : String(err),
          type: 'error',
          autoHideDuration: 5000,
        });
      }
    }
  };

  const connecting = connectionStatus === EConnectionStatus.connecting;

  return (
    <FxSheet
      ref={ref}
      title={t('setup.connectToWifi.password.title', { ssid: ssid ?? '' })}
      closeLabel={t('setup.common.close')}
      testID="wifi-password-sheet"
    >
      <FxBox gap="16" paddingTop="8">
        <FxTextInput
          caption={t('setup.connectToWifi.password.countryCode')}
          value={countryCode}
          onChangeText={(v) => setCountryCode(v.toUpperCase())}
          maxLength={2}
          autoCapitalize="characters"
          errorMessage={
            countryValid ? undefined : t('setup.connectToWifi.password.countryCodeHint')
          }
          testID="wifi-country"
        />
        <FxText variant="bodyXSRegular" color="content3">
          {t('setup.connectToWifi.password.countryCodeHint')}
        </FxText>
        <FxTextInput
          caption={t('setup.connectToWifi.password.password')}
          secureTextEntry
          autoComplete="off"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={() => {
            if (password.length && countryValid && !connecting) void connectWifi();
          }}
          testID="wifi-password"
        />
        <FxButton
          size="large"
          disabled={connecting || !password.length || !countryValid}
          loading={connecting}
          onPress={() => void connectWifi()}
          testID="wifi-connect"
        >
          {connecting
            ? t('setup.connectToWifi.password.connecting')
            : t('setup.connectToWifi.password.connect')}
        </FxButton>
      </FxBox>
    </FxSheet>
  );
}

export default InputWifiPasswordSheet;

/**
 * Port of apps/box/src/screens/Settings/BloxLogs.screen.tsx (behind `VITE_ENABLE_BLOX_LOGS` — the menu
 * entry and the route are both flag-gated). Container dropdown (+ the current Blox's active plugins), tail
 * count, an "Other" free-text container, logs in an `FxCodeBlock`, copy + refresh; the fetch goes through
 * `fxblox.fetchContainerLogs` and is gated on `fulaIsReady`. Mobile never set `loadingLogs` to true — fixed.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxCodeBlock,
  FxDropdown,
  FxIconButton,
  FxRefreshIcon,
  FxSpacer,
  FxText,
  FxTextInput,
  useToast,
} from '@functionland/fx-ui';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { CurrentBloxIndicator } from '@/components/CurrentBloxIndicator';
import { errorMessage } from '@/components/settings/format';
import { fxblox } from '@/lib/fula';
import { useLogger } from '@/hooks/useLogger';
import {
  useActivePluginsForCurrentBlox,
  useRefetchActivePluginsOnConnect,
} from '@/hooks/usePluginsForBlox';
import { useUserProfileStore } from '@/stores/useUserProfileStore';

export const OTHER_CONTAINER = 'Other';

/** Strips control characters (except newline) — mobile `sanitizeLogData`. */
export function sanitizeLogData(logString: string): string {
  // eslint-disable-next-line no-control-regex
  const regex = /[\u0000-\u0009\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g;
  return logString.replace(regex, ' ');
}

export default function BloxLogs() {
  const { t } = useTranslation();
  const logger = useLogger();
  const [selectedValue, setSelectedValue] = useState<string>('');
  const [log, setLog] = useState<string>('');
  const [tailCount, setTailCount] = useState<string>('50');
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [showOtherInput, setShowOtherInput] = useState<boolean>(false);
  const fulaIsReady = useUserProfileStore((state) => state.fulaIsReady);
  const { queueToast } = useToast();
  // Plugin log sources for the CURRENTLY selected blox (refreshes on switch / when the blox connects).
  const { plugins: activePlugins } = useActivePluginsForCurrentBlox();
  useRefetchActivePluginsOnConnect();

  const fetchContainerLogs = async (containerName: string, tailCountInput: string) => {
    try {
      setLog('');
      setShowOtherInput(containerName === OTHER_CONTAINER);
      if (containerName && containerName !== '' && containerName !== OTHER_CONTAINER) {
        setSelectedValue(containerName);
        if (fulaIsReady) {
          setLoadingLogs(true);
          const logs = await fxblox.fetchContainerLogs(containerName, tailCountInput);
          logger.log('fetchContainerLogs', logs);
          if (logs.status) {
            setLog(sanitizeLogData(logs.msg));
          } else {
            queueToast({
              title: t('settings.bloxLogs.fetchError'),
              message: logs.msg,
              type: 'error',
              autoHideDuration: 5000,
            });
          }
        }
      }
    } catch (error) {
      logger.logError('GetBloxSpace Error', error);
      queueToast({
        title: t('settings.bloxLogs.fetchError'),
        message: errorMessage(error),
        type: 'error',
        autoHideDuration: 5000,
      });
    } finally {
      setLoadingLogs(false);
    }
  };

  const options = [
    { label: t('settings.bloxLogs.selectContainer'), value: '' },
    { label: t('settings.bloxLogs.options.goFula'), value: 'fula_go' },
    { label: t('settings.bloxLogs.options.node'), value: 'fula_node' },
    { label: t('settings.bloxLogs.options.ipfs'), value: 'ipfs_host' },
    { label: t('settings.bloxLogs.options.ipfsCluster'), value: 'ipfs_cluster' },
    { label: t('settings.bloxLogs.options.fx'), value: 'fula_fxsupport' },
    { label: t('settings.bloxLogs.options.serviceLogs'), value: 'MainService' },
    ...(Array.isArray(activePlugins)
      ? activePlugins.map((plugin) => ({ label: plugin, value: plugin }))
      : []),
    { label: t('settings.bloxLogs.options.other'), value: OTHER_CONTAINER },
  ];

  const logTitle = t('settings.bloxLogs.logTitle', { count: tailCount, name: selectedValue });

  return (
    <SettingsScreen title={t('settings.bloxLogs.title')} screen="blox-logs">
      <FxBox marginBottom="16">
        <CurrentBloxIndicator compact showConnectionStatus />
      </FxBox>

      {!fulaIsReady && (
        <FxText variant="bodyXSRegular" color="warningBase" marginBottom="12" role="status">
          {t('settings.bloxLogs.fulaNotReady')}
        </FxText>
      )}

      <FxBox flexDirection="row" gap="12" flexWrap="wrap" alignItems="flex-end">
        <FxDropdown
          flex={1}
          minWidth={200}
          selectedValue={showOtherInput ? OTHER_CONTAINER : selectedValue}
          onValueChange={(itemValue) => void fetchContainerLogs(String(itemValue), tailCount)}
          options={options}
          title={t('settings.bloxLogs.containerName')}
          caption={t('settings.bloxLogs.containerName')}
          testID="blox-logs-container"
        />
        <FxTextInput
          width={180}
          placeholder={t('settings.bloxLogs.tailPlaceholder')}
          aria-label={t('settings.bloxLogs.tailPlaceholder')}
          value={tailCount}
          onChangeText={setTailCount}
          keyboardType="numeric"
          testID="blox-logs-tail"
        />
      </FxBox>
      {showOtherInput && (
        <FxTextInput
          marginTop="12"
          placeholder={t('settings.bloxLogs.otherPlaceholder')}
          aria-label={t('settings.bloxLogs.otherPlaceholder')}
          value={selectedValue}
          onChangeText={setSelectedValue}
          onSubmitEditing={() => void fetchContainerLogs(selectedValue, tailCount)}
          testID="blox-logs-other"
        />
      )}
      <FxSpacer marginTop="24" />
      <FxBox
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        marginBottom="8"
        gap="8"
      >
        <FxText variant="bodyLargeRegular" color="content1" numberOfLines={1}>
          {logTitle}
        </FxText>
        <FxIconButton
          aria-label={t('settings.bloxLogs.refresh')}
          icon={<FxRefreshIcon />}
          color="content3"
          loading={loadingLogs}
          onPress={() => void fetchContainerLogs(selectedValue, tailCount)}
          testID="blox-logs-refresh"
        />
      </FxBox>
      <FxCodeBlock code={log} language="log" maxHeight="60vh" wrap testID="blox-logs-output" />
    </SettingsScreen>
  );
}

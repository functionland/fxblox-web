/**
 * Port of apps/box/src/screens/Plugin.screen.tsx (`/plugins/:name`): info.json via services/pluginCatalog,
 * required inputs, instructions (+ masked outputs with copy), install / uninstall / update through
 * usePluginsStore with the 5 s status polling. `Alert.alert` (update) → `useConfirm().confirm()`.
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxCard,
  FxCopyButton,
  FxPageHeader,
  FxPlusIcon,
  FxRefreshIcon,
  FxSpacer,
  FxSpinner,
  FxTag,
  FxText,
  FxTextInput,
  FxTrashIcon,
  useConfirm,
  useToast,
} from '@functionland/fx-ui';
import { paths } from '@/app/paths';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { usePluginsStore } from '@/stores/usePluginsStore';
import { useActivePluginsForCurrentBlox, useRefetchActivePluginsOnConnect } from '@/hooks/usePluginsForBlox';
import { fetchPluginInfo, type PluginInfo } from '@/services/pluginCatalog';
import { openUrl } from '@/platform/linking';
import { MainScreen } from '@/components/main/MainScreen';
import { useEnsureFulaClient } from '@/components/main/useEnsureFulaClient';

export const INSTALL_POLL_INTERVAL_MS = 5000;
export const OUTPUT_FETCH_DELAY_MS = 5000;
export const UNINSTALL_RESET_MS = 300_000;

export interface PluginDetailInfo extends PluginInfo {
  usage?: { storage: string; compute: string; bandwidth: string; ram: string; gpu: string };
  rewards?: Array<{ type: string; currency: string; link: string }>;
  socials?: Array<Record<string, string | undefined>>;
  instructions?: Array<{ order: number; description: string; url?: string; paramId?: number }>;
  requiredInputs?: Array<{ name: string; instructions: string; type: string; default: string }>;
  outputs?: Array<{ name: string; id: number }>;
  approved?: boolean;
}

const mask = (value: string): string => value.replace(/./g, '•');

export default function PluginDetail() {
  const { name = '' } = useParams<{ name: string }>();
  const { t } = useTranslation();
  const { back } = useAppNavigate();
  useEnsureFulaClient();
  const [pluginInfo, setPluginInfo] = useState<PluginDetailInfo | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [outputValues, setOutputValues] = useState<Record<string, string>>({});
  const { installPlugin, uninstallPlugin, listActivePlugins, updatePlugin, getInstallOutput, getInstallStatus } =
    usePluginsStore();
  // Installed state for the CURRENTLY selected blox (blox-keyed), refreshed when the blox connects.
  const { plugins: activePluginsForBlox } = useActivePluginsForCurrentBlox();
  useRefetchActivePluginsOnConnect();
  const isInstalled = activePluginsForBlox.includes(name);
  const { queueToast } = useToast();
  const { confirm } = useConfirm();
  const [isInstalling, setIsInstalling] = useState(false);
  const [isUninstalling, setIsUninstalling] = useState(false);
  const [installStatus, setInstallStatus] = useState('');
  const [revealedValues, setRevealedValues] = useState<Record<string, boolean>>({});

  // `info` lets the first call (right after info.json arrives) use the fresh data instead of the stale state
  // (mobile relied on the 5 s timer for that first output fetch).
  const fetchInstallOutput = useCallback(async (info: PluginDetailInfo | null = pluginInfo) => {
    if (!info) return;
    const outputParams = (info.outputs ?? []).map((output) => output.name).join(',,,,');
    const result = await getInstallOutput(name, outputParams);
    if (result.success) {
      try {
        const parsedOutput: unknown = JSON.parse(result.message);
        if (typeof parsedOutput === 'object' && parsedOutput !== null) {
          setOutputValues(parsedOutput as Record<string, string>);
        } else {
          console.error('Unexpected output format:', parsedOutput);
        }
      } catch (error) {
        console.error('Failed to parse install output:', error);
      }
    } else {
      console.error('Failed to fetch install output:', result.message);
    }
  }, [getInstallOutput, name, pluginInfo]);

  const fetchInstallStatus = useCallback(async () => {
    if (!name) return;
    const result = await getInstallStatus(name);
    if (result.success) {
      if (result.message !== installStatus) {
        setInstallStatus(result.message);
        if (result.message === 'Installed' || result.message === '') {
          setIsInstalling(false);
          setIsUninstalling(false);
          await listActivePlugins();
        } else if (result.message === 'No Status') {
          // Do nothing for 'No Status'
        } else {
          setIsInstalling(true);
        }
      }
    } else {
      console.error('Failed to fetch install status:', result.message);
    }
  }, [getInstallStatus, name, listActivePlugins, installStatus]);

  const fetchPluginInfoAndStatus = useCallback(async () => {
    if (!name) {
      setPluginInfo(null);
      return;
    }
    try {
      const data = (await fetchPluginInfo(name)) as PluginDetailInfo;
      setPluginInfo(data);
      const initialInputs: Record<string, string> = {};
      (data.requiredInputs ?? []).forEach((input) => {
        initialInputs[input.name] = input.default || '';
      });
      setInputValues(initialInputs);
      // Installed plugins with parameterised instructions get their outputs.
      if (isInstalled && (data.instructions ?? []).some((instruction) => instruction.paramId)) {
        await fetchInstallOutput(data);
      }
      await fetchInstallStatus();
    } catch (error) {
      console.error('Error fetching plugin info:', error);
      setPluginInfo(null);
      queueToast({ type: 'error', title: t('main.common.error'), message: t('main.plugins.detail.fetchError') });
    }
    // Mobile deps: [name, queueToast, isInstalled, fetchInstallStatus]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, queueToast, isInstalled, fetchInstallStatus, t]);

  useEffect(() => {
    // Plugin metadata is blox-independent; the installed-state refresh is handled per-blox on connect.
    void fetchPluginInfoAndStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, installStatus]);

  useEffect(() => {
    if (!(isInstalling || isUninstalling)) return undefined;
    const intervalId = setInterval(() => {
      void fetchInstallStatus();
      if (isInstalling) void fetchInstallOutput();
    }, INSTALL_POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInstalling, isUninstalling]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchInstallOutput();
    }, OUTPUT_FETCH_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, pluginInfo]);

  const handleInstallUninstall = async () => {
    if (isInstalled) {
      setIsUninstalling(true);
      setInstallStatus('Uninstalling');
      const result = await uninstallPlugin(name);
      if (result.success) {
        setInstallStatus('Uninstalled');
        setTimeout(() => {
          setIsUninstalling(false);
          void listActivePlugins();
          setInstallStatus('');
        }, UNINSTALL_RESET_MS);
        queueToast({
          type: 'success',
          title: t('main.common.success'),
          message: t('main.plugins.detail.uninstallInitiated'),
        });
      } else {
        setIsUninstalling(false);
        setInstallStatus('');
        queueToast({ type: 'error', title: t('main.plugins.detail.uninstallError'), message: result.message });
      }
    } else {
      const missingInputs = (pluginInfo?.requiredInputs ?? []).filter((input) => !inputValues[input.name]);
      if (missingInputs.length > 0) {
        queueToast({
          type: 'error',
          title: t('main.plugins.detail.installationError'),
          message: t('main.plugins.detail.missingInputs', {
            inputs: missingInputs.map((i) => i.name).join(', '),
          }),
        });
        return;
      }
      setIsInstalling(true);
      setInstallStatus('Installing');
      const params = Object.entries(inputValues)
        .map(([key, value]) => `${key}====${value}`)
        .join(',,,,');
      const result = await installPlugin(name, params);
      if (result.success) {
        queueToast({
          type: 'success',
          title: t('main.common.success'),
          message: t('main.plugins.detail.installInitiated'),
        });
      } else {
        setIsInstalling(false);
        setInstallStatus('');
        queueToast({ type: 'error', title: t('main.plugins.detail.installError'), message: result.message });
      }
    }
  };

  const handleUpdate = async () => {
    const ok = await confirm({
      title: t('main.plugins.detail.updateTitle'),
      message: t('main.plugins.detail.updateMessage', { name }),
      confirmText: t('main.plugins.detail.updateConfirm'),
      cancelText: t('main.plugins.detail.updateCancel'),
    });
    if (!ok) return;
    try {
      const result = await updatePlugin(name);
      if (result.success) {
        setInstallStatus('Updating');
        queueToast({
          type: 'success',
          title: t('main.common.success'),
          message: t('main.plugins.detail.updateInitiated'),
        });
      } else {
        queueToast({ type: 'error', title: t('main.plugins.detail.updateError'), message: result.message });
      }
    } catch (error) {
      queueToast({
        type: 'error',
        title: t('main.plugins.detail.updateError'),
        message: error instanceof Error ? error.message : t('main.plugins.detail.unknownError'),
      });
    }
  };

  const busy =
    isInstalling || isUninstalling || installStatus === 'Installing' || installStatus === 'Uninstalling';
  const header = (
    <FxPageHeader
      title={pluginInfo?.name ?? name ?? t('main.screens.plugin')}
      onBack={() => back(paths.plugins)}
      backLabel={t('main.plugins.detail.back')}
    />
  );

  if (!name) {
    return (
      <MainScreen screen="plugin" width="reading" testID="plugin-screen">
        {header}
        <FxText>{t('main.plugins.detail.noPlugin')}</FxText>
      </MainScreen>
    );
  }

  if (!pluginInfo) {
    return (
      <MainScreen screen="plugin" width="reading" testID="plugin-screen">
        {header}
        <FxBox flexDirection="row" alignItems="center" gap="8" testID="plugin-loading">
          <FxSpinner label={t('main.plugins.detail.loading')} />
          <FxText>{t('main.plugins.detail.loading')}</FxText>
        </FxBox>
      </MainScreen>
    );
  }

  const outputNameFor = (paramId: number | undefined): string =>
    (pluginInfo.outputs ?? []).find((o) => o.id === paramId)?.name ?? '';

  return (
    <MainScreen screen="plugin" width="reading" testID="plugin-screen">
      {header}
      <FxCard>
        <FxBox flexDirection="row" alignItems="center" justifyContent="space-between" gap="8">
          <FxBox minWidth={0}>
            <FxCard.Title>{pluginInfo.name}</FxCard.Title>
            <FxText variant="bodyXSRegular">
              {t('main.plugins.detail.version', { version: pluginInfo.version })}
            </FxText>
          </FxBox>
          <FxTag>
            {pluginInfo.approved ? t('main.plugins.detail.approved') : t('main.plugins.detail.pending')}
          </FxTag>
        </FxBox>
        <FxSpacer marginTop="16" />
        <FxText variant="bodySmallRegular">{pluginInfo.description}</FxText>

        {pluginInfo.usage && (
          <>
            <FxSpacer marginTop="24" />
            <FxText as="h2" variant="h400">
              {t('main.plugins.detail.resourceUsage')}
            </FxText>
            {(['storage', 'compute', 'bandwidth', 'ram', 'gpu'] as const).map((key) => (
              <FxCard.Row key={key}>
                <FxCard.Row.Title>{t(`main.plugins.detail.${key}`)}</FxCard.Row.Title>
                <FxCard.Row.Data>{pluginInfo.usage?.[key]}</FxCard.Row.Data>
              </FxCard.Row>
            ))}
          </>
        )}

        {pluginInfo.rewards && pluginInfo.rewards.length > 0 && (
          <>
            <FxSpacer marginTop="24" />
            <FxText as="h2" variant="h400">
              {t('main.plugins.detail.rewards')}
            </FxText>
            {pluginInfo.rewards.map((reward, index) => (
              <FxCard.Row key={index}>
                <FxCard.Row.Title>{reward.type}</FxCard.Row.Title>
                <FxCard.Row.Data>{reward.currency}</FxCard.Row.Data>
              </FxCard.Row>
            ))}
          </>
        )}

        {pluginInfo.socials && pluginInfo.socials[0] && (
          <>
            <FxSpacer marginTop="24" />
            <FxText as="h2" variant="h400">
              {t('main.plugins.detail.socials')}
            </FxText>
            <FxBox flexDirection="row" flexWrap="wrap" gap="8" marginTop="8">
              {Object.entries(pluginInfo.socials[0]).map(
                ([platform, link]) =>
                  link && (
                    <FxButton key={platform} onPress={() => openUrl(link)} variant="inverted" size="small">
                      {platform}
                    </FxButton>
                  ),
              )}
            </FxBox>
          </>
        )}

        {pluginInfo.instructions && pluginInfo.instructions.length > 0 && (
          <>
            <FxSpacer marginTop="24" />
            <FxText as="h2" variant="h400">
              {t('main.plugins.detail.instructions')}
            </FxText>
            <FxBox as="ol" className="m-0 list-none p-0" marginTop="8">
              {[...pluginInfo.instructions]
                .sort((a, b) => a.order - b.order)
                .map((instruction) => {
                  const outputName = outputNameFor(instruction.paramId);
                  const value = outputValues[outputName] || '';
                  const showOutput = Boolean(instruction.paramId && value);
                  return (
                    <FxBox as="li" key={`instruction-${instruction.order}`} marginBottom="16">
                      <FxText variant="bodyMediumRegular">{`${instruction.order}. ${instruction.description}`}</FxText>
                      {instruction.url && (
                        <FxButton
                          onPress={() => openUrl(instruction.url!)}
                          variant="inverted"
                          marginTop="4"
                          size="small"
                        >
                          {t('main.plugins.detail.open')}
                        </FxButton>
                      )}
                      {showOutput && (
                        <FxBox
                          flexDirection="row"
                          alignItems="center"
                          gap="8"
                          marginTop="4"
                          padding="8"
                          borderRadius="s"
                          backgroundColor="backgroundSecondary"
                          testID={`plugin-output-${outputName}`}
                        >
                          <FxText variant="bodySmallRegular" className="min-w-0 flex-1 break-all font-mono">
                            {outputName}: {revealedValues[outputName] ? value : mask(value)}
                          </FxText>
                          <FxCopyButton
                            value={value}
                            label={t('main.plugins.detail.copyOutput', { name: outputName })}
                            copiedLabel={t('main.common.copied')}
                            onCopied={() => setRevealedValues((prev) => ({ ...prev, [outputName]: true }))}
                          />
                        </FxBox>
                      )}
                    </FxBox>
                  );
                })}
            </FxBox>
          </>
        )}

        {!isInstalled && pluginInfo.requiredInputs && pluginInfo.requiredInputs.length > 0 && (
          <>
            <FxSpacer marginTop="24" />
            <FxText as="h2" variant="h400">
              {t('main.plugins.detail.requiredInputs')}
            </FxText>
            {pluginInfo.requiredInputs.map((input) => (
              <FxBox key={input.name} marginBottom="16" marginTop="8">
                <FxText variant="bodySmallRegular" color="content2" marginBottom="8">
                  {input.instructions}
                </FxText>
                <FxTextInput
                  caption={input.name}
                  value={inputValues[input.name] ?? ''}
                  onChangeText={(text) => setInputValues((prev) => ({ ...prev, [input.name]: text }))}
                  placeholder={input.default || t('main.plugins.detail.enterInput', { name: input.name })}
                  testID={`plugin-input-${input.name}`}
                />
              </FxBox>
            ))}
          </>
        )}

        <FxSpacer marginTop="24" />
        {installStatus && (
          <FxText variant="bodySmallRegular" marginBottom="8" role="status" testID="plugin-install-status">
            {t('main.plugins.detail.status', { status: installStatus })}
          </FxText>
        )}
        <FxBox flexDirection="row" flexWrap="wrap" justifyContent="space-between" gap="8">
          <FxButton
            onPress={() => void handleInstallUninstall()}
            paddingHorizontal="16"
            iconLeft={isInstalled ? <FxTrashIcon /> : <FxPlusIcon />}
            disabled={busy}
            testID="plugin-install-toggle"
          >
            {isInstalled ? t('main.plugins.detail.uninstall') : t('main.plugins.detail.install')}
            {installStatus && ` (${installStatus})`}
          </FxButton>
          {isInstalled && (
            <FxButton
              onPress={() => void handleUpdate()}
              paddingHorizontal="16"
              iconLeft={<FxRefreshIcon />}
              disabled={busy}
              testID="plugin-update"
            >
              {t('main.plugins.detail.update')}
            </FxButton>
          )}
        </FxBox>
      </FxCard>
    </MainScreen>
  );
}

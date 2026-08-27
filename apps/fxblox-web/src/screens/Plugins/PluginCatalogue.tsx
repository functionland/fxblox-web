/**
 * Port of apps/box/src/components/GlobalBottomSheet.tsx as a page: the plugin catalogue (`info.json` via
 * services/pluginCatalog) in a 4 / 6 / 8 column grid with the three installed-state notices ("checking",
 * "couldn't reach this blox", per-plugin "Installed") from the blox-keyed plugins store.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DynamicIcon,
  FxBox,
  FxButton,
  FxPageHeader,
  FxPlugIcon,
  FxPressableOpacity,
  FxSpinner,
  FxText,
  cn,
} from '@functionland/fx-ui';
import { paths } from '@/app/paths';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useActivePluginsForCurrentBlox, useRefetchActivePluginsOnConnect } from '@/hooks/usePluginsForBlox';
import { fetchPluginCatalog, type PluginInfo } from '@/services/pluginCatalog';
import { MainScreen } from '@/components/main/MainScreen';
import { useEnsureFulaClient } from '@/components/main/useEnsureFulaClient';

export type CataloguePlugin = PluginInfo & {
  'icon-path'?: string;
  'icon-file'?: string;
};

type LoadState = 'loading' | 'loaded' | 'error';

export function PluginIcon({ plugin, size = 28 }: { plugin: CataloguePlugin; size?: number }) {
  const iconPath = typeof plugin['icon-path'] === 'string' ? plugin['icon-path'] : undefined;
  const iconFile = typeof plugin['icon-file'] === 'string' ? plugin['icon-file'] : undefined;
  if (iconPath) return <DynamicIcon iconPath={iconPath} color="primary" width={size} height={size} />;
  if (iconFile)
    return <img src={iconFile} alt="" width={size} height={size} className="object-contain" loading="lazy" />;
  return <FxPlugIcon color="primary" width={size} height={size} />;
}

export default function PluginCatalogue() {
  const { t } = useTranslation();
  const { navigate } = useAppNavigate();
  useEnsureFulaClient();
  const [plugins, setPlugins] = useState<CataloguePlugin[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  // Installed-plugin list + fetch status for the CURRENTLY selected blox (refreshes on blox switch / connect).
  const { plugins: activePlugins, status: activePluginsStatus } = useActivePluginsForCurrentBlox();
  useRefetchActivePluginsOnConnect();

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const list = (await fetchPluginCatalog()) as CataloguePlugin[];
      setPlugins(list);
      setLoadState('loaded');
    } catch (error) {
      console.error('Error fetching plugins:', error);
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <MainScreen screen="plugins" width="dashboard" testID="plugins-screen">
      <FxPageHeader title={t('main.plugins.title')} subtitle={t('main.plugins.subtitle')} />
      {(activePluginsStatus === 'idle' || activePluginsStatus === 'loading') && (
        <FxText variant="bodyXSLight" color="content3" marginBottom="8" testID="plugins-installed-checking">
          {t('main.plugins.checkingInstalled')}
        </FxText>
      )}
      {activePluginsStatus === 'error' && (
        <FxText
          variant="bodyXSLight"
          color="errorBase"
          marginBottom="8"
          role="status"
          testID="plugins-installed-error"
        >
          {t('main.plugins.installStatusUnavailable')}
        </FxText>
      )}

      {loadState === 'loading' && (
        <FxBox flexDirection="row" alignItems="center" gap="8" paddingVertical="16" testID="plugins-loading">
          <FxSpinner label={t('main.plugins.loading')} />
          <FxText variant="bodySmallRegular" color="content2">
            {t('main.plugins.loading')}
          </FxText>
        </FxBox>
      )}
      {loadState === 'error' && (
        <FxBox role="alert" alignItems="flex-start" gap="8" paddingVertical="16" testID="plugins-error">
          <FxText variant="bodySmallRegular" color="errorBase">
            {t('main.plugins.loadFailed')}
          </FxText>
          <FxButton variant="inverted" size="small" onPress={() => void load()} testID="plugins-retry">
            {t('main.plugins.retry')}
          </FxButton>
        </FxBox>
      )}
      {loadState === 'loaded' && plugins.length === 0 && (
        <FxText variant="bodySmallRegular" color="content2" paddingVertical="16">
          {t('main.plugins.empty')}
        </FxText>
      )}
      {loadState === 'loaded' && plugins.length > 0 && (
        <ul
          aria-label={t('main.plugins.title')}
          data-testid="plugins-grid"
          className="m-0 grid list-none grid-cols-4 gap-2 p-0 py-4 desktop:grid-cols-6 wide:grid-cols-8"
        >
          {plugins.map((plugin) => {
            const installed = activePlugins.includes(plugin.name);
            return (
              <li key={plugin.name} className="min-w-0">
                <FxPressableOpacity
                  onPress={() => void navigate(paths.plugin(plugin.name))}
                  aria-label={t('main.plugins.open', { name: plugin.name })}
                  alignItems="center"
                  paddingVertical="8"
                  paddingHorizontal="4"
                  gap="4"
                  borderRadius="m"
                  className={cn('w-full fx-hover-opacity hover:bg-background-secondary')}
                  testID={`plugin-${plugin.name}`}
                  data-installed={installed}
                >
                  <PluginIcon plugin={plugin} />
                  <FxText
                    variant="bodyXSRegular"
                    color="content1"
                    textAlign="center"
                    numberOfLines={2}
                    className="w-full break-words"
                  >
                    {plugin.name}
                  </FxText>
                  {installed && (
                    <FxText variant="bodyXSLight" color="greenBase" testID={`plugin-${plugin.name}-installed`}>
                      {t('main.plugins.installed')}
                    </FxText>
                  )}
                </FxPressableOpacity>
              </li>
            );
          })}
        </ul>
      )}
    </MainScreen>
  );
}

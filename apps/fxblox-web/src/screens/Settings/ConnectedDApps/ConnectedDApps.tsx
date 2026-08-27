/**
 * Port of apps/box/src/screens/Settings/ConnectedDApps/ConnectedDApps.screen.tsx.
 * Routes: /settings/dapps (menu) and the deep link /connectdapp/:appName/:bundleId/:peerId/:returnDeepLink/:accountId
 * (`useParams()` pre-fills and presents the Add sheet, as the mobile route params did). After "Add and
 * Authorize" the dApp account is funded through `useDAppsStore.setAuth` (`accountId`), the dApp is recorded,
 * an alert says "Authorized!" and — because custom-scheme returns need a user click — an "Open {app}" button
 * runs `location.assign(returnDeepLink with $bloxName / $bloxPeerId substituted)`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  FxAppIcon,
  FxBox,
  FxButton,
  FxEmptyState,
  FxHeader,
  FxText,
  useConfirm,
  useToast,
  type FxSheetMethods,
} from '@functionland/fx-ui';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { errorMessage } from '@/components/settings/format';
import useCallbackState from '@/hooks/useCallbackState';
import { useLogger } from '@/hooks/useLogger';
import { assign, canOpenUrl } from '@/platform/linking';
import { useDAppsStore } from '@/stores/dAppsSettingsStore';
import { useBloxsStore } from '@/stores/useBloxsStore';
import type { TDApp } from '@/models';
import fileSyncLogo from '@/assets/images/file_sync_logo.png';
import { AddDAppSheet, type AddAppForm } from './AddDAppSheet';
import { DAppSettingsSheet } from './DAppSettingsSheet';
import { DAppCard } from './DAppCard';

export type ConnectDAppParamKey =
  'appName' | 'bundleId' | 'peerId' | 'returnDeepLink' | 'accountId';

/**
 * Mobile: `decodeURIComponent(returnDeepLink).replace('$bloxName', name.replaceAll(' ', '_')).replace('$bloxPeerId', id)`.
 * react-router already decodes the path segment once; the extra decode is kept for senders that double-encode
 * and is tolerant of malformed sequences. Returns `null` when the result is not a URL.
 */
export function buildReturnLink(raw: string, bloxName: string, bloxPeerId: string): string | null {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* keep the raw value */
  }
  const url = decoded
    .replace('$bloxName', () => bloxName.replaceAll(' ', '_'))
    .replace('$bloxPeerId', () => bloxPeerId);
  return canOpenUrl(url) ? url : null;
}

export default function ConnectedDApps() {
  const { t } = useTranslation();
  const params = useParams<ConnectDAppParamKey>();
  const logger = useLogger();
  const { queueToast } = useToast();
  const { alert } = useConfirm();
  const [isList, setIsList] = useState(false);
  const addDAppSheetRef = useRef<FxSheetMethods>(null);
  const dAppSettingsSheetRef = useRef<FxSheetMethods>(null);
  const [selectedDApp, setSelectedDApp] = useCallbackState<TDApp | null>(null);
  const [addAppForm, setAddAppForm] = useState<AddAppForm | undefined>();
  const [pendingReturn, setPendingReturn] = useState<{ url: string; app: string } | null>(null);
  const connectedDApps = useDAppsStore((state) => state.connectedDApps);
  const setAuth = useDAppsStore((state) => state.setAuth);
  const addOrUpdateDApp = useDAppsStore((state) => state.addOrUpdateDApp);
  const bloxs = useBloxsStore((state) => state.bloxs);
  const currentBloxPeerId = useBloxsStore((state) => state.currentBloxPeerId);
  const currentBlox = useMemo(
    () => (currentBloxPeerId ? bloxs[currentBloxPeerId] : undefined),
    [bloxs, currentBloxPeerId],
  );
  const connectedDAppsArray = useMemo(
    () => (currentBloxPeerId ? Object.values(connectedDApps?.[currentBloxPeerId] || {}) : []),
    [connectedDApps, currentBloxPeerId],
  );

  const { appName, bundleId, peerId, returnDeepLink, accountId } = params;

  // Deep link: pre-fill and present the Add sheet.
  useEffect(() => {
    if (appName) {
      setAddAppForm({
        appName,
        bundleId,
        peerId,
        bloxPeerId: useBloxsStore.getState().currentBloxPeerId,
        accountId,
      });
      addDAppSheetRef.current?.present();
    }
  }, [appName, bundleId, peerId, accountId]);

  const showDAppSettingsSheet = (dApp: TDApp) => {
    setSelectedDApp(dApp, () => {
      dAppSettingsSheetRef.current?.present();
    });
  };

  const addAndAuthorize = async (dApp: AddAppForm) => {
    try {
      await setAuth({
        peerId: dApp.peerId ? dApp.peerId : '',
        allow: true,
        accountId: dApp.accountId,
      });
      addOrUpdateDApp({
        name: dApp.appName,
        peerId: dApp.peerId,
        bundleId: dApp.bundleId,
        bloxPeerId: dApp.bloxPeerId,
        accountId: dApp.accountId,
        authorized: true,
        lastUpdate: new Date(),
        storageUsed: 0,
      });
      addDAppSheetRef.current?.close();
      const app = appName ?? dApp.appName ?? '';
      const link =
        returnDeepLink && dApp.bloxPeerId
          ? buildReturnLink(returnDeepLink, currentBlox?.name ?? '', dApp.bloxPeerId)
          : null;
      if (link) {
        setPendingReturn({ url: link, app });
        await alert({
          title: t('settings.dapps.authorized.title'),
          message: t('settings.dapps.authorized.message', { app }),
          okText: t('settings.dapps.authorized.ok'),
        });
      }
    } catch (error) {
      logger.logError('addAndAuthorize', error);
      queueToast({
        type: 'error',
        title: t('settings.dapps.error'),
        message: errorMessage(error),
      });
    }
  };

  return (
    <SettingsScreen title={t('settings.dapps.title')} screen="connected-dapps">
      {pendingReturn && (
        <FxBox
          backgroundColor="greenBackground"
          padding="16"
          borderRadius="s"
          marginBottom="16"
          gap="12"
          role="status"
          testID="dapp-return-panel"
        >
          <FxText color="content1" variant="bodySmallRegular">
            {t('settings.dapps.authorized.message', { app: pendingReturn.app })}
          </FxText>
          <FxButton
            onPress={() => assign(pendingReturn.url)}
            alignSelf="flex-start"
            testID="dapp-open-return"
          >
            {t('settings.dapps.openApp', { app: pendingReturn.app })}
          </FxButton>
        </FxBox>
      )}

      <FxHeader
        marginTop="16"
        marginBottom="16"
        title={currentBlox?.name ?? t('settings.dapps.noBlox')}
        isList={isList}
        setIsList={setIsList}
        onAddPress={() => addDAppSheetRef.current?.present()}
        addLabel={t('settings.dapps.add')}
      />

      {connectedDAppsArray.length === 0 ? (
        <FxEmptyState
          icon={<FxAppIcon />}
          title={t('settings.dapps.empty')}
          description={t('settings.dapps.emptyHint')}
          compact
          testID="dapps-empty"
        />
      ) : (
        connectedDAppsArray.map((dApp) => (
          <DAppCard
            key={dApp.peerId || dApp.bundleId}
            isDetailed={!isList}
            imageSrc={fileSyncLogo}
            data={dApp}
            onPress={() => showDAppSettingsSheet(dApp)}
          />
        ))
      )}

      <AddDAppSheet
        ref={addDAppSheetRef}
        form={addAppForm}
        onSubmit={(f) => void addAndAuthorize(f)}
      />
      <DAppSettingsSheet ref={dAppSettingsSheetRef} dApp={selectedDApp} />
    </SettingsScreen>
  );
}

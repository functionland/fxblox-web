/**
 * Port of apps/box/src/screens/Diagnostics/RawDiagnosticsCard.tsx — "Raw diagnostics (for support)": fetch the
 * diag bundle (LAN HTTP, else BLE), show the exact merged JSON (FxCodeBlock — its Copy covers the case where
 * the intake host blocks the POST), "Send to support" → ai-training.fx.land/diagnostics, and "Enable remote
 * support" (LAN-only WireGuard start via the security-code modal).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxCard, FxCodeBlock, FxSpinner, FxText } from '@functionland/fx-ui';
import { selectAiTransport } from '@/utils/aiTransport';
import { BleAiClient } from '@/utils/bleAiClient';
import type { BleCommandWriter } from '@/utils/ble';
import type { DiagBundle } from '@/utils/httpAiClient';
import {
  buildDiagnosticsPayload,
  postDiagnostics,
  type DiagnosticsPayload,
  type DiagnosticsRelayInfo,
} from '@/utils/diagnosticsUpload';
import { platformName } from '@/platform/deviceInfo';
import { RemoteSupportModal } from './RemoteSupportModal';
import type { ProbeStatus, RelayInfo } from './probes';

export interface RawDiagnosticsCardProps {
  pluginInstalled: boolean;
  bloxKuboPeerId: string;
  bloxClusterPeerId: string | null;
  appPeerId: string;
  phoneInternet: ProbeStatus;
  discoveryStatus: ProbeStatus;
  relays: RelayInfo[] | null;
  bleManager: BleCommandWriter | null;
  blePeripheralId: string | null;
  manualIp?: string | null;
}

type FetchState = 'idle' | 'fetching' | 'done';
type SendState = 'idle' | 'sending' | 'sent' | 'error';

export function RawDiagnosticsCard(props: RawDiagnosticsCardProps) {
  const { t } = useTranslation();
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [payload, setPayload] = useState<DiagnosticsPayload | null>(null);
  const [transportUsed, setTransportUsed] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sendState, setSendState] = useState<SendState>('idle');
  const [sendError, setSendError] = useState<string | null>(null);
  const [supportModalVisible, setSupportModalVisible] = useState(false);
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportResult, setSupportResult] = useState<{ ok: boolean; message: string } | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const { bloxKuboPeerId, appPeerId, bloxClusterPeerId, phoneInternet, discoveryStatus, relays, bleManager, blePeripheralId, manualIp } = props;

  const handleFetch = useCallback(async () => {
    setFetchState('fetching');
    setFetchError(null);
    setPayload(null);
    setTransportUsed(null);
    setSendState('idle');
    setSendError(null);

    let chosen = 'none';
    let bundle: DiagBundle | null = null;
    let bundleError: string | null = null;

    try {
      const choice = await selectAiTransport(bloxKuboPeerId, appPeerId, { scanIfEmpty: true, manualIp: manualIp ?? undefined });
      if (choice.kind === 'lan-http' && choice.httpClient) {
        chosen = 'lan-http';
        const r = await choice.httpClient.fetchDiagBundle();
        if (r.ok && r.payload) {
          bundle = r.payload;
        } else {
          bundleError = r.error?.message ?? 'LAN fetch failed';
          if (bleManager && blePeripheralId) {
            const ble = new BleAiClient(bleManager, blePeripheralId);
            const rb = await ble.fetchDiagBundle();
            if (rb.ok && rb.payload) {
              bundle = rb.payload;
              bundleError = null;
              chosen = 'ble';
            } else {
              bundleError = rb.error?.message ?? bundleError;
            }
          }
        }
      } else if (bleManager && blePeripheralId) {
        chosen = 'ble';
        const ble = new BleAiClient(bleManager, blePeripheralId);
        const rb = await ble.fetchDiagBundle();
        if (rb.ok && rb.payload) {
          bundle = rb.payload;
        } else {
          bundleError = rb.error?.message ?? 'BLE fetch failed';
        }
      } else {
        chosen = 'none';
        bundleError = choice.reason || 'no transport available';
      }
    } catch (e) {
      bundleError = e instanceof Error ? e.message : 'fetch failed';
    }

    if (!mountedRef.current) return;

    const relaysForPayload: DiagnosticsRelayInfo[] | null = relays
      ? relays.map((r) => ({ dns_name: r.dnsName, status: r.status }))
      : null;

    const built = buildDiagnosticsPayload({
      bloxKuboPeerId,
      bloxClusterPeerId,
      appPeerId,
      phoneInternet,
      discoveryStatus,
      relays: relaysForPayload,
      transportUsed: chosen,
      appPlatform: platformName(),
      bundle,
      bundleError,
    });

    setPayload(built);
    setTransportUsed(chosen);
    setFetchError(bundleError);
    setFetchState('done');
  }, [bloxKuboPeerId, appPeerId, bloxClusterPeerId, phoneInternet, discoveryStatus, relays, bleManager, blePeripheralId, manualIp]);

  const handleSend = useCallback(async () => {
    if (!payload) return;
    setSendState('sending');
    setSendError(null);
    const r = await postDiagnostics(payload);
    if (!mountedRef.current) return;
    if (r.ok) {
      setSendState('sent');
    } else {
      setSendState('error');
      setSendError(r.error ?? 'failed');
    }
  }, [payload]);

  const handleConfirmSupport = useCallback(
    async (code: string) => {
      setSupportBusy(true);
      setSupportResult(null);
      try {
        const choice = await selectAiTransport(bloxKuboPeerId, appPeerId, { scanIfEmpty: true, manualIp: manualIp ?? undefined });
        if (choice.kind !== 'lan-http' || !choice.httpClient) {
          if (!mountedRef.current) return;
          setSupportBusy(false);
          setSupportResult({ ok: false, message: t('diagnostics.remoteSupport.lanOnly') });
          return;
        }
        const r = await choice.httpClient.enableRemoteSupport(code);
        if (!mountedRef.current) return;
        setSupportBusy(false);
        if (r.ok && r.payload?.success) {
          setSupportModalVisible(false);
          setSupportResult({ ok: true, message: t('diagnostics.remoteSupport.success') });
          return;
        }
        let message = t('diagnostics.remoteSupport.failed');
        const errCode = r.payload?.error;
        if (errCode === 'security_code_invalid') message = t('diagnostics.remoteSupport.badCode');
        else if (errCode === 'security_code_file_missing') message = t('diagnostics.remoteSupport.noCodeFile');
        else if (errCode === 'support_header_required') message = t('diagnostics.remoteSupport.headerRejected');
        else if (errCode === 'wireguard_not_installed') message = t('diagnostics.remoteSupport.notInstalled');
        else if (errCode === 'tunnel_inactive_after_restart') message = t('diagnostics.remoteSupport.tunnelInactive');
        else if (r.error?.message) message = r.error.message;
        setSupportResult({ ok: false, message });
      } catch (e) {
        if (!mountedRef.current) return;
        setSupportBusy(false);
        setSupportResult({ ok: false, message: e instanceof Error ? e.message : t('diagnostics.remoteSupport.failed') });
      }
    },
    [bloxKuboPeerId, appPeerId, manualIp, t],
  );

  const openSupportModal = useCallback(() => {
    setSupportResult(null);
    setSupportModalVisible(true);
  }, []);
  const closeSupportModal = useCallback(() => setSupportModalVisible(false), []);

  if (!props.pluginInstalled) {
    return (
      <FxCard testID="raw-diagnostics-card">
        <FxCard.Title>{t('diagnostics.rawDiagnosticsTitle')}</FxCard.Title>
        <FxBox paddingVertical="8" gap="8">
          <FxText variant="bodySmallRegular">{t('diagnostics.rawDiagnosticsPluginRequired')}</FxText>
          <FxButton disabled testID="raw-diag-unavailable">
            {t('diagnostics.rawDiagnosticsUnavailable')}
          </FxButton>
        </FxBox>
      </FxCard>
    );
  }

  const previewJson = payload ? JSON.stringify(payload, null, 2) : '';
  const fetching = fetchState === 'fetching';

  return (
    <FxCard testID="raw-diagnostics-card">
      <FxCard.Title>{t('diagnostics.rawDiagnosticsTitle')}</FxCard.Title>
      <FxBox paddingVertical="8" gap="12">
        <FxText variant="bodySmallRegular">{t('diagnostics.rawDiag.intro')}</FxText>

        <FxButton onPress={() => void handleFetch()} disabled={fetching} loading={fetching} testID="raw-diag-fetch">
          {fetching
            ? t('diagnostics.rawDiag.fetching')
            : fetchState === 'done'
              ? t('diagnostics.rawDiag.refetch')
              : t('diagnostics.rawDiag.fetch')}
        </FxButton>

        {fetching && (
          <FxBox flexDirection="row" alignItems="center" gap="8">
            <FxSpinner label={null} />
            <FxText variant="bodySmallRegular">{t('diagnostics.rawDiag.fetchingHint')}</FxText>
          </FxBox>
        )}

        {fetchState === 'done' && (
          <FxBox gap="4">
            <FxText variant="bodyXSRegular" testID="raw-diag-transport" data-transport={transportUsed}>
              {transportUsed === 'lan-http'
                ? t('diagnostics.rawDiag.viaLan')
                : transportUsed === 'ble'
                  ? t('diagnostics.rawDiag.viaBle')
                  : t('diagnostics.rawDiag.viaNone')}
            </FxText>
            {fetchError ? (
              <FxText variant="bodyXSRegular" color="errorBase">
                {t('diagnostics.rawDiag.bloxUnreachable')}
              </FxText>
            ) : null}
          </FxBox>
        )}

        {payload && (
          <FxBox gap="8">
            <FxText variant="bodyXSRegular">{t('diagnostics.rawDiag.previewIntro')}</FxText>
            <FxCodeBlock code={previewJson} language="json" maxHeight={320} testID="raw-diag-preview" />
            <FxButton
              onPress={() => void handleSend()}
              disabled={sendState === 'sending' || sendState === 'sent'}
              loading={sendState === 'sending'}
              testID="raw-diag-send"
            >
              {sendState === 'sending'
                ? t('diagnostics.rawDiag.sending')
                : sendState === 'sent'
                  ? t('diagnostics.rawDiag.sent')
                  : t('diagnostics.rawDiag.send')}
            </FxButton>
            {sendState === 'sent' && (
              <FxText variant="bodySmallRegular" color="successBase" role="status" testID="raw-diag-sent">
                {t('diagnostics.rawDiag.sentConfirmation')}
              </FxText>
            )}
            {sendState === 'error' && (
              <FxText variant="bodySmallRegular" color="errorBase" role="alert" testID="raw-diag-send-error">
                {t('diagnostics.rawDiag.sendFailed')} {sendError ?? ''}
              </FxText>
            )}
          </FxBox>
        )}

        <FxBox gap="8" marginTop="8">
          <FxText variant="bodySmallRegular">{t('diagnostics.remoteSupport.sectionHint')}</FxText>
          <FxButton variant="inverted" onPress={openSupportModal} testID="raw-diag-enable-support">
            {t('diagnostics.remoteSupport.openButton')}
          </FxButton>
          {supportResult && !supportModalVisible && (
            <FxText
              variant="bodySmallRegular"
              color={supportResult.ok ? 'successBase' : 'errorBase'}
              role="status"
              testID="raw-diag-support-result"
            >
              {supportResult.message}
            </FxText>
          )}
        </FxBox>
      </FxBox>

      <RemoteSupportModal
        visible={supportModalVisible}
        onConfirm={(code) => void handleConfirmSupport(code)}
        onCancel={closeSupportModal}
        busy={supportBusy}
        resultMessage={supportModalVisible ? (supportResult?.message ?? null) : null}
        resultOk={supportResult?.ok ?? false}
      />
    </FxCard>
  );
}

export default RawDiagnosticsCard;

/**
 * Port of apps/box/src/components/ConnectionOptionsSheet.tsx — Retry, Connect blox to Wi-Fi, and the two
 * pools.fx.land pings (`/ping` for the kubo peer id, `/ping-cluster` for the cluster) with inline status.
 * axios → fetch: the reachability pre-check is a `no-cors` probe (an opaque response proves the host answered).
 */
import { useCallback, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxPressableOpacity, FxSheet, FxSpinner, FxText, type ColorToken, type FxSheetMethods } from '@functionland/fx-ui';
import { useBloxsStore } from '@/stores/useBloxsStore';
import { probeNoCors } from '@/platform/lanHttp';
import { FXPoolsURL } from '@/utils/constants';

export type PingStatus = 'idle' | 'pinging' | 'connected' | 'disconnected' | 'error';
export type ConnectionOptionsType = 'RETRY' | 'CONNECT-TO-WIFI' | 'RESET-CHAIN';

export interface PingResult {
  status: PingStatus;
  /** Untranslated detail: a latency (`123ms`) or an i18n key under `main.blox.connection.*`. */
  message?: string;
  /** True when `message` is an i18n key. */
  messageIsKey?: boolean;
}

export const PING_URL = `${FXPoolsURL}/ping`;
export const PING_CLUSTER_URL = `${FXPoolsURL}/ping-cluster`;
const REACH_TIMEOUT_MS = 10_000;
const PING_TIMEOUT_MS = 60_000;

async function postJson(url: string, body: unknown, timeoutMs: number): Promise<{ ok: boolean; data: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let data: unknown = null;
    try {
      data = await resp.json();
    } catch {
      data = null;
    }
    return { ok: resp.ok, data };
  } finally {
    clearTimeout(timer);
  }
}

async function ping(url: string, peerId: string): Promise<PingResult> {
  // Step 1: pools.fx.land reachable at all? Any answer (even 404) counts.
  if ((await probeNoCors(FXPoolsURL, REACH_TIMEOUT_MS)) !== 'reachable') {
    return { status: 'error', message: 'main.blox.connection.cannotReachPools', messageIsKey: true };
  }
  // Step 2: the ping itself.
  try {
    const { data } = await postJson(url, { peerId }, PING_TIMEOUT_MS);
    const d = (data ?? {}) as { status?: string; msg?: string; success?: boolean; latency?: number };
    if (d.status === 'err') {
      return d.msg
        ? { status: 'error', message: d.msg }
        : { status: 'error', message: 'main.blox.connection.rateLimited', messageIsKey: true };
    }
    if (d.success === true) return { status: 'connected', message: `${d.latency ?? '?'}ms` };
    return { status: 'disconnected', message: 'main.blox.connection.notReachable', messageIsKey: true };
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : undefined;
    return message
      ? { status: 'error', message }
      : { status: 'error', message: 'main.blox.connection.pingFailed', messageIsKey: true };
  }
}

export const pingPeerId = (peerId: string): Promise<PingResult> => ping(PING_URL, peerId);
export const pingCluster = (peerId: string): Promise<PingResult> => ping(PING_CLUSTER_URL, peerId);

function PingStatusText({ status, message, messageIsKey, testID }: PingResult & { testID?: string }) {
  const { t } = useTranslation();
  if (status === 'idle') return null;
  if (status === 'pinging') return <FxSpinner size="small" label={t('main.blox.connection.pinging')} />;
  const color: ColorToken =
    status === 'connected' ? 'successBase' : status === 'disconnected' ? 'errorBase' : 'warningBase';
  const label =
    status === 'connected'
      ? t('main.blox.connection.connected')
      : status === 'disconnected'
        ? t('main.blox.connection.disconnected')
        : t('main.blox.connection.error');
  const detail = message ? (messageIsKey ? t(message) : message) : '';
  return (
    <FxText variant="bodySmallRegular" color={color} testID={testID} data-status={status}>
      {label}
      {detail ? ` (${detail})` : ''}
    </FxText>
  );
}

export interface ConnectionOptionsSheetProps {
  onSelected?: (item: ConnectionOptionsType) => void;
  ref?: Ref<FxSheetMethods>;
}

export function ConnectionOptionsSheet({ onSelected, ref }: ConnectionOptionsSheetProps) {
  const { t } = useTranslation();
  const currentBloxPeerId = useBloxsStore((state) => state.currentBloxPeerId);
  const [bloxPing, setBloxPing] = useState<PingResult>({ status: 'idle' });
  const [clusterPing, setClusterPing] = useState<PingResult>({ status: 'idle' });

  const handlePingBlox = useCallback(async () => {
    if (!currentBloxPeerId || bloxPing.status === 'pinging') return;
    setBloxPing({ status: 'pinging' });
    setBloxPing(await pingPeerId(currentBloxPeerId));
  }, [currentBloxPeerId, bloxPing.status]);

  const handlePingCluster = useCallback(async () => {
    if (!currentBloxPeerId || clusterPing.status === 'pinging') return;
    setClusterPing({ status: 'pinging' });
    setClusterPing(await pingCluster(currentBloxPeerId));
  }, [currentBloxPeerId, clusterPing.status]);

  const rowClass = 'w-full text-left rounded-fx-s hover:bg-background-secondary';

  return (
    <FxSheet ref={ref} title={t('main.blox.connection.title')} testID="connection-options-sheet">
      <FxBox paddingVertical="8" gap="4">
        <FxPressableOpacity
          paddingVertical="8"
          paddingHorizontal="8"
          minHeight={40}
          className={rowClass}
          onPress={() => onSelected?.('RETRY')}
          testID="connection-option-retry"
        >
          <FxText variant="bodyMediumRegular">{t('main.blox.connection.retry')}</FxText>
        </FxPressableOpacity>
        <FxPressableOpacity
          paddingVertical="8"
          paddingHorizontal="8"
          minHeight={40}
          className={rowClass}
          onPress={() => onSelected?.('CONNECT-TO-WIFI')}
          testID="connection-option-wifi"
        >
          <FxText variant="bodyMediumRegular">{t('main.blox.connection.connectToWifi')}</FxText>
        </FxPressableOpacity>

        {currentBloxPeerId && (
          <FxPressableOpacity
            paddingVertical="8"
            paddingHorizontal="8"
            minHeight={40}
            className={rowClass}
            onPress={() => void handlePingBlox()}
            disabled={bloxPing.status === 'pinging'}
            testID="connection-option-ping-blox"
          >
            <FxBox flexDirection="row" justifyContent="space-between" alignItems="center" gap="8">
              <FxText variant="bodyMediumRegular">{t('main.blox.connection.pingBlox')}</FxText>
              <PingStatusText {...bloxPing} testID="ping-blox-status" />
            </FxBox>
          </FxPressableOpacity>
        )}

        {currentBloxPeerId && (
          <FxPressableOpacity
            paddingVertical="8"
            paddingHorizontal="8"
            minHeight={40}
            className={rowClass}
            onPress={() => void handlePingCluster()}
            disabled={clusterPing.status === 'pinging'}
            testID="connection-option-ping-cluster"
          >
            <FxBox flexDirection="row" justifyContent="space-between" alignItems="center" gap="8">
              <FxText variant="bodyMediumRegular">{t('main.blox.connection.pingCluster')}</FxText>
              <PingStatusText {...clusterPing} testID="ping-cluster-status" />
            </FxBox>
          </FxPressableOpacity>
        )}
      </FxBox>
    </FxSheet>
  );
}

export default ConnectionOptionsSheet;

/**
 * Port of apps/box/src/components/ConnectionOptionsSheet.tsx — Retry, Connect blox to Wi-Fi, and the two
 * pools.fx.land pings (`/ping` for the kubo peer id, `/ping-cluster` for the cluster) with inline status.
 * axios → fetch. There is no reachability pre-check — CORP makes one impossible against this host; see `ping`.
 */
import { useCallback, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxPressableOpacity, FxSheet, FxSpinner, FxText, type ColorToken, type FxSheetMethods } from '@functionland/fx-ui';
import { useBloxsStore } from '@/stores/useBloxsStore';
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

/**
 * There is no reachability pre-check any more.
 *
 * It was a `no-cors` GET of the pools root, on the theory that an opaque response proves the host answered.
 * Against this host that can never succeed: pools.fx.land sends `Cross-Origin-Resource-Policy: same-origin`
 * (helmet's default), and CORP is precisely the rule that forbids opaque cross-origin reads — the browser
 * blocks the response as ERR_BLOCKED_BY_RESPONSE.NotSameOrigin whatever the status is, and `/health` (200) is
 * refused just as firmly as `/` (401). So the probe answered "cannot reach pools" every time, about a host
 * that was up, and the real ping never ran.
 *
 * The POST speaks for itself: it either answers or `fetch` rejects. Asking first added a failure mode and no
 * information.
 */
async function ping(url: string, peerId: string): Promise<PingResult> {
  try {
    const { ok, data } = await postJson(url, { peerId }, PING_TIMEOUT_MS);
    const d = (data ?? {}) as { status?: string; msg?: string; success?: boolean; latency?: number };
    if (d.status === 'err') {
      return d.msg
        ? { status: 'error', message: d.msg }
        : { status: 'error', message: 'main.blox.connection.rateLimited', messageIsKey: true };
    }
    if (d.success === true) return { status: 'connected', message: `${d.latency ?? '?'}ms` };
    // An HTTP error with nothing parseable in it says nothing about the Blox — do not report it as "the Blox
    // is unreachable", which is a claim about the device rather than about the request.
    if (!ok && data === null) {
      return { status: 'error', message: 'main.blox.connection.pingFailed', messageIsKey: true };
    }
    return { status: 'disconnected', message: 'main.blox.connection.notReachable', messageIsKey: true };
  } catch (err) {
    // `fetch` rejects with TypeError both for a network failure and for a cross-origin request the browser
    // refused; it deliberately does not say which. Either way the pool service was not reached, and the raw
    // "Failed to fetch" tells the user nothing.
    if (err instanceof TypeError) {
      return { status: 'error', message: 'main.blox.connection.cannotReachPools', messageIsKey: true };
    }
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

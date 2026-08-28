/**
 * Help card for a failed hotspot / LAN call, keyed by `LanHttpError.kind` (plan §WS3 lanHttp contract):
 * `lna-denied` → Chrome blocked local network access (copyable chrome://settings/content/localNetworkAccess),
 * `cors` → old firmware (use Bluetooth), `timeout` / `unreachable` → join the FxBlox hotspot.
 *
 * It also carries the local-network-access ACTION. A browser reaching a device on the LAN needs that
 * permission, and nothing in the page can grant it: the only way to raise Chrome's prompt is to make a
 * request asserting `targetAddressSpace` while handling a user gesture. Without a button the user is simply
 * told the Blox "did not answer" with no way to act — and Chrome does not reliably prompt on its own
 * (measured on Chrome 151: a gesture-driven request from both http://localhost and https://docs.fx.land left
 * the permission at 'prompt' and never showed a dialog). So whenever the permission is not granted, the card
 * offers the button AND the site-settings path, because the button may legitimately do nothing.
 *
 * Deliberately NOT a separate error kind: "unreachable" and "blocked by the browser" are indistinguishable
 * from a failed fetch, so calling a powered-off Blox a permission problem would be a lie. The action is
 * offered alongside the real diagnosis instead.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxCopyButton, FxText, FxWarningIcon } from '@functionland/fx-ui';
import type { LanHttpErrorKind, LnaPermissionState } from '@/platform/lanHttp';
import { lnaPermissionState, requestLocalNetworkAccess } from '@/platform/lanHttp';
import { CHROME_LNA_SETTINGS_URL } from '@/platform/linking';

export type LanFailureKind = Exclude<LanHttpErrorKind, 'http' | 'aborted'>;

const KEYS: Record<LanFailureKind, { title: string; body: string }> = {
  'lna-denied': {
    title: 'setup.connectToBlox.error.lnaDeniedTitle',
    body: 'setup.connectToBlox.error.lnaDeniedBody',
  },
  cors: {
    title: 'setup.connectToBlox.error.corsTitle',
    body: 'setup.connectToBlox.error.corsBody',
  },
  timeout: {
    title: 'setup.connectToBlox.error.timeoutTitle',
    body: 'setup.connectToBlox.error.timeoutBody',
  },
  unreachable: {
    title: 'setup.connectToBlox.error.unreachableTitle',
    body: 'setup.connectToBlox.error.unreachableBody',
  },
};

/** Kinds where the browser's permission is a plausible cause worth offering an action for. */
const LNA_RELEVANT: ReadonlySet<LanFailureKind> = new Set(['lna-denied', 'timeout', 'unreachable']);

export interface LanErrorCardProps {
  kind: LanFailureKind;
  /** The URL to probe when asking for access — normally the Blox API base. */
  probeUrl?: string;
  /** Retry the real request once access has been granted. */
  onGranted?: () => void;
}

export function LanErrorCard({ kind, probeUrl, onGranted }: LanErrorCardProps) {
  const { t } = useTranslation();
  const keys = KEYS[kind];
  const [permission, setPermission] = useState<LnaPermissionState | null>(null);
  const [asking, setAsking] = useState(false);
  const [askedAndStillBlocked, setAskedAndStillBlocked] = useState(false);

  useEffect(() => {
    let alive = true;
    void lnaPermissionState().then((s) => {
      if (alive) setPermission(s);
    });
    return () => {
      alive = false;
    };
  }, [kind]);

  const askForAccess = useCallback(() => {
    if (!probeUrl) return;
    setAsking(true);
    setAskedAndStillBlocked(false);
    // NOT awaited before the request: the gesture must still be live when the fetch is issued.
    void requestLocalNetworkAccess(probeUrl)
      .then((state) => {
        setPermission(state);
        if (state === 'granted') onGranted?.();
        else setAskedAndStillBlocked(true);
      })
      .finally(() => setAsking(false));
  }, [probeUrl, onGranted]);

  // 'unsupported' means this browser has no such gate, so there is nothing to ask for.
  const showAccessAction =
    LNA_RELEVANT.has(kind) && permission !== null && permission !== 'granted' && permission !== 'unsupported';
  const showSettingsPath = kind === 'lna-denied' || permission === 'denied' || askedAndStillBlocked;

  return (
    <FxBox
      role="alert"
      testID={`lan-error-${kind}`}
      borderWidth={1}
      borderColor="warningBase"
      borderRadius="m"
      backgroundColor="backgroundPrimary"
      padding="16"
      gap="8"
    >
      <FxBox flexDirection="row" alignItems="center" gap="8">
        <FxWarningIcon color="warningBase" width={22} height={22} />
        <FxText variant="bodySmallSemibold" color="content1">
          {t(keys.title)}
        </FxText>
      </FxBox>
      <FxText variant="bodySmallRegular" color="content2">
        {t(keys.body)}
      </FxText>

      {showAccessAction && (
        <FxBox gap="8" testID="lna-access-action">
          <FxText variant="bodyXSRegular" color="content3">
            {t('setup.connectToBlox.error.lnaActionHint')}
          </FxText>
          {probeUrl && (
            <FxButton size="small" loading={asking} onPress={askForAccess} testID="lna-allow">
              {t('setup.connectToBlox.error.lnaAllowButton')}
            </FxButton>
          )}
          {askedAndStillBlocked && (
            <FxText variant="bodyXSRegular" color="warningBase" testID="lna-no-prompt">
              {t('setup.connectToBlox.error.lnaNoPrompt')}
            </FxText>
          )}
        </FxBox>
      )}

      {showSettingsPath && (
        <FxBox gap="4">
          <FxText variant="bodyXSRegular" color="content3">
            {t('setup.connectToBlox.error.openSettings')}
          </FxText>
          <FxBox flexDirection="row" alignItems="center" gap="8">
            <FxText
              as="code"
              variant="bodyXSRegular"
              color="content1"
              className="break-all font-mono"
            >
              {CHROME_LNA_SETTINGS_URL}
            </FxText>
            <FxCopyButton
              value={CHROME_LNA_SETTINGS_URL}
              label={t('setup.common.copy')}
              copiedLabel={t('setup.common.copied')}
            />
          </FxBox>
        </FxBox>
      )}
    </FxBox>
  );
}

export default LanErrorCard;

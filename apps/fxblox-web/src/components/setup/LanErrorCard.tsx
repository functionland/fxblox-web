/**
 * Help card for a failed hotspot / LAN call, keyed by `LanHttpError.kind` (plan §WS3 lanHttp contract):
 * `lna-denied` → Chrome blocked local network access (copyable chrome://settings/content/localNetworkAccess),
 * `cors` → old firmware (use Bluetooth), `timeout` / `unreachable` → join the FxBlox hotspot.
 */
import { useTranslation } from 'react-i18next';
import { FxBox, FxCopyButton, FxText, FxWarningIcon } from '@functionland/fx-ui';
import type { LanHttpErrorKind } from '@/platform/lanHttp';
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

export interface LanErrorCardProps {
  kind: LanFailureKind;
}

export function LanErrorCard({ kind }: LanErrorCardProps) {
  const { t } = useTranslation();
  const keys = KEYS[kind];
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
      {kind === 'lna-denied' && (
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

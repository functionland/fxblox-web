// Port of apps/box/src/components/CurrentBloxIndicator.tsx — CircleFilledIcon → FxStatusDot, same strings.
import { FxBox, FxStatusDot, FxText, type ColorToken, type FxStatus } from '@functionland/fx-ui';
import { useTranslation } from 'react-i18next';
import { useBloxsStore } from '@/stores';
import type { TBloxConectionStatus } from '@/models/blox';

export interface CurrentBloxIndicatorProps {
  showConnectionStatus?: boolean;
  compact?: boolean;
  className?: string;
}

const DOT_STATUS: Record<TBloxConectionStatus, FxStatus> = {
  CONNECTED: 'connected',
  CHECKING: 'checking',
  SWITCHING: 'checking',
  DISCONNECTED: 'disconnected',
  'NO INTERNET': 'disconnected',
  'NO CLIENT': 'disconnected',
};

const STATUS_COLOR: Record<FxStatus, ColorToken> = {
  connected: 'successBase',
  checking: 'warningBase',
  disconnected: 'errorBase',
  warning: 'warningBase',
  unknown: 'errorBase',
  idle: 'errorBase',
};

const STATUS_KEY: Record<TBloxConectionStatus, string> = {
  CONNECTED: 'currentBloxIndicator.connected',
  CHECKING: 'currentBloxIndicator.checking',
  SWITCHING: 'currentBloxIndicator.switching',
  DISCONNECTED: 'currentBloxIndicator.disconnected',
  'NO INTERNET': 'currentBloxIndicator.disconnected',
  'NO CLIENT': 'currentBloxIndicator.disconnected',
};

export const truncatePeerId = (peerId: string, maxLength = 16): string => {
  if (peerId.length <= maxLength) return peerId;
  return `${peerId.substring(0, 8)}...${peerId.substring(peerId.length - 8)}`;
};

export function CurrentBloxIndicator({
  showConnectionStatus = true,
  compact = false,
  className,
}: CurrentBloxIndicatorProps) {
  const { t } = useTranslation();
  const bloxs = useBloxsStore((state) => state.bloxs);
  const currentBloxPeerId = useBloxsStore((state) => state.currentBloxPeerId);
  const bloxsConnectionStatus = useBloxsStore((state) => state.bloxsConnectionStatus);

  const currentBlox = currentBloxPeerId ? bloxs[currentBloxPeerId] : undefined;
  const connectionStatus = currentBloxPeerId ? bloxsConnectionStatus[currentBloxPeerId] : undefined;
  const dotStatus: FxStatus = connectionStatus ? DOT_STATUS[connectionStatus] : 'disconnected';
  const statusText = t(
    connectionStatus ? STATUS_KEY[connectionStatus] : 'currentBloxIndicator.disconnected',
  );

  if (!currentBlox || !currentBloxPeerId) {
    return (
      <FxBox
        backgroundColor="backgroundSecondary"
        paddingHorizontal={compact ? '12' : '16'}
        paddingVertical={compact ? '8' : '12'}
        borderRadius="s"
        className={className}
        testID="current-blox-indicator"
      >
        <FxText variant="bodySmallRegular" color="content2" textAlign="center">
          {t('currentBloxIndicator.noBloxSelected')}
        </FxText>
      </FxBox>
    );
  }

  return (
    <FxBox
      backgroundColor="backgroundSecondary"
      paddingHorizontal={compact ? '12' : '16'}
      paddingVertical={compact ? '8' : '12'}
      borderRadius="s"
      minWidth={0}
      className={className}
      testID="current-blox-indicator"
    >
      <FxBox flexDirection="row" alignItems="center" justifyContent="space-between" minWidth={0}>
        <FxBox flex={1} minWidth={0}>
          <FxBox flexDirection="row" alignItems="center" minWidth={0}>
            <FxText
              variant={compact ? 'bodySmallRegular' : 'bodyLargeRegular'}
              color="content1"
              numberOfLines={1}
            >
              {currentBlox.name}
            </FxText>
            {showConnectionStatus && (
              <FxBox flexDirection="row" alignItems="center" marginLeft="8" flexShrink={0}>
                <FxStatusDot status={dotStatus} label={null} />
                <FxText variant="bodyXSRegular" color={STATUS_COLOR[dotStatus]} marginLeft="4">
                  {statusText}
                </FxText>
              </FxBox>
            )}
          </FxBox>
          <FxText
            variant="bodyXSRegular"
            color="content3"
            marginTop="4"
            numberOfLines={1}
            className="font-mono"
          >
            {truncatePeerId(currentBloxPeerId, compact ? 12 : 20)}
          </FxText>
        </FxBox>
      </FxBox>
    </FxBox>
  );
}

export default CurrentBloxIndicator;

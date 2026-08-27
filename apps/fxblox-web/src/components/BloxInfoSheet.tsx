/**
 * Port of apps/box/src/components/BloxInfoBottomSheet.tsx — FxSheet with copy rows (Blox PeerId, Pool PeerId,
 * fula image; the mobile `Share.share` became a share icon next to the copy button), reset-to-hotspot / reboot /
 * clear-cache / remove actions (the confirms live in the Blox screen).
 */
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxSheet, FxText, type FxSheetMethods } from '@functionland/fx-ui';
import type { TBlox } from '@/models/blox';
import { useBloxsStore } from '@/stores/useBloxsStore';
import { share } from '@/platform/share';
import { CopyRow } from '@/components/main/CopyRow';

export interface BloxInfoSheetProps {
  bloxInfo?: TBlox;
  onBloxRemovePress?: (peerId: string) => void;
  onResetToHotspotPress?: (peerId: string) => void;
  onRebootBloxPress?: (peerId: string) => void;
  onClearCachePress?: () => void;
  resetingBloxHotspot?: boolean;
  rebootingBlox?: boolean;
  clearingCache?: boolean;
  ref?: Ref<FxSheetMethods>;
}

export function BloxInfoSheet({
  bloxInfo,
  onBloxRemovePress,
  onResetToHotspotPress,
  onRebootBloxPress,
  onClearCachePress,
  resetingBloxHotspot,
  rebootingBlox,
  clearingCache,
  ref,
}: BloxInfoSheetProps) {
  const { t } = useTranslation();
  const bloxsPropertyInfo = useBloxsStore((state) => state.bloxsPropertyInfo);
  const bloxPropertyInfo = bloxInfo ? bloxsPropertyInfo?.[bloxInfo.peerId] : undefined;
  const peerId = bloxInfo?.peerId ?? '';
  const clusterPeerId =
    bloxInfo?.clusterPeerId && bloxInfo.clusterPeerId !== bloxInfo.peerId ? bloxInfo.clusterPeerId : undefined;
  const fulaImage = bloxPropertyInfo?.containerInfo_fula?.image || t('main.blox.info.notAvailable');

  return (
    <FxSheet ref={ref} title={bloxInfo?.name} testID="blox-info-sheet">
      <FxBox paddingVertical="8">
        {peerId ? (
          <CopyRow
            label={t('main.blox.info.peerId')}
            value={peerId}
            onShare={() => void share({ title: bloxInfo?.name, text: peerId })}
            testID="blox-info-peer-id"
          />
        ) : null}
        {clusterPeerId ? (
          <CopyRow
            label={t('main.blox.info.poolPeerId')}
            value={clusterPeerId}
            onShare={() => void share({ title: t('main.blox.info.poolPeerId'), text: clusterPeerId })}
            testID="blox-info-cluster-peer-id"
          />
        ) : null}
        <CopyRow
          label={t('main.blox.info.fulaImage')}
          value={fulaImage}
          truncate="none"
          onShare={() => void share({ title: t('main.blox.info.fulaImageShareTitle'), text: fulaImage })}
          testID="blox-info-fula-image"
        />

        <FxButton
          size="large"
          variant="inverted"
          marginTop="32"
          loading={resetingBloxHotspot}
          onPress={() => peerId && onResetToHotspotPress?.(peerId)}
          testID="blox-info-reset-hotspot"
        >
          {t('main.blox.info.resetHotspot')}
        </FxButton>
        <FxButton
          size="large"
          variant="inverted"
          marginTop="16"
          loading={rebootingBlox}
          onPress={() => peerId && onRebootBloxPress?.(peerId)}
          testID="blox-info-reboot"
        >
          {t('main.blox.info.reboot')}
        </FxButton>
        {onClearCachePress && (
          <FxButton
            size="large"
            variant="inverted"
            marginTop="16"
            loading={clearingCache}
            onPress={onClearCachePress}
            testID="blox-info-clear-cache"
          >
            {t('main.blox.info.clearCache')}
          </FxButton>
        )}
        <FxButton
          variant="destructive"
          marginVertical="16"
          onPress={() => peerId && onBloxRemovePress?.(peerId)}
          testID="blox-info-remove"
        >
          {t('main.blox.info.remove')}
        </FxButton>
        {!peerId && (
          <FxText variant="bodySmallRegular" color="content3" textAlign="center">
            {t('main.blox.hero.unknownBlox')}
          </FxText>
        )}
      </FxBox>
    </FxSheet>
  );
}

export default BloxInfoSheet;

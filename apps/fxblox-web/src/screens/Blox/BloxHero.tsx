/**
 * Port of apps/box/src/screens/Blox/components/BloxInteractionImproved.tsx — the hero: FxTower (its cap follows
 * the connection colour) → BloxInfo sheet, name (+ grid icon → /blox/manage when several Bloxs), status row →
 * ConnectionOptions sheet. On desktop the "Showing …" mode chip lives here (the phone header has it).
 */
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxChevronDownIcon,
  FxGridIcon,
  FxIconButton,
  FxPressableOpacity,
  FxStatusDot,
  FxText,
  FxTower,
  cn,
} from '@functionland/fx-ui';
import { useBloxsStore } from '@/stores/useBloxsStore';
import type { TBloxInteraction } from '@/models';
import { isBusyStatus, statusLabelKey, statusToColor, statusToDot } from '@/components/main/bloxStatus';

export interface BloxHeroProps {
  bloxs: TBloxInteraction[];
  /** Label of the selected interaction mode (desktop chip). */
  modeTitle?: string;
  onChangeMode?: () => void;
  onConnectionPress?: () => void;
  onBloxPress?: (peerId: string) => void;
  onManagePress?: () => void;
  className?: string;
}

const TOWER_COLOR = {
  connected: 'successBase',
  checking: 'warningBase',
  disconnected: 'errorBase',
} as const;

export function BloxHero({
  bloxs,
  modeTitle,
  onChangeMode,
  onConnectionPress,
  onBloxPress,
  onManagePress,
  className,
}: BloxHeroProps) {
  const { t } = useTranslation();
  const bloxsConnectionStatus = useBloxsStore((state) => state.bloxsConnectionStatus);
  const currentBloxPeerId = useBloxsStore((state) => state.currentBloxPeerId);

  const currentBlox = bloxs.find((blox) => blox.peerId === currentBloxPeerId);
  const status = currentBloxPeerId ? bloxsConnectionStatus[currentBloxPeerId] : undefined;
  const dot = statusToDot(status);
  const color = statusToColor(status);
  const name = currentBlox?.title || t('main.blox.hero.unknownBlox');
  const busy = isBusyStatus(status);

  return (
    <FxBox
      position="relative"
      alignItems="center"
      justifyContent="center"
      paddingVertical="16"
      className={cn('min-h-[200px]', className)}
      testID="blox-hero"
      data-status={status ?? 'unknown'}
    >
      {modeTitle && onChangeMode && (
        <FxPressableOpacity
          onPress={onChangeMode}
          flexDirection="row"
          alignItems="center"
          gap="4"
          paddingHorizontal="12"
          minHeight={40}
          borderRadius="l"
          backgroundColor="backgroundSecondary"
          className="absolute right-0 top-0 hidden desktop:flex"
          testID="blox-hero-mode"
        >
          <FxText variant="bodyXSRegular" color="content2">
            {t('main.blox.hero.showing')}: {modeTitle}
          </FxText>
          <FxChevronDownIcon width={16} height={16} color="content2" />
        </FxPressableOpacity>
      )}

      {/* Tower — separate touch target (opens the Blox info sheet). */}
      <FxPressableOpacity
        onPress={() => currentBloxPeerId && onBloxPress?.(currentBloxPeerId)}
        aria-label={t('main.blox.hero.openInfo', { name })}
        alignItems="center"
        paddingVertical="8"
        paddingHorizontal="16"
        borderRadius="m"
        className="fx-hover-opacity"
        testID="blox-hero-tower"
      >
        <FxTower
          width={56}
          height={96}
          capHeight={14}
          onColor={TOWER_COLOR[dot === 'connected' ? 'connected' : dot === 'checking' ? 'checking' : 'disconnected']}
          offColor={busy ? 'backgroundSecondary' : TOWER_COLOR[dot === 'connected' ? 'connected' : 'disconnected']}
          onInterval={busy ? 700 : 1}
          offInterval={busy ? 700 : 0}
          bodyColor="backgroundSecondary"
          label={t('main.blox.hero.towerLabel')}
        />
      </FxPressableOpacity>

      {/* Name (+ manage when several Bloxs). */}
      <FxBox flexDirection="row" alignItems="center" marginTop="16" gap="4" minWidth={0}>
        <FxText as="h1" variant="bodyLargeRegular" numberOfLines={1} testID="blox-hero-name">
          {name}
        </FxText>
        {bloxs.length > 1 && onManagePress && (
          <FxIconButton
            aria-label={t('main.blox.hero.manageBloxs')}
            icon={<FxGridIcon width={16} height={16} />}
            size={32}
            iconSize={16}
            onPress={onManagePress}
            testID="blox-hero-manage"
          />
        )}
      </FxBox>

      {/* Connection status → ConnectionOptions sheet. */}
      <FxPressableOpacity
        flexDirection="row"
        alignItems="center"
        gap="4"
        marginTop="12"
        paddingVertical="8"
        paddingHorizontal="12"
        minHeight={40}
        borderRadius="m"
        onPress={onConnectionPress}
        aria-label={t('main.blox.hero.connectionOptions')}
        className="fx-hover-opacity"
        testID="blox-hero-status"
      >
        <FxStatusDot status={dot} label={null} />
        <FxText color={color} variant="bodySmallRegular" testID="blox-hero-status-label">
          {t(statusLabelKey(status))}
        </FxText>
        <FxChevronDownIcon width={16} height={16} color="content1" />
      </FxPressableOpacity>
    </FxBox>
  );
}

export default BloxHero;

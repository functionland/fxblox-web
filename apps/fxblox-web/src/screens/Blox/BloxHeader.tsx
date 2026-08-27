/**
 * Port of apps/box/src/screens/Blox/components/BloxHeader.tsx into the AppShell phone header slot: the mode
 * selector ("Showing: Blox Unit #1") on the left, the shell's three actions (add Blox / manage / profile) on the
 * right. Desktop keeps the TopBar (the slot is hidden ≥ 900px).
 */
import { useTranslation } from 'react-i18next';
import { FxChevronDownIcon, FxPressableOpacity, FxText } from '@functionland/fx-ui';
import { AppShellHeader, useAppShell } from '@/app/shells/AppShell';
import { ShellActions } from '@/app/shells/ShellActions';

export interface BloxHeaderProps {
  modeTitle: string;
  onChangeMode: () => void;
}

export function BloxHeader({ modeTitle, onChangeMode }: BloxHeaderProps) {
  const { t } = useTranslation();
  const { openProfile } = useAppShell();
  return (
    <AppShellHeader>
      <header data-testid="blox-header" className="flex items-center justify-between gap-3 px-5 py-3">
        <FxPressableOpacity
          onPress={onChangeMode}
          flexDirection="row"
          alignItems="center"
          gap="4"
          minHeight={40}
          minWidth={0}
          borderRadius="s"
          className="fx-hover-opacity min-w-0 flex-1 text-left"
          testID="blox-header-mode"
        >
          <FxText variant="bodySmallRegular" color="content2" numberOfLines={1}>
            {t('main.blox.hero.showing')}: {modeTitle}
          </FxText>
          <FxChevronDownIcon width={16} height={16} color="content2" />
        </FxPressableOpacity>
        <ShellActions onOpenProfile={openProfile} />
      </header>
    </AppShellHeader>
  );
}

export default BloxHeader;

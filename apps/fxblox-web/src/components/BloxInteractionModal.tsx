// Port of apps/box/src/screens/Blox/modals/BloxInteractionModal.tsx (+ api/blox.ts `bloxInteractions`).
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxInvertedCheckIcon, FxPressableOpacity, FxSheet, FxText, type FxSheetMethods } from '@functionland/fx-ui';
import { EBloxInteractionType } from '@/models';

export interface BloxInteractionOption {
  mode: EBloxInteractionType;
  /** i18n key of the label. */
  titleKey: string;
}

/** api/blox.ts — only the office unit is active on mobile (HomeBloxSetup is commented out). */
export const BLOX_INTERACTIONS: BloxInteractionOption[] = [
  { mode: EBloxInteractionType.OfficeBloxUnit, titleKey: 'main.blox.interaction.unit' },
];

export interface BloxInteractionModalProps {
  selectedMode: EBloxInteractionType;
  onSelectMode: (mode: EBloxInteractionType) => void;
  ref?: Ref<FxSheetMethods>;
}

export function BloxInteractionModal({ selectedMode, onSelectMode, ref }: BloxInteractionModalProps) {
  const { t } = useTranslation();
  return (
    <FxSheet ref={ref} title={t('main.blox.interaction.title')} testID="blox-interaction-modal">
      <FxBox as="ul" role="listbox" aria-label={t('main.blox.interaction.title')} className="m-0 list-none p-0">
        {BLOX_INTERACTIONS.map((interaction) => {
          const selected = interaction.mode === selectedMode;
          return (
            <li key={interaction.mode} role="option" aria-selected={selected}>
              <FxPressableOpacity
                height={48}
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
                borderBottomWidth={1}
                borderBottomColor="backgroundSecondary"
                paddingRight="4"
                className="w-full text-left"
                onPress={() => onSelectMode(interaction.mode)}
                testID={`blox-interaction-${interaction.mode}`}
              >
                <FxText variant="bodySmallRegular">{t(interaction.titleKey)}</FxText>
                {selected ? <FxInvertedCheckIcon width={20} height={20} color="primary" /> : null}
              </FxPressableOpacity>
            </li>
          );
        })}
      </FxBox>
    </FxSheet>
  );
}

export default BloxInteractionModal;

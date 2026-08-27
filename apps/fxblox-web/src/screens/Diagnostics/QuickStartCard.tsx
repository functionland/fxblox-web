/**
 * Port of apps/box/src/screens/Diagnostics/QuickStartCard.tsx — three pre-canned scenario tiles (side by side on
 * desktop) + the freeform disclosure behind `CUSTOM_QUESTION_ENABLED`. The prefilled scenario is highlighted; the
 * user still taps it to start (no auto-start).
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxCard, FxPressableOpacity, FxText, FxTextInput, cn } from '@functionland/fx-ui';
import {
  CUSTOM_QUESTION_ENABLED,
  QUICK_START_SCENARIO_LIST,
  type ScenarioId,
} from '@/features/diagnostics/quickStartPrompts';

export interface QuickStartCardProps {
  onSelectScenario: (id: ScenarioId) => void;
  onSubmitFreeform: (prompt: string) => void;
  disabled?: boolean;
  prefilledScenario?: ScenarioId | null;
}

export function QuickStartCard({
  onSelectScenario,
  onSubmitFreeform,
  disabled = false,
  prefilledScenario = null,
}: QuickStartCardProps) {
  const { t } = useTranslation();
  const [showFreeform, setShowFreeform] = useState(false);
  const [freeform, setFreeform] = useState('');

  const handleFreeformSubmit = useCallback(() => {
    const trimmed = freeform.trim();
    if (!trimmed) return;
    onSubmitFreeform(trimmed);
    setFreeform('');
  }, [freeform, onSubmitFreeform]);

  return (
    <FxCard testID="quickstart-card">
      <FxCard.Title>{t('diagnostics.quickStart.title')}</FxCard.Title>
      <FxBox paddingVertical="8" gap="12">
        <FxText variant="bodySmallRegular">{t('diagnostics.quickStart.subtitle')}</FxText>

        <div className="grid grid-cols-1 gap-3 desktop:grid-cols-3" data-testid="quickstart-scenarios">
          {QUICK_START_SCENARIO_LIST.map((scenario) => {
            const isPrefilled = scenario.id === prefilledScenario;
            return (
              <FxPressableOpacity
                key={scenario.id}
                onPress={() => onSelectScenario(scenario.id)}
                disabled={disabled}
                borderRadius="m"
                borderWidth={2}
                borderColor={isPrefilled ? 'primary' : 'border'}
                backgroundColor={isPrefilled ? 'greenBackground' : 'backgroundSecondary'}
                padding="12"
                alignItems="flex-start"
                gap="4"
                className={cn('w-full text-left fx-hover-opacity', disabled && 'opacity-60')}
                aria-pressed={isPrefilled}
                data-prefilled={isPrefilled}
                testID={`quickstart-${scenario.id}`}
              >
                <FxText variant="bodySmallSemibold" color="content1">
                  {t(scenario.labelKey)}
                </FxText>
                <FxText variant="bodyXSRegular" color="content2">
                  {t(scenario.subtitleKey)}
                </FxText>
              </FxPressableOpacity>
            );
          })}
        </div>

        {CUSTOM_QUESTION_ENABLED &&
          (showFreeform ? (
            <FxBox gap="8">
              <FxTextInput
                multiline
                numberOfLines={3}
                value={freeform}
                onChangeText={setFreeform}
                placeholder={t('diagnostics.chat.promptPlaceholder')}
                editable={!disabled}
                testID="quickstart-freeform-input"
              />
              <FxButton
                onPress={handleFreeformSubmit}
                disabled={disabled || !freeform.trim()}
                testID="quickstart-freeform-submit"
              >
                {t('diagnostics.quickStart.startButton')}
              </FxButton>
            </FxBox>
          ) : (
            <FxButton
              variant="inverted"
              onPress={() => setShowFreeform(true)}
              disabled={disabled}
              testID="quickstart-freeform-disclose"
            >
              {t('diagnostics.quickStart.freeformDisclosure')}
            </FxButton>
          ))}
      </FxBox>
    </FxCard>
  );
}

export default QuickStartCard;

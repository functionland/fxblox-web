/**
 * The Blox boot LED sequence shown on ConnectToBlox (mobile: five FlashingCircles joined by ">" plus the
 * "wait for light-blue" caption) — `FxLedSequence` in row direction.
 */
import { useTranslation } from 'react-i18next';
import { FxBox, FxLedSequence, FxText } from '@functionland/fx-ui';

export function LedGuide() {
  const { t } = useTranslation();
  return (
    <FxBox alignItems="center" gap="8" testID="led-guide">
      <FxText variant="bodySmallRegular" color="content2" textAlign="center">
        {t('connectToBlox.formatInstructions')}
      </FxText>
      <FxLedSequence
        direction="row"
        justifyContent="center"
        steps={[
          { color: 'lightgreen', offInterval: 0 },
          { color: 'red', offInterval: 0 },
          { color: 'black', offInterval: 0 },
          { color: 'green', offInterval: 0 },
          { color: 'lightblue', onInterval: 3000, offInterval: 700 },
        ]}
      />
      <FxText variant="bodySmallRegular" color="warningBase" textAlign="center">
        {t('connectToBlox.waitForBlueLight')}
      </FxText>
    </FxBox>
  );
}

export default LedGuide;

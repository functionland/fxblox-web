/**
 * Port of apps/box/src/screens/Settings/BloxStatusMonitor.screen.tsx. The three interval radios drive
 * `services/bloxStatusMonitor` through `useSettingsStore.bloxStatusCheckInterval` (the monitor subscribes to
 * the store at boot). Web copy: the sweep only runs while this tab is open — there is no background task —
 * so the screen also shows the last run and a "Check now" button.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxRadioButton,
  FxRadioButtonWithLabel,
  FxText,
} from '@functionland/fx-ui';
import { SettingsScreen } from '@/components/settings/SettingsScreen';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { bloxStatusMonitor, type BloxStatusMonitorState } from '@/services/bloxStatusMonitor';

export const INTERVAL_OPTIONS = ['0', '480', '1440'] as const;

export default function BloxStatusMonitor() {
  const { t, i18n } = useTranslation();
  const bloxStatusCheckInterval = useSettingsStore((state) => state.bloxStatusCheckInterval);
  const setBloxStatusCheckInterval = useSettingsStore((state) => state.setBloxStatusCheckInterval);
  const [monitor, setMonitor] = useState<BloxStatusMonitorState>(() =>
    bloxStatusMonitor.getState(),
  );

  useEffect(() => bloxStatusMonitor.subscribe(setMonitor), []);

  const lastRun =
    monitor.lastRunAt !== null
      ? t('settings.bloxStatusMonitor.lastRun', {
          time: new Date(monitor.lastRunAt).toLocaleString(i18n.language),
        })
      : t('settings.bloxStatusMonitor.neverRun');

  return (
    <SettingsScreen title={t('settings.bloxStatusMonitor.title')} screen="blox-status-monitor">
      <FxText as="h2" variant="bodySmallRegular" marginBottom="8" id="blox-status-interval-label">
        {t('settings.bloxStatusMonitor.checkInterval')}
      </FxText>
      <FxText variant="bodyXSRegular" color="content3" marginBottom="16">
        {t('settings.bloxStatusMonitor.description')}
      </FxText>
      <FxRadioButton.Group
        value={String(bloxStatusCheckInterval)}
        onValueChange={(val: string | number) => setBloxStatusCheckInterval(Number(val))}
        aria-labelledby="blox-status-interval-label"
        testID="blox-status-interval"
      >
        {INTERVAL_OPTIONS.map((opt) => (
          <FxBox key={opt} marginBottom="8">
            <FxRadioButtonWithLabel
              value={opt}
              label={t(`settings.bloxStatusMonitor.options.${opt}`)}
            />
          </FxBox>
        ))}
      </FxRadioButton.Group>
      <FxText variant="bodyXSRegular" color="content3" marginTop="16">
        {t('settings.bloxStatusMonitor.webNote')}
      </FxText>
      <FxBox flexDirection="row" alignItems="center" gap="12" marginTop="24" flexWrap="wrap">
        <FxButton
          variant="inverted"
          onPress={() => void bloxStatusMonitor.runNow()}
          loading={monitor.running}
          testID="blox-status-run-now"
        >
          {monitor.running
            ? t('settings.bloxStatusMonitor.running')
            : t('settings.bloxStatusMonitor.runNow')}
        </FxButton>
        <FxText
          variant="bodyXSRegular"
          color="content3"
          role="status"
          testID="blox-status-last-run"
        >
          {lastRun}
        </FxText>
      </FxBox>
    </SettingsScreen>
  );
}

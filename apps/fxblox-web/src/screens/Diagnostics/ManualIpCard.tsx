/**
 * Port of apps/box/src/screens/Diagnostics/ManualIpCard.tsx — user-typed LAN IP fallback. FORMAT is a hard gate
 * (`ipIsPrivateLan`), reachability a soft probe; the parent persists / probes (no storage import here).
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxCard, FxText, FxTextInput } from '@functionland/fx-ui';
import { ipIsPrivateLan } from '@/utils/aiTransport';

type ProbeState = 'idle' | 'checking' | 'reachable' | 'unreachable';

export interface ManualIpCardProps {
  savedIp: string | null;
  onSave: (ip: string) => void | Promise<void>;
  onClear: () => void | Promise<void>;
  onProbe?: (ip: string) => Promise<boolean>;
  disabled?: boolean;
}

export function ManualIpCard({ savedIp, onSave, onClear, onProbe, disabled = false }: ManualIpCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState('');
  const [probeState, setProbeState] = useState<ProbeState>('idle');

  const trimmed = draft.trim();
  const formatValid = trimmed.length > 0 && ipIsPrivateLan(trimmed);
  const showFormatError = trimmed.length > 0 && !formatValid;
  const checking = probeState === 'checking';
  const saveDisabled = disabled || !formatValid || checking;

  const onChangeDraft = useCallback((text: string) => {
    setDraft(text);
    setProbeState('idle');
  }, []);

  const beginEdit = useCallback(() => {
    setDraft(savedIp ?? '');
    setProbeState('idle');
    setExpanded(true);
  }, [savedIp]);

  const handleSave = useCallback(async () => {
    const ip = draft.trim();
    // Backstop — never trust the disabled state alone for a security-relevant gate.
    if (!ipIsPrivateLan(ip)) return;
    await onSave(ip);
    setExpanded(false);
    if (!onProbe) {
      setProbeState('idle');
      return;
    }
    setProbeState('checking');
    try {
      const ok = await onProbe(ip);
      setProbeState(ok ? 'reachable' : 'unreachable');
    } catch {
      setProbeState('unreachable');
    }
  }, [draft, onSave, onProbe]);

  const handleClear = useCallback(async () => {
    await onClear();
    setDraft('');
    setProbeState('idle');
    setExpanded(false);
  }, [onClear]);

  const probeMessage =
    probeState === 'checking' ? (
      <FxText variant="bodyXSRegular" color="content2">
        {t('diagnostics.manualIp.checking')}
      </FxText>
    ) : probeState === 'reachable' ? (
      <FxText variant="bodyXSRegular" color="successBase" testID="manual-ip-reachable">
        {t('diagnostics.manualIp.reachable')}
      </FxText>
    ) : probeState === 'unreachable' ? (
      <FxText variant="bodyXSRegular" color="warningBase" testID="manual-ip-unreachable">
        {t('diagnostics.manualIp.unreachable')}
      </FxText>
    ) : null;

  return (
    <FxCard testID="manual-ip-card">
      <FxCard.Title>{t('diagnostics.manualIp.title')}</FxCard.Title>
      <FxBox paddingVertical="8" gap="12">
        <FxText variant="bodySmallRegular" color="content2">
          {t('diagnostics.manualIp.subtitle')}
        </FxText>

        {savedIp && !expanded ? (
          <FxBox gap="8">
            <FxText variant="bodySmallRegular" color="content1" testID="manual-ip-summary">
              {t('diagnostics.manualIp.currentlyUsing', { ip: savedIp })}
            </FxText>
            {probeMessage}
            <FxButton variant="inverted" onPress={beginEdit} disabled={disabled} testID="manual-ip-change">
              {t('diagnostics.manualIp.changeButton')}
            </FxButton>
            <FxButton variant="inverted" onPress={() => void handleClear()} disabled={disabled} testID="manual-ip-clear">
              {t('diagnostics.manualIp.clearButton')}
            </FxButton>
          </FxBox>
        ) : expanded ? (
          <FxBox gap="8">
            <FxTextInput
              value={draft}
              onChangeText={onChangeDraft}
              placeholder={t('diagnostics.manualIp.placeholder')}
              editable={!disabled}
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="decimal"
              mono
              error={showFormatError}
              errorMessage={showFormatError ? t('diagnostics.manualIp.invalid') : undefined}
              onSubmitEditing={() => void handleSave()}
              testID="manual-ip-input"
            />
            {probeMessage}
            <FxButton onPress={() => void handleSave()} disabled={saveDisabled} loading={checking} testID="manual-ip-save">
              {t('diagnostics.manualIp.saveButton')}
            </FxButton>
            {savedIp && (
              <FxButton variant="inverted" onPress={() => void handleClear()} disabled={disabled} testID="manual-ip-clear">
                {t('diagnostics.manualIp.clearButton')}
              </FxButton>
            )}
          </FxBox>
        ) : (
          <FxButton variant="inverted" onPress={beginEdit} disabled={disabled} testID="manual-ip-disclose">
            {t('diagnostics.manualIp.disclose')}
          </FxButton>
        )}
      </FxBox>
    </FxCard>
  );
}

export default ManualIpCard;

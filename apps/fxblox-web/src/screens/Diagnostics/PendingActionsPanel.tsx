// Port of apps/box/src/screens/Diagnostics/PendingActionsPanel.tsx — the "while you were away" banner.
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxCard, FxText } from '@functionland/fx-ui';
import type { RecommendedActionEvent } from '@/utils/bloxAiEvents';
import type { PendingActionsRecord } from '@/utils/parsePendingResponse';

export { parsePendingResponse } from '@/utils/parsePendingResponse';
export type { PendingActionsRecord } from '@/utils/parsePendingResponse';

export interface PendingActionsPanelProps {
  pending: PendingActionsRecord | null;
  onApprove: (action: RecommendedActionEvent) => void;
  onDismiss: () => void;
  busy?: boolean;
}

export function PendingActionsPanel({ pending, onApprove, onDismiss, busy = false }: PendingActionsPanelProps) {
  const { t } = useTranslation();
  if (!pending || pending.actions.length === 0) return null;
  const verdict = pending.verdict;
  return (
    <FxCard testID="pending-actions-panel" marginBottom="12">
      <FxText as="h2" variant="h300">
        {t('diagnostics.pending.title', { n: pending.actions.length })}
      </FxText>
      <FxText variant="bodySmallRegular" marginTop="4">
        {t('diagnostics.pending.subtitle', { count: pending.actions.length, ts: pending.ts })}
      </FxText>
      {verdict && (
        <FxText variant="bodyMediumRegular" marginTop="8">
          {t('diagnostics.pending.verdictPrefix')} {verdict.payload.summary}
        </FxText>
      )}
      <FxBox marginTop="8">
        {pending.actions.map((a) => (
          <FxBox key={a.action_id} paddingVertical="8" gap="4" testID={`pending-action-${a.action_id}`}>
            <FxText variant="bodyMediumRegular">{a.action_name}</FxText>
            <FxText variant="bodySmallRegular">{a.reasoning}</FxText>
            <FxText variant="bodySmallRegular">
              {t('diagnostics.chat.confidence', { pct: Math.round(a.confidence * 100) })}
              {' • '}
              {a.tier === 2 ? t('diagnostics.chat.tier2Label') : t('diagnostics.chat.tier3Label')}
            </FxText>
            <FxButton marginTop="4" onPress={() => onApprove(a)} disabled={busy} testID={`pending-approve-${a.action_id}`}>
              {t('diagnostics.chat.approveButton')}
            </FxButton>
          </FxBox>
        ))}
      </FxBox>
      <FxButton variant="inverted" marginTop="4" onPress={onDismiss} disabled={busy} testID="pending-dismiss">
        {t('diagnostics.pending.dismiss')}
      </FxButton>
    </FxCard>
  );
}

export default PendingActionsPanel;

/**
 * Port of apps/box/src/screens/Diagnostics/ApprovalModal.tsx on FxDialog.
 *   - tier 2: single Approve button.
 *   - tier 3: 4-digit security code + press-and-hold 2 s (pointer events + a ref timer; the progress fill is a
 *     CSS width transition). Timer cleared on release / code edit / action change / unmount; `executing` guards
 *     duplicate submits (Codex Q6).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxDialog, FxText, FxTextInput, cn } from '@functionland/fx-ui';
import type { RecommendedActionEvent } from '@/utils/bloxAiEvents';

export const TIER_3_HOLD_MS = 2000;

export interface ApprovalModalProps {
  /** The recommended_action being confirmed. null = closed. */
  action: RecommendedActionEvent | null;
  onApprove: (security_code: string | null) => void;
  onCancel: () => void;
  /** True while ai/execute is in flight — disables Approve (dedup guard). */
  executing?: boolean;
}

export function ApprovalModal({ action, onApprove, onCancel, executing = false }: ApprovalModalProps) {
  const { t } = useTranslation();
  const [securityCode, setSecurityCode] = useState('');
  const [holding, setHolding] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isTier3 = action?.tier === 3;
  const codeReady = !isTier3 || securityCode.length === 4;

  const resetHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHolding(false);
  }, []);

  // Reset hold + code on every open / close / action change; clean up on unmount.
  useEffect(() => {
    resetHold();
    setSecurityCode('');
    return () => resetHold();
  }, [action, resetHold]);

  // A code edit requires a fresh hold.
  useEffect(() => {
    resetHold();
  }, [securityCode, resetHold]);

  const handlePressIn = useCallback(() => {
    if (!codeReady || executing || holdTimerRef.current) return;
    setHolding(true);
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      setHolding(false);
      if (action) onApprove(securityCode);
    }, TIER_3_HOLD_MS);
  }, [codeReady, executing, action, securityCode, onApprove]);

  const handlePressOut = useCallback(() => {
    resetHold();
  }, [resetHold]);

  const handleTier2Approve = useCallback(() => {
    if (executing) return;
    if (action) onApprove(null);
  }, [executing, action, onApprove]);

  return (
    <FxDialog
      open={!!action}
      onOpenChange={(open) => {
        if (!open && !executing) onCancel();
      }}
      title={isTier3 ? t('diagnostics.approval.tier3Title') : t('diagnostics.approval.tier2Title')}
      dismissible={!executing}
      showClose={false}
      closeLabel={t('diagnostics.approval.cancel')}
      testID="approval-modal"
      footer={
        <>
          <FxButton variant="inverted" onPress={onCancel} disabled={executing} testID="approval-cancel">
            {t('diagnostics.approval.cancel')}
          </FxButton>
          {!isTier3 && (
            <FxButton onPress={handleTier2Approve} disabled={executing} testID="approval-tier2-approve">
              {t('diagnostics.approval.tier2Approve')}
            </FxButton>
          )}
        </>
      }
    >
      {action && (
        <FxBox gap="8">
          <FxText variant="bodyMediumRegular" testID="approval-action-name">
            {action.action_name}
          </FxText>
          <FxText variant="bodySmallRegular" testID="approval-reasoning">
            {action.reasoning}
          </FxText>
          <FxText variant="bodySmallRegular">
            {t('diagnostics.approval.confidenceLabel', { pct: Math.round(action.confidence * 100) })}
          </FxText>

          {isTier3 && (
            <FxBox gap="8" marginTop="8">
              <FxText variant="bodySmallRegular">{t('diagnostics.approval.securityCodePrompt')}</FxText>
              <FxTextInput
                value={securityCode}
                onChangeText={(v) => setSecurityCode(v.replace(/\D/g, '').slice(0, 4))}
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
                autoComplete="one-time-code"
                editable={!executing}
                mono
                inputClassName="text-center text-2xl tracking-[0.5em]"
                testID="approval-security-code-input"
              />
              <FxText variant="bodySmallRegular" id="approval-hold-hint" marginTop="8">
                {t('diagnostics.approval.tier3HoldHint')}
              </FxText>
              <button
                type="button"
                data-testid="approval-tier3-hold"
                data-holding={holding}
                aria-describedby="approval-hold-hint"
                disabled={!codeReady || executing}
                onPointerDown={(e) => {
                  e.preventDefault();
                  handlePressIn();
                }}
                onPointerUp={handlePressOut}
                onPointerLeave={handlePressOut}
                onPointerCancel={handlePressOut}
                onKeyDown={(e) => {
                  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                    e.preventDefault();
                    handlePressIn();
                  }
                }}
                onKeyUp={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') handlePressOut();
                }}
                onBlur={handlePressOut}
                className={cn(
                  'fx-control-reset relative h-14 w-full touch-none select-none overflow-hidden rounded-fx-s',
                  codeReady ? 'bg-error-base text-white' : 'bg-background-app text-content3',
                  executing && 'opacity-60',
                  'disabled:cursor-not-allowed',
                )}
              >
                <span
                  aria-hidden="true"
                  data-testid="approval-hold-progress"
                  className="absolute inset-y-0 left-0 bg-white/40"
                  style={{
                    width: holding ? '100%' : '0%',
                    transition: holding ? `width ${TIER_3_HOLD_MS}ms linear` : 'none',
                  }}
                />
                <span className="relative fx-text-bodyMediumRegular">{t('diagnostics.approval.tier3HoldLabel')}</span>
              </button>
            </FxBox>
          )}
        </FxBox>
      )}
    </FxDialog>
  );
}

export default ApprovalModal;

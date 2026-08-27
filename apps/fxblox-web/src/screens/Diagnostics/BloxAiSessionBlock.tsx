/**
 * The AI session block (mobile `BloxAiSessionBlock` inside Diagnostics.screen.tsx): instantiates `useAiSession`
 * once both peer ids are known, owns the manual-IP persistence, the chat, the quick-start / manual-IP cards and
 * the modal stack (only one is open at a time per the reducer's `activeModal`).
 */
import { useCallback, useEffect, useState } from 'react';
import { FxBox } from '@functionland/fx-ui';
import { useAiSession } from '@/features/diagnostics/useAiSession';
import type { ScenarioId } from '@/features/diagnostics/quickStartPrompts';
import type { BleCommandWriter } from '@/utils/ble';
import { loadManualBloxIp, removeManualBloxIp, saveManualBloxIp } from '@/utils/manualBloxIp';
import { DEFAULT_BLOX_AI_PORT, HttpAiClient } from '@/utils/httpAiClient';
import { gatherContext as gatherPhoneContext } from '@/utils/clientLogger';
import { BloxAIChat } from './BloxAIChat';
import { QuickStartCard } from './QuickStartCard';
import { ManualIpCard } from './ManualIpCard';
import { ApprovalModal } from './ApprovalModal';
import { SharePhoneContextModal } from './SharePhoneContextModal';
import { FeedbackModal } from './FeedbackModal';
import { UploadTranscriptModal } from './UploadTranscriptModal';
import { PendingActionsPanel } from './PendingActionsPanel';

export interface BloxAiSessionBlockProps {
  appPeerId: string;
  bloxPeerId: string;
  prefillScenario: ScenarioId | null;
  bleManager: BleCommandWriter | null;
  blePeripheralId: string | null;
  /** Lets the parent render the same manual IP into the Raw Diagnostics card. */
  onManualIpChange?: (ip: string | null) => void;
  /** Fired when a session starts (the parent hides the "suggested scenario" note). */
  onSessionStarted?: () => void;
}

export function BloxAiSessionBlock({
  appPeerId,
  bloxPeerId,
  prefillScenario,
  bleManager,
  blePeripheralId,
  onManualIpChange,
  onSessionStarted,
}: BloxAiSessionBlockProps) {
  const [manualIp, setManualIpState] = useState<string | null>(null);
  const setManualIp = useCallback(
    (ip: string | null) => {
      setManualIpState(ip);
      onManualIpChange?.(ip);
    },
    [onManualIpChange],
  );

  useEffect(() => {
    let cancelled = false;
    void loadManualBloxIp(bloxPeerId).then((ip) => {
      if (!cancelled) setManualIp(ip);
    });
    return () => {
      cancelled = true;
    };
  }, [bloxPeerId, setManualIp]);

  const handleSaveManualIp = useCallback(
    async (ip: string) => {
      await saveManualBloxIp(bloxPeerId, ip);
      setManualIp(ip);
    },
    [bloxPeerId, setManualIp],
  );

  const handleClearManualIp = useCallback(async () => {
    await removeManualBloxIp(bloxPeerId);
    setManualIp(null);
  }, [bloxPeerId, setManualIp]);

  const handleProbeManualIp = useCallback(async (ip: string) => {
    try {
      const probe = await new HttpAiClient(ip, DEFAULT_BLOX_AI_PORT).health();
      return probe.ok;
    } catch {
      return false;
    }
  }, []);

  const { state, actions } = useAiSession({
    appPeerId,
    bloxPeerId,
    bleManager,
    blePeripheralId,
    manualIp,
    pluginInstalled: true,
    initialPrefilledScenario: prefillScenario,
    gatherPhoneContext,
  });

  // Consume the route param after the first render so a remount does not re-prefill.
  useEffect(() => {
    if (state.prefilledScenario !== null) actions.consumePrefill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.streaming || state.sessionId) onSessionStarted?.();
  }, [state.streaming, state.sessionId, onSessionStarted]);

  return (
    <FxBox gap="12" testID="blox-ai-session">
      {state.pending && state.pending.actions.length > 0 && (
        <PendingActionsPanel
          pending={state.pending}
          onApprove={actions.approvePending}
          onDismiss={actions.dismissPending}
          busy={state.busy}
        />
      )}

      <BloxAIChat
        transcript={state.transcript}
        streaming={state.streaming}
        sessionId={state.sessionId}
        busy={state.busy}
        onApprove={actions.openApproval}
        onSubmitReply={(id, text) => void actions.submitReply(id, text)}
        onShareContext={() => void actions.openShareContext()}
        onStartSession={(prompt) => void actions.startSession(prompt)}
        onOpenFeedback={actions.openFeedback}
        onStartNewChat={actions.clearSession}
        onRetrySamePrompt={() => void actions.retrySamePrompt()}
      />

      {!state.sessionId && !state.streaming && (
        <>
          <QuickStartCard
            onSelectScenario={(id) => void actions.startQuickStart(id)}
            onSubmitFreeform={(prompt) => void actions.startSession(prompt)}
            disabled={state.streaming}
            prefilledScenario={state.prefilledScenario ?? prefillScenario}
          />
          <ManualIpCard
            savedIp={manualIp}
            onSave={handleSaveManualIp}
            onClear={handleClearManualIp}
            onProbe={handleProbeManualIp}
            disabled={state.streaming}
          />
        </>
      )}

      <ApprovalModal
        action={state.modals.active === 'approval' ? state.modals.approvalAction : null}
        onApprove={actions.confirmApproval}
        onCancel={actions.dismissApproval}
        executing={state.busy}
      />
      <SharePhoneContextModal
        phoneContext={state.modals.active === 'shareContext' ? state.modals.shareContextPreview : null}
        onConfirm={() => void actions.confirmShareContext()}
        onCancel={actions.dismissShareContext}
        sending={state.busy}
      />
      <FeedbackModal
        sessionId={state.modals.active === 'feedback' ? state.modals.feedbackSessionId : null}
        onSubmit={actions.submitFeedback}
        onDismiss={actions.dismissFeedback}
        busy={state.busy}
        onShareTranscript={actions.prepareTranscriptUpload}
      />
      <UploadTranscriptModal
        payload={state.modals.active === 'uploadTranscript' ? state.modals.uploadTranscriptPayload : null}
        onUploaded={actions.dismissUploadTranscript}
        onDismiss={actions.dismissUploadTranscript}
      />
    </FxBox>
  );
}

export default BloxAiSessionBlock;

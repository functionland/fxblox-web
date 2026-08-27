/**
 * Port of apps/box/src/screens/Diagnostics/BloxAIChat.tsx — the chat transcript + reply input. Event rendering
 * per the Phase 9–11 contracts (thought / tool chip / verdict banner / recommended action card / execution
 * result / user question / error). Modals are owned by the parent (BloxAiSessionBlock).
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxCard, FxSpinner, FxText, FxTextInput, type ColorToken } from '@functionland/fx-ui';
import type { RecommendedActionEvent, TranscriptEntry, UserQuestionEvent } from '@/utils/bloxAiEvents';
import { CUSTOM_QUESTION_ENABLED } from '@/features/diagnostics/quickStartPrompts';

export interface BloxAIChatProps {
  transcript: TranscriptEntry[];
  streaming: boolean;
  sessionId: string | null;
  onApprove: (action: RecommendedActionEvent) => void;
  onSubmitReply: (question_id: string, reply_text: string) => void;
  onShareContext: () => void;
  onStartSession: (prompt: string) => void;
  onOpenFeedback?: () => void;
  onStartNewChat?: () => void;
  onRetrySamePrompt?: () => void;
  busy?: boolean;
}

/** The most-recent user_question that has not been answered yet, if any. */
export function findPendingQuestion(t: TranscriptEntry[]): UserQuestionEvent | null {
  for (let i = t.length - 1; i >= 0; i--) {
    const e = t[i]?.event;
    if (!e) continue;
    if (e.type === 'user_reply_received') return null;
    if (e.type === 'user_question') return e;
  }
  return null;
}

// Synthetic root_cause codes the rkllm backend emits when the model couldn't converge (kept in sync with
// blox-ai/src/runtime/rkllm_runtime.py).
const SYNTHETIC_VERDICT_CODES = new Set<string>(['no_verdict_emitted', 'max_turns_exceeded', 'insufficient_data']);
const SCHEMA_ERROR_CODES = new Set<string>(['SCHEMA_VIOLATION', 'SCHEMA_VIOLATION_RECOVERED']);

/** "Try again with the same question" when the chat ended on a synthetic verdict or an unrecovered schema error. */
export function shouldOfferRetry(t: TranscriptEntry[]): boolean {
  for (let i = t.length - 1; i >= 0; i--) {
    const e = t[i]?.event as { type?: string; code?: string; payload?: { root_cause?: string } } | undefined;
    if (!e) continue;
    if (e.type === 'verdict') {
      const rc = e.payload?.root_cause;
      return typeof rc === 'string' && SYNTHETIC_VERDICT_CODES.has(rc);
    }
    if (e.type === 'error' && typeof e.code === 'string' && SCHEMA_ERROR_CODES.has(e.code)) return true;
  }
  return false;
}

export function BloxAIChat({
  transcript,
  streaming,
  sessionId,
  onApprove,
  onSubmitReply,
  onShareContext,
  onStartSession,
  onOpenFeedback,
  onStartNewChat,
  onRetrySamePrompt,
  busy = false,
}: BloxAIChatProps) {
  const { t } = useTranslation();
  const [initialPrompt, setInitialPrompt] = useState('');
  const [replyText, setReplyText] = useState('');

  const pendingQuestion = findPendingQuestion(transcript);
  const pendingQuestionId = pendingQuestion?.question_id;

  useEffect(() => {
    setReplyText('');
  }, [pendingQuestionId]);

  const handleStart = useCallback(() => {
    if (!initialPrompt.trim()) return;
    onStartSession(initialPrompt.trim());
    setInitialPrompt('');
  }, [initialPrompt, onStartSession]);

  const handleSubmitReply = useCallback(() => {
    if (!pendingQuestion || !replyText.trim()) return;
    onSubmitReply(pendingQuestion.question_id, replyText.trim());
  }, [pendingQuestion, replyText, onSubmitReply]);

  // Tapped a scenario / Start but session_started has not arrived yet.
  if (streaming && !sessionId && transcript.length === 0) {
    return (
      <FxCard testID="blox-ai-chat-connecting">
        <FxCard.Title>{t('diagnostics.chat.connectingTitle')}</FxCard.Title>
        <FxBox paddingVertical="8" flexDirection="row" alignItems="center" gap="8">
          <FxSpinner label={null} />
          <FxText variant="bodySmallRegular" className="flex-1">
            {t('diagnostics.chat.connectingSubtitle')}
          </FxText>
        </FxBox>
      </FxCard>
    );
  }

  if (!sessionId && transcript.length === 0) {
    if (!CUSTOM_QUESTION_ENABLED) return null;
    return (
      <FxCard testID="blox-ai-chat-cta">
        <FxCard.Title>{t('diagnostics.chat.ctaTitle')}</FxCard.Title>
        <FxBox paddingVertical="8" gap="8">
          <FxText variant="bodySmallRegular">{t('diagnostics.chat.ctaSubtitle')}</FxText>
          <FxTextInput
            multiline
            numberOfLines={3}
            value={initialPrompt}
            onChangeText={setInitialPrompt}
            placeholder={t('diagnostics.chat.promptPlaceholder')}
            editable={!busy}
            testID="blox-ai-initial-prompt"
          />
          <FxButton onPress={handleStart} disabled={busy || !initialPrompt.trim()} testID="blox-ai-start-session">
            {t('diagnostics.chat.startButton')}
          </FxButton>
        </FxBox>
      </FxCard>
    );
  }

  return (
    <FxCard testID="blox-ai-chat-active">
      <FxCard.Title>{streaming ? t('diagnostics.chat.streaming') : t('diagnostics.chat.sessionTitle')}</FxCard.Title>
      <FxBox paddingVertical="8" role="log" aria-live="polite" aria-busy={streaming}>
        {transcript.map((entry) => (
          <EventRow key={entry.id} entry={entry} onApprove={onApprove} busy={busy} />
        ))}
        {streaming && !pendingQuestion && (
          <FxBox flexDirection="row" alignItems="center" gap="8" paddingVertical="8">
            <FxSpinner label={null} />
            <FxText variant="bodySmallRegular">{t('diagnostics.chat.thinking')}</FxText>
          </FxBox>
        )}

        {pendingQuestion && (
          <ReplyInput
            question={pendingQuestion}
            replyText={replyText}
            onChangeReply={setReplyText}
            onSubmit={handleSubmitReply}
            busy={busy}
          />
        )}

        <FxBox marginTop="12" gap="4">
          <FxButton variant="inverted" onPress={onShareContext} disabled={busy} testID="blox-ai-share-context">
            {t('diagnostics.chat.shareContext')}
          </FxButton>
          <FxText variant="bodyXSRegular" color="content3">
            {t('diagnostics.chat.shareContextHint')}
          </FxText>
        </FxBox>

        {!streaming && transcript.length > 0 && (
          <>
            {onRetrySamePrompt && shouldOfferRetry(transcript) && (
              <FxBox marginTop="12" gap="4">
                <FxButton onPress={onRetrySamePrompt} disabled={busy} testID="blox-ai-retry-same-prompt">
                  {t('diagnostics.chat.retrySamePromptButton')}
                </FxButton>
                <FxText variant="bodyXSRegular" color="content3">
                  {t('diagnostics.chat.retrySamePromptHint')}
                </FxText>
              </FxBox>
            )}
            {onStartNewChat && (
              <FxBox marginTop="12" gap="4">
                <FxButton onPress={onStartNewChat} disabled={busy} testID="blox-ai-start-new-chat">
                  {t('diagnostics.chat.startNewChatButton')}
                </FxButton>
                <FxText variant="bodyXSRegular" color="content3">
                  {t('diagnostics.chat.startNewChatHint')}
                </FxText>
              </FxBox>
            )}
            {onOpenFeedback && sessionId && (
              <FxBox marginTop="12" gap="4">
                <FxButton variant="inverted" onPress={onOpenFeedback} disabled={busy} testID="blox-ai-end-and-rate">
                  {t('diagnostics.chat.endAndRateButton')}
                </FxButton>
                <FxText variant="bodyXSRegular" color="content3">
                  {t('diagnostics.chat.endAndRateHint')}
                </FxText>
              </FxBox>
            )}
          </>
        )}
      </FxBox>
    </FxCard>
  );
}

function EventRow({
  entry,
  onApprove,
  busy,
}: {
  entry: TranscriptEntry;
  onApprove: (a: RecommendedActionEvent) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const ev = entry.event;

  switch (ev.type) {
    case 'session_started':
    case 'user_reply_received':
      return null;

    case 'thought':
      return (
        <FxBox paddingVertical="4" testID={`event-thought-${entry.id}`}>
          <FxText variant="bodySmallRegular" color="content3" fontStyle="italic">
            {ev.payload}
          </FxText>
        </FxBox>
      );

    case 'tool_call':
      return (
        <FxBox paddingVertical="4" testID={`event-tool-call-${entry.id}`}>
          <FxText variant="bodyXSRegular" className="font-mono">
            {t('diagnostics.chat.calling', { tool: ev.payload.tool })}
          </FxText>
        </FxBox>
      );

    case 'tool_result':
      return (
        <FxBox paddingVertical="4" testID={`event-tool-result-${entry.id}`}>
          <FxText variant="bodyXSRegular" color={ev.ok ? 'successBase' : 'errorBase'} className="font-mono">
            {ev.ok ? t('diagnostics.chat.toolOk') : t('diagnostics.chat.toolFailed', { error: ev.error ?? '' })}
          </FxText>
        </FxBox>
      );

    case 'verdict': {
      const severity: ColorToken =
        ev.payload.severity === 'green' ? 'successBase' : ev.payload.severity === 'yellow' ? 'warningBase' : 'errorBase';
      return (
        <FxBox
          paddingVertical="8"
          paddingHorizontal="12"
          borderRadius="m"
          marginVertical="8"
          backgroundColor={severity}
          testID={`event-verdict-${entry.id}`}
          data-severity={ev.payload.severity}
        >
          <FxText variant="bodyMediumRegular" color="white">
            {ev.payload.summary}
          </FxText>
          {ev.payload.root_cause && (
            <FxText variant="bodySmallRegular" color="white" marginTop="4">
              {t('diagnostics.chat.rootCause', { cause: ev.payload.root_cause })}
            </FxText>
          )}
        </FxBox>
      );
    }

    case 'recommended_action':
      return (
        <FxCard marginVertical="8" padding="12" testID={`event-recommended-action-${entry.id}`}>
          <FxText variant="bodyMediumRegular">{ev.action_name}</FxText>
          <FxText variant="bodySmallRegular" marginTop="4">
            {ev.reasoning}
          </FxText>
          <FxText variant="bodySmallRegular" marginTop="4">
            {t('diagnostics.chat.confidence', { pct: Math.round(ev.confidence * 100) })}
            {' • '}
            {ev.tier === 2 ? t('diagnostics.chat.tier2Label') : t('diagnostics.chat.tier3Label')}
          </FxText>
          <FxButton marginTop="8" onPress={() => onApprove(ev)} disabled={busy} testID={`event-approve-${entry.id}`}>
            {t('diagnostics.chat.approveButton')}
          </FxButton>
        </FxCard>
      );

    case 'execution_result':
      return (
        <FxBox
          paddingVertical="8"
          paddingHorizontal="12"
          borderRadius="m"
          marginVertical="4"
          backgroundColor={ev.success ? 'successMuted' : 'errorMuted'}
          testID={`event-execution-result-${entry.id}`}
        >
          <FxText variant="bodySmallRegular">
            {ev.success
              ? t('diagnostics.chat.executionSuccess', { ms: ev.duration_ms })
              : t('diagnostics.chat.executionFailure')}
          </FxText>
          {ev.follow_up && (
            <FxText variant="bodySmallRegular" marginTop="4">
              {ev.follow_up}
            </FxText>
          )}
        </FxBox>
      );

    case 'user_question':
      return (
        <FxBox
          paddingVertical="8"
          paddingHorizontal="12"
          borderRadius="m"
          marginVertical="4"
          backgroundColor="backgroundApp"
          testID={`event-user-question-${entry.id}`}
        >
          <FxText variant="bodyMediumRegular">{ev.payload.question}</FxText>
        </FxBox>
      );

    case 'error': {
      const friendlyKey =
        ev.code === 'no-transport'
          ? 'diagnostics.chat.errorEvent_noTransport'
          : ev.code === 'SCHEMA_VIOLATION_RECOVERED' || ev.code === 'SCHEMA_VIOLATION'
            ? 'diagnostics.chat.errorEvent_schemaViolation'
            : null;
      return (
        <FxBox
          role="alert"
          paddingVertical="8"
          paddingHorizontal="12"
          borderRadius="m"
          marginVertical="4"
          backgroundColor="errorMuted"
          testID={`event-error-${entry.id}`}
        >
          <FxText variant="bodySmallRegular">
            {friendlyKey ? t(friendlyKey) : t('diagnostics.chat.errorEvent', { code: ev.code, message: ev.message })}
          </FxText>
        </FxBox>
      );
    }
    default:
      return null;
  }
}

function ReplyInput({
  question,
  replyText,
  onChangeReply,
  onSubmit,
  busy,
}: {
  question: UserQuestionEvent;
  replyText: string;
  onChangeReply: (s: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const type = question.payload.expected_response_type ?? 'text';

  if (type === 'boolean') {
    return (
      <FxBox flexDirection="row" gap="8" paddingVertical="8" testID="reply-boolean">
        <FxButton
          onPress={() => {
            onChangeReply('yes');
            onSubmit();
          }}
          disabled={busy}
          testID="reply-boolean-yes"
        >
          {t('diagnostics.chat.yes')}
        </FxButton>
        <FxButton
          variant="inverted"
          onPress={() => {
            onChangeReply('no');
            onSubmit();
          }}
          disabled={busy}
          testID="reply-boolean-no"
        >
          {t('diagnostics.chat.no')}
        </FxButton>
      </FxBox>
    );
  }
  if (type === 'choice' && question.payload.options) {
    return (
      <FxBox paddingVertical="8" gap="8" testID="reply-choice">
        {question.payload.options.map((opt) => (
          <FxButton
            key={opt}
            variant="inverted"
            onPress={() => {
              onChangeReply(opt);
              onSubmit();
            }}
            disabled={busy}
            testID={`reply-choice-${opt}`}
          >
            {opt}
          </FxButton>
        ))}
      </FxBox>
    );
  }
  return (
    <FxBox paddingVertical="8" gap="8" testID="reply-text">
      <FxTextInput
        multiline
        numberOfLines={3}
        value={replyText}
        onChangeText={onChangeReply}
        placeholder={t('diagnostics.chat.replyPlaceholder')}
        editable={!busy}
        testID="reply-text-input"
      />
      <FxButton onPress={onSubmit} disabled={busy || !replyText.trim()} testID="reply-text-submit">
        {t('diagnostics.chat.submitReply')}
      </FxButton>
    </FxBox>
  );
}

export default BloxAIChat;

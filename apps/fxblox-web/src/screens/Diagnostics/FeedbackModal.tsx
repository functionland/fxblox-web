/**
 * Port of apps/box/src/screens/Diagnostics/FeedbackModal.tsx on FxDialog. Two phases: `rate` (👍 / 👎 / Skip +
 * optional comment) → `recorded` (rating recap + optional "Share anonymized transcript…" + Close). The share button
 * never calls onDismiss (the reducer's modal switch hides this dialog — see the mobile file for the lab bug).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxDialog, FxText, FxTextInput } from '@functionland/fx-ui';
import { buildFeedbackPayload, COMMENT_MAX_LENGTH, type FeedbackPayload, type FeedbackRating } from '@/utils/buildFeedbackPayload';

export interface FeedbackModalProps {
  sessionId: string | null;
  onSubmit: (payload: FeedbackPayload) => void;
  onDismiss: () => void;
  busy?: boolean;
  onShareTranscript?: (rating: FeedbackRating, comment: string) => boolean;
}

type Phase = 'rate' | 'recorded';

export function FeedbackModal({ sessionId, onSubmit, onDismiss, busy = false, onShareTranscript }: FeedbackModalProps) {
  const { t } = useTranslation();
  const [comment, setComment] = useState('');
  const [phase, setPhase] = useState<Phase>('rate');
  const [ratedAs, setRatedAs] = useState<FeedbackRating | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  const visible = sessionId !== null;

  useEffect(() => {
    if (visible) {
      setPhase('rate');
      setRatedAs(null);
      setShareError(null);
    }
  }, [visible]);

  const submit = (rating: FeedbackRating) => {
    if (!sessionId) return;
    try {
      const payload = buildFeedbackPayload({ sessionId, rating, comment });
      onSubmit(payload);
      setRatedAs(rating);
      setPhase('recorded');
    } catch {
      onDismiss();
    }
  };

  const handleShare = () => {
    if (!onShareTranscript) return;
    setShareError(null);
    const opened = onShareTranscript(ratedAs ?? 0, comment);
    if (!opened) setShareError(t('diagnostics.feedback.shareFailed'));
  };

  const ratingLabel =
    ratedAs === 1
      ? t('diagnostics.feedback.thumbsUp')
      : ratedAs === -1
        ? t('diagnostics.feedback.thumbsDown')
        : ratedAs === 0
          ? t('diagnostics.feedback.skip')
          : '';

  return (
    <FxDialog
      open={visible}
      onOpenChange={(open) => {
        if (!open && !busy) onDismiss();
      }}
      title={t('diagnostics.feedback.title')}
      description={
        phase === 'rate'
          ? t('diagnostics.feedback.subtitle')
          : t('diagnostics.feedback.recordedSubtitle', { rating: ratingLabel })
      }
      dismissible={!busy}
      closeLabel={t('diagnostics.feedback.dismiss')}
      testID="feedback-modal"
    >
      {phase === 'rate' && (
        <FxBox gap="12">
          <FxBox flexDirection="row" gap="8">
            <FxButton disabled={busy} onPress={() => submit(1)} className="flex-1" testID="feedback-thumbs-up">
              {t('diagnostics.feedback.thumbsUp')}
            </FxButton>
            <FxButton disabled={busy} onPress={() => submit(-1)} variant="inverted" className="flex-1" testID="feedback-thumbs-down">
              {t('diagnostics.feedback.thumbsDown')}
            </FxButton>
          </FxBox>
          <FxTextInput
            caption={t('diagnostics.feedback.commentLabel')}
            multiline
            numberOfLines={3}
            maxLength={COMMENT_MAX_LENGTH}
            value={comment}
            onChangeText={setComment}
            editable={!busy}
            placeholder={t('diagnostics.feedback.commentPlaceholder')}
            testID="feedback-comment-input"
          />
          <FxBox flexDirection="row" gap="8">
            <FxButton disabled={busy} onPress={onDismiss} variant="inverted" className="flex-1" testID="feedback-dismiss">
              {t('diagnostics.feedback.dismiss')}
            </FxButton>
            <FxButton disabled={busy} onPress={() => submit(0)} className="flex-1" testID="feedback-skip">
              {t('diagnostics.feedback.skip')}
            </FxButton>
          </FxBox>
        </FxBox>
      )}

      {phase === 'recorded' && (
        <FxBox gap="8">
          {onShareTranscript && (
            <>
              <FxText variant="bodyXSRegular">{t('diagnostics.feedback.shareHint')}</FxText>
              {shareError && (
                <FxText variant="bodyXSRegular" color="errorBase" role="alert">
                  {shareError}
                </FxText>
              )}
              <FxButton disabled={busy} onPress={handleShare} testID="feedback-share-transcript">
                {t('diagnostics.feedback.shareButton')}
              </FxButton>
            </>
          )}
          <FxButton disabled={busy} onPress={onDismiss} variant="inverted" testID="feedback-close">
            {t('diagnostics.feedback.dismiss')}
          </FxButton>
        </FxBox>
      )}
    </FxDialog>
  );
}

export default FeedbackModal;

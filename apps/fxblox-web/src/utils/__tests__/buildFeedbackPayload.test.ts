import { describe, expect, test } from 'vitest';
import { buildFeedbackPayload, COMMENT_MAX_LENGTH } from '../buildFeedbackPayload';

describe('buildFeedbackPayload', () => {
  test('builds minimal thumbs-up payload', () => {
    expect(buildFeedbackPayload({ sessionId: 'sess-1', rating: 1 })).toEqual({ session_id: 'sess-1', rating: 1 });
  });

  test('builds thumbs-down payload with comment', () => {
    expect(buildFeedbackPayload({ sessionId: 'sess-1', rating: -1, comment: 'still offline' })).toEqual({ session_id: 'sess-1', rating: -1, comment: 'still offline' });
  });

  test('explicit skip (rating=0) is distinct from modal-dismissed', () => {
    expect(buildFeedbackPayload({ sessionId: 'sess-1', rating: 0 }).rating).toBe(0);
  });

  test('rejects empty sessionId', () => {
    expect(() => buildFeedbackPayload({ sessionId: '', rating: 1 })).toThrow();
    expect(() => buildFeedbackPayload({ sessionId: '   ', rating: 1 })).toThrow();
  });

  test('rejects invalid rating', () => {
    for (const bad of [2, -2, 5, 0.5, NaN] as const) {
      expect(() => buildFeedbackPayload({ sessionId: 's', rating: bad as unknown as 0 })).toThrow();
    }
  });

  test('trims whitespace from comment', () => {
    expect(buildFeedbackPayload({ sessionId: 's', rating: 1, comment: '   ok thanks   ' }).comment).toBe('ok thanks');
  });

  test('strips CR/LF from comment (log-injection defense)', () => {
    const p = buildFeedbackPayload({ sessionId: 's', rating: -1, comment: 'line1\nline2\r\nline3' });
    expect(p.comment).toBe('line1 line2 line3');
  });

  test('omits comment when it is empty after normalization', () => {
    expect(buildFeedbackPayload({ sessionId: 's', rating: 0, comment: '   ' })).not.toHaveProperty('comment');
    expect(buildFeedbackPayload({ sessionId: 's', rating: 0, comment: '' })).not.toHaveProperty('comment');
    expect(buildFeedbackPayload({ sessionId: 's', rating: 0, comment: '\n\r\n' })).not.toHaveProperty('comment');
  });

  test('truncates oversized comment to COMMENT_MAX_LENGTH', () => {
    expect(buildFeedbackPayload({ sessionId: 's', rating: 1, comment: 'x'.repeat(5000) }).comment).toHaveLength(COMMENT_MAX_LENGTH);
  });

  test('preserves comment exactly at the cap', () => {
    const exact = 'a'.repeat(COMMENT_MAX_LENGTH);
    expect(buildFeedbackPayload({ sessionId: 's', rating: 1, comment: exact }).comment).toBe(exact);
  });

  test('payload key order is deterministic', () => {
    expect(Object.keys(buildFeedbackPayload({ sessionId: 'abc', rating: 1, comment: 'great' }))).toEqual(['session_id', 'rating', 'comment']);
  });
});

/**
 * Ported from apps/box/src/screens/Diagnostics/__tests__/useAiSession.test.ts — reducer + state machine.
 */
import { describe, expect, test } from 'vitest';
import { _internal } from '../useAiSession';
import type { BloxAiEvent, RecommendedActionEvent } from '@/utils/bloxAiEvents';

const { reducer, initialState, QUICK_START_SCENARIOS } = _internal;

const action1: RecommendedActionEvent = {
  type: 'recommended_action',
  action_id: 'a1',
  action_name: 'restart_kubo',
  args: {},
  reasoning: 'because',
  confidence: 0.8,
  tier: 2,
  approval_token: 'tok',
};

describe('useAiSession reducer — initial state', () => {
  test('starts empty with no transport / no session', () => {
    const s = initialState(null);
    expect(s.transcript).toEqual([]);
    expect(s.sessionId).toBeNull();
    expect(s.streaming).toBe(false);
    expect(s.transportKind).toBeNull();
    expect(s.modals.active).toBeNull();
    expect(s.pending).toBeNull();
    expect(s.lastPrompt).toBeNull();
    expect(s.lastTransportError).toBeNull();
    expect(s.prefilledScenario).toBeNull();
  });

  test('accepts initial prefilled scenario', () => {
    expect(initialState('disconnected').prefilledScenario).toBe('disconnected');
  });
});

describe('useAiSession reducer — session lifecycle', () => {
  test('session/start-requested resets transcript, sets streaming + lastPrompt', () => {
    const before = { ...initialState(null), transcript: [{ id: 'old', event: { type: 'thought', payload: 'old' } as BloxAiEvent, receivedAt: 0 }] };
    const after = reducer(before, { type: 'session/start-requested', prompt: 'why disconnected?', scenarioId: 'freeform', transportKind: 'lan-http' });
    expect(after.transcript).toEqual([]);
    expect(after.streaming).toBe(true);
    expect(after.transportKind).toBe('lan-http');
    expect(after.lastPrompt).toBe('why disconnected?');
    expect(after.lastTransportError).toBeNull();
    expect(after.sessionId).toBeNull();
  });

  test('session/started captures the sessionId', () => {
    expect(reducer(initialState(null), { type: 'session/started', sessionId: 'sess-42' }).sessionId).toBe('sess-42');
  });

  test('session/event appends to transcript with a position-unique key', () => {
    const s1 = reducer(initialState(null), { type: 'session/event', event: { type: 'thought', payload: 'hmm' } as BloxAiEvent });
    const s2 = reducer(s1, { type: 'session/event', event: { type: 'thought', payload: 'hmm2' } as BloxAiEvent });
    expect(s2.transcript).toHaveLength(2);
    expect(s2.transcript[0]!.id).not.toBe(s2.transcript[1]!.id);
  });

  test('session/event with session_started auto-captures sessionId', () => {
    const s = reducer(initialState(null), { type: 'session/event', event: { type: 'session_started', session_id: 'auto-1', protocol_version: 3 } as BloxAiEvent });
    expect(s.sessionId).toBe('auto-1');
  });

  test('session/event with verdict stops streaming', () => {
    const start = reducer(initialState(null), { type: 'session/start-requested', prompt: 'p', scenarioId: 'freeform', transportKind: 'ble' });
    const after = reducer(start, { type: 'session/event', event: { type: 'verdict', payload: { summary: 'ok', severity: 'green' } } as BloxAiEvent });
    expect(after.streaming).toBe(false);
  });

  test('recommended_action auto-opens approval modal when no other modal active', () => {
    const s = reducer(initialState(null), { type: 'session/event', event: action1 });
    expect(s.modals.active).toBe('approval');
    expect(s.modals.approvalAction?.action_id).toBe('a1');
  });

  test('recommended_action does NOT clobber an open feedback modal', () => {
    const withFeedback = reducer(initialState(null), { type: 'modal/open-feedback', sessionId: 'sess' });
    const after = reducer(withFeedback, { type: 'session/event', event: action1 });
    expect(after.modals.active).toBe('feedback');
    expect(after.transcript.some((t) => t.event.type === 'recommended_action')).toBe(true);
  });

  test('recommended_action already executed (execution_result present) does not reopen the modal (replay idempotency)', () => {
    const executed = reducer(initialState(null), {
      type: 'session/event',
      event: { type: 'execution_result', action_id: 'a1', success: true, duration_ms: 5 } as BloxAiEvent,
    });
    const after = reducer(executed, { type: 'session/event', event: action1 });
    expect(after.modals.active).toBeNull();
    expect(after.transcript).toHaveLength(2);
  });

  test('session/transport-error stops streaming + appends synthetic error entry + records lastTransportError', () => {
    const after = reducer(initialState(null), { type: 'session/transport-error', error: { kind: 'network', message: 'boom', transient: true } });
    expect(after.streaming).toBe(false);
    expect(after.lastTransportError?.kind).toBe('network');
    expect(after.transcript).toHaveLength(1);
    const last = after.transcript[0]!.event;
    expect(last.type).toBe('error');
    if (last.type === 'error') {
      expect(last.code).toBe('network');
      expect(last.recoverable).toBe(true);
    }
  });

  test('session/ended-by-user opens feedback modal with the sessionId', () => {
    const after = reducer(initialState(null), { type: 'session/ended-by-user', sessionId: 'sess-9' });
    expect(after.streaming).toBe(false);
    expect(after.modals.active).toBe('feedback');
    expect(after.modals.feedbackSessionId).toBe('sess-9');
  });

  test('session/resumed restores sessionId + prompt without clobbering modals/pending', () => {
    const before = {
      ...initialState('disconnected'),
      modals: { active: 'feedback' as const, approvalAction: null, shareContextPreview: null, feedbackSessionId: 'prev', uploadTranscriptPayload: null },
      pending: { ts: 't', trigger: 'isolation_mode' as const, verdict: null, actions: [action1] },
    };
    const after = reducer(before, { type: 'session/resumed', sessionId: 'resumed-1', prompt: 'why?', scenarioId: 'disconnected' });
    expect(after.sessionId).toBe('resumed-1');
    expect(after.streaming).toBe(true);
    expect(after.transportKind).toBe('lan-http');
    expect(after.transcript).toEqual([]);
    expect(after.modals.active).toBe('feedback');
    expect(after.pending).toEqual(before.pending);
  });

  test('session/clear wipes the transcript + session refs but keeps modals + pending', () => {
    const populated = {
      ...initialState('disconnected'),
      transcript: [{ id: 'ev-0', event: { type: 'thought', payload: 'thinking' } as BloxAiEvent, receivedAt: 0 }],
      sessionId: 'sess-42',
      streaming: true,
      transportKind: 'lan-http' as const,
      lastPrompt: 'why?',
      lastScenarioId: 'disconnected' as const,
      lastTransportError: { kind: 'sse-aborted' as const, message: 'aborted', transient: true },
      modals: { active: 'feedback' as const, approvalAction: null, shareContextPreview: null, feedbackSessionId: 'sess-42', uploadTranscriptPayload: null },
      pending: { ts: 't', trigger: 'isolation_mode' as const, verdict: null, actions: [action1] },
    };
    const cleared = reducer(populated, { type: 'session/clear' });
    expect(cleared.transcript).toEqual([]);
    expect(cleared.sessionId).toBeNull();
    expect(cleared.streaming).toBe(false);
    expect(cleared.transportKind).toBeNull();
    expect(cleared.lastPrompt).toBeNull();
    expect(cleared.lastTransportError).toBeNull();
    expect(cleared.modals.active).toBe('feedback');
    expect(cleared.pending).toEqual(populated.pending);
    expect(cleared.prefilledScenario).toBe('disconnected');
  });
});

describe('useAiSession reducer — modal mutual exclusion', () => {
  test('modal/dismiss clears all modal state at once', () => {
    const withApproval = reducer(initialState(null), { type: 'modal/open-approval', action: action1 });
    const dismissed = reducer(withApproval, { type: 'modal/dismiss' });
    expect(dismissed.modals.active).toBeNull();
    expect(dismissed.modals.approvalAction).toBeNull();
  });

  test('opening one modal replaces another', () => {
    const withApproval = reducer(initialState(null), { type: 'modal/open-approval', action: action1 });
    const withShare = reducer(withApproval, { type: 'modal/open-share-context', preview: { app_version: '0.0.1', os: 'web', os_version: 'windows' } });
    expect(withShare.modals.active).toBe('shareContext');
    expect(withShare.modals.approvalAction?.action_id).toBe('a1');
  });

  test('opening upload-transcript modal stores the payload', () => {
    const payload = {
      schema_version: 1 as const,
      upload_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      session_relative_start: '+0s' as const,
      events: [],
      user_rating: 1 as const,
      consent: { explicit_opt_in: true as const, preview_shown: true as const, anonymizer_version: 'v1' },
      device_class: 'rk3588' as const,
    };
    const after = reducer(initialState(null), { type: 'modal/open-upload-transcript', payload });
    expect(after.modals.active).toBe('uploadTranscript');
    expect(after.modals.uploadTranscriptPayload).toEqual(payload);
  });
});

describe('useAiSession reducer — pending actions + prefill', () => {
  const samplePending = { ts: '2026-01-01T00:00:00Z', trigger: 'isolation_mode' as const, verdict: null, actions: [action1] };

  test('pending/set stores the record + clears errors; pending/clear resets both', () => {
    const errored = reducer(initialState(null), { type: 'pending/error', message: 'oh no' });
    expect(errored.pendingError).toBe('oh no');
    const set = reducer(errored, { type: 'pending/set', record: samplePending });
    expect(set.pending?.actions).toHaveLength(1);
    expect(set.pendingError).toBeNull();
    const cleared = reducer(set, { type: 'pending/clear' });
    expect(cleared.pending).toBeNull();
  });

  test('prefill/consume clears it; prefill/set overrides', () => {
    expect(reducer(initialState('disconnected'), { type: 'prefill/consume' }).prefilledScenario).toBeNull();
    expect(reducer(initialState(null), { type: 'prefill/set', scenario: 'not-earning' }).prefilledScenario).toBe('not-earning');
  });
});

describe('quick-start scenarios — canonical English prompts', () => {
  test('disconnected scenario carries the expected English prompt', () => {
    const p = QUICK_START_SCENARIOS['disconnected'].canonicalPrompt;
    expect(p).toContain('Blox');
    expect(p).toContain('disconnected');
  });

  test('all 3 scenarios are present', () => {
    expect(Object.keys(QUICK_START_SCENARIOS).sort()).toEqual(['cannot-join-pool', 'disconnected', 'not-earning']);
  });
});

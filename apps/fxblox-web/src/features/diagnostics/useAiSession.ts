/**
 * useAiSession — single owner of an AI session's state machine (ported from
 * apps/box/src/screens/Diagnostics/useAiSession.ts). Reducer VERBATIM; adaptations:
 *   - `AppState` → `platform/visibility.onForeground()`
 *   - `bleManager: BleManagerWrapper | null` → any `BleCommandWriter | null` (a `ResponseAssembler` bound to
 *     the Web Bluetooth `BleSession` of the selected blox)
 *   - persistence through the KV store (aiSessionPersistence)
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { onForeground } from '@/platform/visibility';

import { selectAiTransport, type AiTransportKind } from '@/utils/aiTransport';
import { HttpAiClient, type AiClientError, type SessionHandle } from '@/utils/httpAiClient';
import { BleAiClient } from '@/utils/bleAiClient';
import type { BleCommandWriter } from '@/utils/ble';
import { clearPersistedSession, flushDebounce, loadPersistedSession, schedulePersist } from '@/utils/aiSessionPersistence';
import type { BloxAiEvent, RecommendedActionEvent, ExecutionResultEvent, TranscriptEntry } from '@/utils/bloxAiEvents';
import { QUICK_START_SCENARIOS, getScenario, type ScenarioId } from './quickStartPrompts';
import { parsePendingResponse, type PendingActionsRecord } from '@/utils/parsePendingResponse';
import type { PhoneContext } from '@/utils/clientLogger';
import { anonymizeTranscript, type AnonymizedTranscript, type RawTranscriptEvent } from '@/utils/anonymizeTranscript';
import type { FeedbackPayload, FeedbackRating } from '@/utils/buildFeedbackPayload';

export type { PendingActionsRecord, PhoneContext, AnonymizedTranscript, FeedbackPayload, FeedbackRating };

// Public types -------------------------------------------------------------

export type ActiveModal = 'approval' | 'shareContext' | 'feedback' | 'uploadTranscript' | null;

export interface AiSessionState {
  transcript: TranscriptEntry[];
  sessionId: string | null;
  streaming: boolean;
  busy: boolean;
  transportKind: AiTransportKind | null;
  prefilledScenario: ScenarioId | null;
  pending: PendingActionsRecord | null;
  pendingError: string | null;
  modals: {
    active: ActiveModal;
    approvalAction: RecommendedActionEvent | null;
    shareContextPreview: PhoneContext | null;
    feedbackSessionId: string | null;
    uploadTranscriptPayload: AnonymizedTranscript | null;
  };
  lastPrompt: string | null;
  lastScenarioId: ScenarioId | 'freeform' | null;
  lastTransportError: AiClientError | null;
}

export interface UseAiSessionOptions {
  bloxPeerId: string;
  appPeerId: string;
  manualIp?: string | null;
  /** A BLE command writer for the paired blox (ResponseAssembler over its BleSession), or null. */
  bleManager: BleCommandWriter | null;
  blePeripheralId: string | null;
  pluginInstalled: boolean;
  initialPrefilledScenario?: ScenarioId | null;
  gatherPhoneContext?: () => Promise<PhoneContext>;
}

export interface UseAiSessionResult {
  state: AiSessionState;
  actions: {
    startSession: (prompt: string) => Promise<void>;
    startQuickStart: (scenario: ScenarioId) => Promise<void>;
    endSession: () => void;
    cancelSession: () => void;
    clearSession: () => void;
    retryOverBle: () => Promise<void>;
    retrySamePrompt: () => Promise<void>;
    consumePrefill: () => void;
    openApproval: (action: RecommendedActionEvent) => void;
    confirmApproval: (securityCode: string | null) => void;
    dismissApproval: () => void;
    submitReply: (questionId: string, replyText: string) => Promise<void>;
    openShareContext: () => Promise<void>;
    confirmShareContext: () => Promise<void>;
    dismissShareContext: () => void;
    openFeedback: () => void;
    submitFeedback: (payload: FeedbackPayload) => void;
    dismissFeedback: () => void;
    openUploadTranscript: (payload: AnonymizedTranscript) => void;
    prepareTranscriptUpload: (rating: FeedbackRating, comment?: string) => boolean;
    dismissUploadTranscript: () => void;
    refreshPending: () => Promise<void>;
    approvePending: (action: RecommendedActionEvent) => void;
    dismissPending: () => void;
  };
}

// Reducer ------------------------------------------------------------------

export type Action =
  | { type: 'session/start-requested'; prompt: string; scenarioId: ScenarioId | 'freeform'; transportKind: AiTransportKind | null }
  | { type: 'session/transport-selected'; transportKind: AiTransportKind }
  | { type: 'session/started'; sessionId: string }
  | { type: 'session/event'; event: BloxAiEvent }
  | { type: 'session/transport-error'; error: AiClientError }
  | { type: 'session/ended-complete' }
  | { type: 'session/ended-by-user'; sessionId: string }
  | { type: 'session/cancelled' }
  | { type: 'session/clear' }
  | { type: 'session/resumed'; sessionId: string; prompt: string; scenarioId: ScenarioId | 'freeform' }
  | { type: 'busy/set'; busy: boolean }
  | { type: 'modal/open-approval'; action: RecommendedActionEvent }
  | { type: 'modal/dismiss' }
  | { type: 'modal/open-share-context'; preview: PhoneContext }
  | { type: 'modal/open-feedback'; sessionId: string }
  | { type: 'modal/open-upload-transcript'; payload: AnonymizedTranscript }
  | { type: 'pending/set'; record: PendingActionsRecord }
  | { type: 'pending/error'; message: string }
  | { type: 'pending/clear' }
  | { type: 'prefill/set'; scenario: ScenarioId | null }
  | { type: 'prefill/consume' };

export function initialState(prefilled: ScenarioId | null): AiSessionState {
  return {
    transcript: [],
    sessionId: null,
    streaming: false,
    busy: false,
    transportKind: null,
    prefilledScenario: prefilled,
    pending: null,
    pendingError: null,
    modals: {
      active: null,
      approvalAction: null,
      shareContextPreview: null,
      feedbackSessionId: null,
      uploadTranscriptPayload: null,
    },
    lastPrompt: null,
    lastScenarioId: null,
    lastTransportError: null,
  };
}

type EventWithIds = { action_id?: string; call_id?: string; question_id?: string; session_id?: string };

export function reducer(state: AiSessionState, action: Action): AiSessionState {
  switch (action.type) {
    case 'session/start-requested':
      // Dispatched IMMEDIATELY on user tap (before selectAiTransport awaits) so the UI shows "Connecting…".
      return {
        ...state,
        transcript: [],
        sessionId: null,
        streaming: true,
        transportKind: action.transportKind,
        lastPrompt: action.prompt,
        lastScenarioId: action.scenarioId,
        lastTransportError: null,
      };

    case 'session/transport-selected':
      return { ...state, transportKind: action.transportKind };

    case 'session/started':
      return { ...state, sessionId: action.sessionId };

    case 'session/event': {
      // Key = semantic prefix + monotonic transcript position (identical prefixes never collide).
      const ev = action.event;
      const ids = ev as unknown as EventWithIds;
      const baseId = ids.action_id ?? ids.call_id ?? ids.question_id ?? ids.session_id ?? 'evt';
      const entry: TranscriptEntry = {
        id: `${String(baseId)}-${state.transcript.length}`,
        event: ev,
        receivedAt: Date.now(),
      };
      const next: AiSessionState = { ...state, transcript: [...state.transcript, entry] };
      if (ev.type === 'session_started') {
        next.sessionId = ev.session_id;
      } else if (ev.type === 'verdict' || ev.type === 'error') {
        next.streaming = false;
      } else if (ev.type === 'recommended_action') {
        // Action-replay idempotency: an execution_result for this action_id means it already ran.
        const alreadyExecuted = state.transcript.some((t) => {
          const ee = t.event as { type?: string; action_id?: string };
          return ee?.type === 'execution_result' && ee.action_id === ev.action_id;
        });
        if (alreadyExecuted) {
          return next;
        }
        // Auto-open approval modal ONLY if no other modal is currently open.
        if (state.modals.active === null) {
          next.modals = { ...next.modals, active: 'approval', approvalAction: ev };
        }
      }
      return next;
    }

    case 'session/transport-error':
      return {
        ...state,
        streaming: false,
        lastTransportError: action.error,
        transcript: [
          ...state.transcript,
          {
            id: `err-${Date.now()}-${state.transcript.length}`,
            event: {
              type: 'error',
              code: action.error.kind,
              message: action.error.message,
              recoverable: action.error.transient,
            } as BloxAiEvent,
            receivedAt: Date.now(),
          },
        ],
      };

    case 'session/ended-complete':
      return { ...state, streaming: false };

    case 'session/ended-by-user':
      return {
        ...state,
        streaming: false,
        modals: { ...state.modals, active: 'feedback', feedbackSessionId: action.sessionId },
      };

    case 'session/cancelled':
      return { ...state, streaming: false };

    case 'session/clear':
      return {
        ...state,
        transcript: [],
        sessionId: null,
        streaming: false,
        transportKind: null,
        lastPrompt: null,
        lastScenarioId: null,
        lastTransportError: null,
      };

    case 'session/resumed':
      return {
        ...state,
        transcript: [],
        sessionId: action.sessionId,
        streaming: true,
        transportKind: 'lan-http', // resume is HTTP-only
        lastPrompt: action.prompt,
        lastScenarioId: action.scenarioId,
        lastTransportError: null,
      };

    case 'busy/set':
      return { ...state, busy: action.busy };

    case 'modal/open-approval':
      return { ...state, modals: { ...state.modals, active: 'approval', approvalAction: action.action } };

    case 'modal/dismiss':
      return {
        ...state,
        modals: { active: null, approvalAction: null, shareContextPreview: null, feedbackSessionId: null, uploadTranscriptPayload: null },
      };

    case 'modal/open-share-context':
      return { ...state, modals: { ...state.modals, active: 'shareContext', shareContextPreview: action.preview } };

    case 'modal/open-feedback':
      return { ...state, modals: { ...state.modals, active: 'feedback', feedbackSessionId: action.sessionId } };

    case 'modal/open-upload-transcript':
      return { ...state, modals: { ...state.modals, active: 'uploadTranscript', uploadTranscriptPayload: action.payload } };

    case 'pending/set':
      return { ...state, pending: action.record, pendingError: null };

    case 'pending/error':
      return { ...state, pending: null, pendingError: action.message };

    case 'pending/clear':
      return { ...state, pending: null, pendingError: null };

    case 'prefill/set':
      return { ...state, prefilledScenario: action.scenario };

    case 'prefill/consume':
      return { ...state, prefilledScenario: null };

    default:
      return state;
  }
}

// Hook ---------------------------------------------------------------------

type AiClient = HttpAiClient | BleAiClient;

const isAiClientError = (e: unknown): e is AiClientError => typeof e === 'object' && e !== null && typeof (e as { kind?: unknown }).kind === 'string';

export function useAiSession(opts: UseAiSessionOptions): UseAiSessionResult {
  const { bloxPeerId, appPeerId, manualIp = null, bleManager, blePeripheralId, pluginInstalled, initialPrefilledScenario = null, gatherPhoneContext } = opts;

  const [state, dispatch] = useReducer(reducer, initialPrefilledScenario, initialState);

  // Refs that bypass closure staleness.
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = state.sessionId;
  const lastPromptRef = useRef<string | null>(null);
  lastPromptRef.current = state.lastPrompt;
  const lastScenarioIdRef = useRef<ScenarioId | 'freeform' | null>(null);
  lastScenarioIdRef.current = state.lastScenarioId;
  const manualIpRef = useRef<string | null>(null);
  manualIpRef.current = manualIp;

  const activeClientRef = useRef<AiClient | null>(null);
  const activeHandleRef = useRef<SessionHandle | null>(null);
  const mountedRef = useRef(true);
  const lastEventSeqRef = useRef<number>(-1);
  const autoResumeInFlightRef = useRef<boolean>(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      try {
        activeHandleRef.current?.cancel();
      } catch {
        /* swallow */
      }
      activeHandleRef.current = null;
      activeClientRef.current = null;
    };
  }, []);

  // ---- Pending fetch ---------------------------------------------------

  const refreshPending = useCallback(async () => {
    if (!pluginInstalled) {
      dispatch({ type: 'pending/clear' });
      return;
    }
    if (!bleManager || !blePeripheralId) {
      dispatch({ type: 'pending/clear' });
      return;
    }
    try {
      const raw = await bleManager.writeToBLEAndWaitForResponse(JSON.stringify({ command: 'ai/pending' }), blePeripheralId, undefined, undefined, 10_000);
      const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const record = parsePendingResponse(parsed);
      if (record && mountedRef.current) {
        dispatch({ type: 'pending/set', record });
      } else if (mountedRef.current) {
        dispatch({ type: 'pending/clear' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (mountedRef.current) {
        dispatch({ type: 'pending/error', message: msg });
      }
    }
  }, [pluginInstalled, bleManager, blePeripheralId]);

  // Initial pending fetch + foreground refresh.
  useEffect(() => {
    void refreshPending();
    return onForeground(() => {
      void refreshPending();
    });
  }, [refreshPending]);

  // ---- Session lifecycle ----------------------------------------------

  const buildCallbacks = useCallback(() => {
    return {
      onEvent: (ev: BloxAiEvent) => {
        if (!mountedRef.current) return;
        dispatch({ type: 'session/event', event: ev });
      },
      onSeq: (seq: number | null) => {
        if (!mountedRef.current) return;
        if (seq === null) return;
        if (seq <= lastEventSeqRef.current) return;
        lastEventSeqRef.current = seq;
        const sid = sessionIdRef.current;
        const prompt = lastPromptRef.current;
        if (sid && prompt) {
          schedulePersist({
            sessionId: sid,
            lastEventSeq: seq,
            lastPrompt: prompt,
            lastScenarioId: lastScenarioIdRef.current ?? 'freeform',
            savedAt: Date.now(),
          });
        }
      },
      onComplete: () => {
        if (!mountedRef.current) return;
        dispatch({ type: 'session/ended-complete' });
      },
      onError: (err: AiClientError) => {
        if (!mountedRef.current) return;
        dispatch({ type: 'session/transport-error', error: err });
        if (err.kind === 'http-not-found') {
          void (async () => {
            await flushDebounce();
            await clearPersistedSession();
          })();
        }
      },
    };
  }, []);

  // Auto-resume after the tab was hidden / reloaded (LAN-HTTP only).
  const attemptAutoResume = useCallback(async () => {
    if (autoResumeInFlightRef.current) return;
    if (state.streaming) return;
    if (sessionIdRef.current) return;
    autoResumeInFlightRef.current = true;
    try {
      const snap = await loadPersistedSession();
      if (snap === null) return;
      if (!mountedRef.current) return;
      const choice = await selectAiTransport(bloxPeerId, appPeerId, { scanIfEmpty: true, manualIp: manualIpRef.current ?? undefined });
      if (!mountedRef.current) return;
      if (choice.kind !== 'lan-http' || !choice.httpClient) {
        return;
      }
      const httpClient = choice.httpClient;
      const scenarioId = (snap.lastScenarioId as ScenarioId | 'freeform') ?? 'freeform';
      dispatch({ type: 'session/resumed', sessionId: snap.sessionId, prompt: snap.lastPrompt, scenarioId });
      sessionIdRef.current = snap.sessionId;
      lastEventSeqRef.current = snap.lastEventSeq;

      activeClientRef.current = httpClient;
      const handle = httpClient.resume(snap.sessionId, snap.lastEventSeq + 1, buildCallbacks());
      activeHandleRef.current = handle;
    } catch (e) {
      console.warn('attemptAutoResume failed', e);
    } finally {
      autoResumeInFlightRef.current = false;
    }
  }, [state.streaming, bloxPeerId, appPeerId, buildCallbacks]);

  useEffect(() => {
    void attemptAutoResume();
    return onForeground(() => {
      void attemptAutoResume();
    });
  }, [attemptAutoResume]);

  const startSessionInternal = useCallback(
    async (prompt: string, sopts?: { forceTransport?: 'lan-http' | 'ble'; scenarioId?: ScenarioId | 'freeform' }) => {
      if (state.streaming) return;

      try {
        activeHandleRef.current?.cancel();
      } catch {
        /* swallow */
      }
      activeHandleRef.current = null;
      activeClientRef.current = null;

      dispatch({ type: 'session/start-requested', prompt, scenarioId: sopts?.scenarioId ?? 'freeform', transportKind: null });

      let chosenKind: AiTransportKind;
      let client: AiClient;

      const bleAvailable = !!bleManager && !!blePeripheralId;

      if (sopts?.forceTransport === 'ble') {
        if (!bleAvailable) {
          dispatch({ type: 'session/transport-error', error: { kind: 'no-transport', message: 'BLE not available on this device', transient: false } });
          return;
        }
        chosenKind = 'ble';
        client = new BleAiClient(bleManager!, blePeripheralId!);
      } else {
        const choice = await selectAiTransport(bloxPeerId, appPeerId, { scanIfEmpty: true, manualIp: manualIpRef.current ?? undefined });
        chosenKind = choice.kind;
        if (choice.kind === 'lan-http' && choice.httpClient) {
          client = choice.httpClient;
        } else if (bleAvailable) {
          chosenKind = 'ble';
          client = new BleAiClient(bleManager!, blePeripheralId!);
        } else {
          dispatch({
            type: 'session/transport-error',
            error: { kind: 'no-transport', message: 'Cannot reach your Blox over LAN or Bluetooth', transient: false },
          });
          return;
        }
      }

      activeClientRef.current = client;
      dispatch({ type: 'session/transport-selected', transportKind: chosenKind });

      lastEventSeqRef.current = -1;

      const handle = client.runAi(prompt, undefined, buildCallbacks());
      activeHandleRef.current = handle;
    },
    [bleManager, blePeripheralId, bloxPeerId, appPeerId, state.streaming, buildCallbacks],
  );

  const startTreeInternal = useCallback(
    async (scenarioId: string, displayPrompt: string) => {
      if (state.streaming) return;
      try {
        activeHandleRef.current?.cancel();
      } catch {
        /* swallow */
      }
      activeHandleRef.current = null;
      activeClientRef.current = null;

      dispatch({ type: 'session/start-requested', prompt: displayPrompt, scenarioId: scenarioId as ScenarioId | 'freeform', transportKind: null });

      const choice = await selectAiTransport(bloxPeerId, appPeerId, { scanIfEmpty: true, manualIp: manualIpRef.current ?? undefined });
      if (choice.kind !== 'lan-http' || !choice.httpClient) {
        // Tree endpoint is HTTP-only. Fall back to the LLM path so the user still gets help.
        await startSessionInternal(displayPrompt, { scenarioId: scenarioId as ScenarioId | 'freeform' });
        return;
      }
      const httpClient = choice.httpClient;
      activeClientRef.current = httpClient;
      dispatch({ type: 'session/transport-selected', transportKind: 'lan-http' });
      lastEventSeqRef.current = -1;
      const handle = httpClient.runTree(scenarioId, undefined, buildCallbacks());
      activeHandleRef.current = handle;
    },
    [bloxPeerId, appPeerId, state.streaming, buildCallbacks, startSessionInternal],
  );

  const startSession = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;
      const choice = await selectAiTransport(bloxPeerId, appPeerId, { scanIfEmpty: true, manualIp: manualIpRef.current ?? undefined });
      if (choice.kind === 'lan-http' && choice.httpClient) {
        const sid = await choice.httpClient.classify(trimmed).catch(() => 'other');
        if (sid === 'disconnected' || sid === 'not-earning' || sid === 'cannot-join-pool') {
          await startTreeInternal(sid, trimmed);
          return;
        }
      }
      await startSessionInternal(trimmed);
    },
    [bloxPeerId, appPeerId, startSessionInternal, startTreeInternal],
  );

  const startQuickStart = useCallback(
    async (id: ScenarioId) => {
      const scenario = getScenario(id);
      await startTreeInternal(id, scenario.canonicalPrompt);
    },
    [startTreeInternal],
  );

  const retryOverBle = useCallback(async () => {
    if (!state.lastPrompt) return;
    await startSessionInternal(state.lastPrompt, { forceTransport: 'ble', scenarioId: state.lastScenarioId ?? 'freeform' });
  }, [state.lastPrompt, state.lastScenarioId, startSessionInternal]);

  const retrySamePrompt = useCallback(async () => {
    if (!state.lastPrompt) return;
    await startSessionInternal(state.lastPrompt, { scenarioId: state.lastScenarioId ?? 'freeform' });
  }, [state.lastPrompt, state.lastScenarioId, startSessionInternal]);

  const cancelSession = useCallback(() => {
    try {
      activeHandleRef.current?.cancel();
    } catch {
      /* swallow */
    }
    activeHandleRef.current = null;
    activeClientRef.current = null;
    dispatch({ type: 'session/cancelled' });
  }, []);

  const endSession = useCallback(() => {
    const sid = sessionIdRef.current;
    try {
      activeHandleRef.current?.cancel();
    } catch {
      /* swallow */
    }
    activeHandleRef.current = null;
    activeClientRef.current = null;
    if (sid) {
      dispatch({ type: 'session/ended-by-user', sessionId: sid });
    } else {
      dispatch({ type: 'session/cancelled' });
    }
  }, []);

  const clearSession = useCallback(() => {
    try {
      activeHandleRef.current?.cancel();
    } catch {
      /* swallow */
    }
    activeHandleRef.current = null;
    activeClientRef.current = null;
    sessionIdRef.current = null;
    lastEventSeqRef.current = -1;
    dispatch({ type: 'session/clear' });
    void (async () => {
      await flushDebounce();
      await clearPersistedSession();
    })();
  }, []);

  // ---- Recommendation flow --------------------------------------------

  const openApproval = useCallback((action: RecommendedActionEvent) => {
    dispatch({ type: 'modal/open-approval', action });
  }, []);

  const dismissApproval = useCallback(() => {
    dispatch({ type: 'modal/dismiss' });
  }, []);

  const confirmApproval = useCallback(
    (securityCode: string | null): void => {
      const action = state.modals.approvalAction;
      const client = activeClientRef.current;
      if (!action || !client) {
        dispatch({ type: 'modal/dismiss' });
        return;
      }
      dispatch({ type: 'busy/set', busy: true });
      void (async () => {
        try {
          const result = await client.executeAction({ action_id: action.action_id, approval_token: action.approval_token }, securityCode ?? undefined);
          if (result.ok && result.payload) {
            dispatch({ type: 'session/event', event: result.payload as ExecutionResultEvent });
          } else if (result.error) {
            dispatch({ type: 'session/transport-error', error: result.error });
          }
        } finally {
          dispatch({ type: 'busy/set', busy: false });
          dispatch({ type: 'modal/dismiss' });
        }
      })();
    },
    [state.modals.approvalAction],
  );

  // ---- Conversation (user reply) --------------------------------------

  const submitReply = useCallback(async (questionId: string, replyText: string): Promise<void> => {
    const sid = sessionIdRef.current;
    const client = activeClientRef.current;
    if (!sid || !client) return;
    dispatch({ type: 'busy/set', busy: true });
    try {
      await client.userReply(sid, questionId, replyText);
      dispatch({
        type: 'session/event',
        event: { type: 'user_reply_received', question_id: questionId, session_id: sid } as BloxAiEvent,
      });
    } catch (e) {
      const err: AiClientError = isAiClientError(e) ? e : { kind: 'network', message: String(e), transient: true };
      dispatch({ type: 'session/transport-error', error: err });
    } finally {
      dispatch({ type: 'busy/set', busy: false });
    }
  }, []);

  // ---- Phone context --------------------------------------------------

  const openShareContext = useCallback(async () => {
    if (!gatherPhoneContext) return;
    const ctx = await gatherPhoneContext();
    dispatch({ type: 'modal/open-share-context', preview: ctx });
  }, [gatherPhoneContext]);

  const dismissShareContext = useCallback(() => {
    dispatch({ type: 'modal/dismiss' });
  }, []);

  const confirmShareContext = useCallback(async () => {
    const ctx = state.modals.shareContextPreview;
    const sid = sessionIdRef.current;
    const client = activeClientRef.current;
    if (!ctx || !sid || !client) {
      dispatch({ type: 'modal/dismiss' });
      return;
    }
    dispatch({ type: 'busy/set', busy: true });
    try {
      await client.phoneContext(sid, ctx as unknown as Record<string, unknown>);
    } catch (e) {
      const err: AiClientError = isAiClientError(e) ? e : { kind: 'network', message: String(e), transient: true };
      dispatch({ type: 'session/transport-error', error: err });
    } finally {
      dispatch({ type: 'busy/set', busy: false });
      dispatch({ type: 'modal/dismiss' });
    }
  }, [state.modals.shareContextPreview]);

  // ---- Feedback + upload ---------------------------------------------

  const openFeedback = useCallback(() => {
    const sid = sessionIdRef.current;
    if (sid) dispatch({ type: 'modal/open-feedback', sessionId: sid });
  }, []);

  const dismissFeedback = useCallback(() => {
    dispatch({ type: 'modal/dismiss' });
  }, []);

  const submitFeedback = useCallback(
    (payload: FeedbackPayload): void => {
      if (!bleManager || !blePeripheralId) {
        return;
      }
      void (async () => {
        try {
          await bleManager.writeToBLEAndWaitForResponse(JSON.stringify({ command: 'ai/feedback', args: payload }), blePeripheralId, undefined, undefined, 10_000);
        } catch {
          /* best effort */
        }
      })();
    },
    [bleManager, blePeripheralId],
  );

  const openUploadTranscript = useCallback((payload: AnonymizedTranscript) => {
    dispatch({ type: 'modal/open-upload-transcript', payload });
  }, []);

  const prepareTranscriptUpload = useCallback(
    (rating: FeedbackRating, comment?: string): boolean => {
      const entries = state.transcript;
      const first = entries[0];
      if (!first) return false;
      const sessionStartTs = new Date(first.receivedAt).toISOString();

      const rawEvents: RawTranscriptEvent[] = entries.map((e) => ({
        ...(e.event as unknown as Record<string, unknown>),
        type: (e.event as { type?: string }).type ?? 'unknown',
        ts: new Date(e.receivedAt).toISOString(),
      }));

      let uploadId: string;
      const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
      if (cryptoObj?.randomUUID) {
        uploadId = cryptoObj.randomUUID();
      } else {
        uploadId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      }

      try {
        const payload = anonymizeTranscript({
          uploadId,
          sessionStartTs,
          events: rawEvents,
          rating,
          comment: comment && comment.trim() ? comment.trim() : undefined,
          userPrompt: state.lastPrompt ?? undefined,
          scenarioId: state.lastScenarioId ?? undefined,
        });
        dispatch({ type: 'modal/open-upload-transcript', payload });
        return true;
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        console.warn('prepareTranscriptUpload: anonymizeTranscript failed:', reason, {
          transcriptLen: rawEvents.length,
          eventTypes: rawEvents.map((r) => r.type),
        });
        return false;
      }
    },
    [state.transcript, state.lastPrompt, state.lastScenarioId],
  );

  const dismissUploadTranscript = useCallback(() => {
    dispatch({ type: 'modal/dismiss' });
  }, []);

  // ---- Pending action approve/dismiss --------------------------------

  const approvePending = useCallback((action: RecommendedActionEvent): void => {
    dispatch({ type: 'modal/open-approval', action });
  }, []);

  const dismissPending = useCallback((): void => {
    dispatch({ type: 'pending/clear' });
    if (!bleManager || !blePeripheralId) return;
    void (async () => {
      try {
        await bleManager.writeToBLEAndWaitForResponse(JSON.stringify({ command: 'ai/pending-dismiss-all', args: {} }), blePeripheralId, undefined, undefined, 5_000);
      } catch {
        /* swallow */
      }
    })();
  }, [bleManager, blePeripheralId]);

  // ---- Prefill consumption -------------------------------------------

  const consumePrefill = useCallback(() => {
    dispatch({ type: 'prefill/consume' });
  }, []);

  // ---- Public surface -------------------------------------------------

  return useMemo<UseAiSessionResult>(
    () => ({
      state,
      actions: {
        startSession,
        startQuickStart,
        endSession,
        cancelSession,
        clearSession,
        retryOverBle,
        retrySamePrompt,
        consumePrefill,
        openApproval,
        confirmApproval,
        dismissApproval,
        submitReply,
        openShareContext,
        confirmShareContext,
        dismissShareContext,
        openFeedback,
        submitFeedback,
        dismissFeedback,
        openUploadTranscript,
        prepareTranscriptUpload,
        dismissUploadTranscript,
        refreshPending,
        approvePending,
        dismissPending,
      },
    }),
    [
      state, startSession, startQuickStart, endSession, cancelSession,
      clearSession, retryOverBle, retrySamePrompt, consumePrefill, openApproval, confirmApproval,
      dismissApproval, submitReply, openShareContext, confirmShareContext,
      dismissShareContext, openFeedback, submitFeedback, dismissFeedback,
      openUploadTranscript, prepareTranscriptUpload, dismissUploadTranscript,
      refreshPending, approvePending, dismissPending,
    ],
  );
}

// Internal exports for tests -----------------------------------------------

export const _internal = {
  reducer,
  initialState,
  QUICK_START_SCENARIOS,
};

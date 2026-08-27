/**
 * bleAiClient — BLE transport for the Blox AI plugin (ported; `BleManagerWrapper` → any `BleCommandWriter`,
 * i.e. a `ResponseAssembler` bound to a Web Bluetooth `BleSession`). Behind `env.ENABLE_BLE_AI` until fula-ota
 * PR-E wires `ai/*` through bluetooth.py.
 *
 * BLE channel constraints — known degradation vs HTTP transport:
 *  - single-command-in-flight ("Another command is in progress") → typed `http-busy` (transient: false)
 *  - SSE-style events arrive as `ble_stream` frames relayed to cb.onEvent
 */
import type { RecommendedActionEvent, ExecutionResultEvent } from './bloxAiEvents';
import { parseBloxAiEvent } from './bloxAiEvents';
import { BleStreamTimeoutError, type BleCommandWriter } from './ble';
import type { AiCallbacks, AiClientError, HealthResult, SessionHandle, ExecuteResult, DiagBundle, DiagBundleResult } from './httpAiClient';

export const BLE_RUN_AI_TIMEOUT_MS = 300_000;
export const BLE_ONE_SHOT_TIMEOUT_MS = 30_000;
export const BLE_HEALTH_TIMEOUT_MS = 5_000;
export const BLE_DIAG_BUNDLE_TIMEOUT_MS = 45_000;

function bleError(kind: AiClientError['kind'], message: string, transient: boolean): AiClientError {
  return { kind, message, transient };
}

function bleBusyError(message: string = 'BLE channel busy; switch to LAN HTTP for multi-turn dialogue'): AiClientError {
  return { kind: 'http-busy', message, transient: false };
}

function networkError(message: string): AiClientError {
  return { kind: 'network', message, transient: true };
}

export class BleAiClient {
  public readonly peripheralId: string;
  private bleManager: BleCommandWriter;

  constructor(bleManager: BleCommandWriter, peripheralId: string) {
    if (!bleManager) {
      throw new Error('BleAiClient: bleManager is required');
    }
    if (!peripheralId) {
      throw new Error('BleAiClient: peripheralId is required');
    }
    this.bleManager = bleManager;
    this.peripheralId = peripheralId;
  }

  public async health(timeoutMs: number = BLE_HEALTH_TIMEOUT_MS): Promise<HealthResult> {
    const start = Date.now();
    try {
      const cmd = JSON.stringify({ command: 'ai/status' });
      await this.bleManager.writeToBLEAndWaitForResponse(cmd, this.peripheralId, undefined, undefined, timeoutMs);
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }

  public runAi(prompt: string, sessionId: string | undefined, cb: AiCallbacks): SessionHandle {
    const seedSession = sessionId ?? '';
    const body: Record<string, unknown> = { prompt };
    if (seedSession) body.session_id = seedSession;
    const cmd = JSON.stringify({ command: 'ai/troubleshoot', args: body });

    let resolvedSessionId = seedSession;
    let closed = false;

    const safeError = (err: AiClientError) => {
      if (closed) return;
      try {
        cb.onError?.(err);
      } catch {
        /* swallow */
      }
    };
    const safeComplete = () => {
      if (closed) return;
      try {
        cb.onComplete?.();
      } catch {
        /* swallow */
      }
    };

    const onStreamFrame = (framePayload: unknown) => {
      if (closed) return;
      const parsed = parseBloxAiEvent(framePayload);
      if (parsed.type === 'session_started') {
        resolvedSessionId = parsed.session_id;
      }
      try {
        cb.onEvent(parsed);
      } catch {
        /* swallow */
      }
    };

    this.bleManager
      .writeToBLEAndWaitForResponse(cmd, this.peripheralId, undefined, undefined, BLE_RUN_AI_TIMEOUT_MS, onStreamFrame)
      .then(() => {
        safeComplete();
        closed = true;
      })
      .catch((err: unknown) => {
        if (closed) return;
        if (err instanceof BleStreamTimeoutError) {
          safeError(networkError(`BLE stream timeout: ${err.message}`));
          closed = true;
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        if (/Another command is in progress/i.test(msg)) {
          safeError(bleBusyError(msg));
        } else {
          safeError(networkError(`BLE error: ${msg}`));
        }
        closed = true;
      });

    const cancel = () => {
      if (closed) return;
      closed = true;
      if (resolvedSessionId) {
        this.cancel(resolvedSessionId).catch(() => undefined);
      }
    };

    return {
      get sessionId() {
        return resolvedSessionId;
      },
      cancel,
    } as unknown as SessionHandle;
  }

  public async userReply(sessionId: string, questionId: string, replyText: string): Promise<void> {
    const cmd = JSON.stringify({
      command: 'ai/user-reply',
      args: { session_id: sessionId, question_id: questionId, reply_text: replyText },
    });
    try {
      await this.bleManager.writeToBLEAndWaitForResponse(cmd, this.peripheralId, undefined, undefined, BLE_ONE_SHOT_TIMEOUT_MS);
    } catch (e) {
      throw this.normalizeBleError(e);
    }
  }

  public async phoneContext(sessionId: string, context: Record<string, unknown>): Promise<void> {
    const cmd = JSON.stringify({ command: 'ai/phone-context', args: { session_id: sessionId, phone_context: context } });
    try {
      await this.bleManager.writeToBLEAndWaitForResponse(cmd, this.peripheralId, undefined, undefined, BLE_ONE_SHOT_TIMEOUT_MS);
    } catch (e) {
      throw this.normalizeBleError(e);
    }
  }

  public async executeAction(action: Pick<RecommendedActionEvent, 'action_id' | 'approval_token'>, securityCode?: string): Promise<ExecuteResult> {
    const args: Record<string, unknown> = { action_id: action.action_id, approval_token: action.approval_token };
    if (securityCode) args.security_code = securityCode;

    let raw: unknown;
    try {
      raw = await this.bleManager.writeToBLEAndWaitForResponse(
        JSON.stringify({ command: 'ai/execute', args }),
        this.peripheralId, undefined, undefined, BLE_ONE_SHOT_TIMEOUT_MS,
      );
    } catch (e) {
      return { ok: false, error: this.normalizeBleError(e) };
    }
    let payload: unknown;
    try {
      payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return { ok: false, error: bleError('sse-malformed', 'BLE execute-action body is not JSON', false) };
    }
    if (payload && typeof payload === 'object' && (payload as { type?: string }).type === 'execution_result') {
      return { ok: true, payload: payload as ExecutionResultEvent };
    }
    return { ok: false, error: bleError('sse-malformed', 'BLE execute-action returned no execution_result', false) };
  }

  public async cancel(sessionId: string): Promise<void> {
    try {
      await this.bleManager.writeToBLEAndWaitForResponse(
        JSON.stringify({ command: 'ai/cancel', args: { session_id: sessionId } }),
        this.peripheralId, undefined, undefined, 5_000,
      );
    } catch {
      // ignore
    }
  }

  public async fetchDiagBundle(): Promise<DiagBundleResult> {
    let raw: unknown;
    try {
      raw = await this.bleManager.writeToBLEAndWaitForResponse(
        JSON.stringify({ command: 'diag/bundle' }),
        this.peripheralId, undefined, undefined, BLE_DIAG_BUNDLE_TIMEOUT_MS,
      );
    } catch (e) {
      return { ok: false, error: this.normalizeBleError(e) };
    }
    let payload: unknown;
    try {
      payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return { ok: false, error: bleError('sse-malformed', 'BLE diag/bundle body is not JSON', false) };
    }
    if (payload && typeof payload === 'object' && 'tools' in (payload as Record<string, unknown>)) {
      return { ok: true, payload: payload as DiagBundle };
    }
    return { ok: false, error: bleError('sse-malformed', 'BLE diag/bundle returned no tools snapshot', false) };
  }

  private normalizeBleError(e: unknown): AiClientError {
    if (e instanceof BleStreamTimeoutError) {
      return networkError(`BLE stream timeout: ${e.message}`);
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (/Another command is in progress/i.test(msg)) {
      return bleBusyError(msg);
    }
    return networkError(`BLE error: ${msg}`);
  }
}

export type { BloxAiEvent, RecommendedActionEvent, ExecutionResultEvent } from './bloxAiEvents';

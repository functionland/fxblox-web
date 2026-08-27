/**
 * Console-mirroring policy of the ring-buffer logger.
 *
 * The protocol modules are verbatim ports of react-native-fula and log every rejection at `error`. On the web a
 * screen routinely queries before `newClient()` has finished, so those rejections carry `NOT_INITIALIZED` /
 * `CLIENT_CLOSED` — a precondition the caller handles, not a fault. Those must not reach `console.error`
 * (an ordinary page load would look broken, and the E2E suite asserts a clean console), while the ring buffer
 * must still record them at their original level so a diagnostics upload shows everything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDebugLog, createLogger, enableDebug, getDebugLog } from '../src/core/log.js';

const log = createLogger('fxblox');

describe('log console mirroring', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearDebugLog();
    enableDebug(false);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    enableDebug(false);
    clearDebugLog();
  });

  it('mirrors a genuine failure to console.error', () => {
    log.error('Error getInstallStatus:', Object.assign(new Error('boom'), { code: 'HTTP_ERROR' }));
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('does not raise a console error for a "called too early" precondition', () => {
    for (const code of ['NOT_INITIALIZED', 'CLIENT_CLOSED']) {
      log.error('Error getInstallStatus:', Object.assign(new Error('not ready'), { code }));
    }
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('still records preconditions in the ring buffer at error level', () => {
    log.error('Error getInstallStatus:', Object.assign(new Error('not ready'), { code: 'NOT_INITIALIZED' }));
    const entries = getDebugLog();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ level: 'error', scope: 'fxblox' });
    expect(entries[0]?.data).toMatchObject({ code: 'NOT_INITIALIZED' });
  });

  it('surfaces preconditions as warnings once debug logging is on', () => {
    enableDebug(true);
    log.error('Error getInstallStatus:', Object.assign(new Error('not ready'), { code: 'NOT_INITIALIZED' }));
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

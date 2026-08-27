import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/fula', () => ({ fula: { isReady: vi.fn(async () => true) }, blockchain: {}, fxblox: {}, identity: {}, configure: vi.fn() }));
vi.mock('@/platform/network', () => ({ isOnline: vi.fn(async () => true), onOnlineChange: () => () => undefined, connectionInfo: () => ({ online: true }), onConnectionChange: () => () => undefined }));

import { bloxStatusMonitor } from '../bloxStatusMonitor';
import { useBloxsStore } from '@/stores/useBloxsStore';
import { useSettingsStore } from '@/stores/useSettingsStore';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

let sweep: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  sweep = vi.fn(async () => {
    useBloxsStore.setState({ bloxsConnectionStatus: { A: 'CONNECTED', B: 'DISCONNECTED' } });
  });
  useBloxsStore.setState({ bloxs: { A: { peerId: 'A', name: 'Alpha' }, B: { peerId: 'B', name: 'Beta' } }, _isCheckingAllStatus: false, checkAllBloxStatus: sweep });
  useSettingsStore.setState({ bloxStatusCheckInterval: 0 });
  setVisibility('visible');
});

afterEach(() => {
  bloxStatusMonitor.stop();
  vi.useRealTimers();
});

describe('bloxStatusMonitor (foreground replacement for backgroundBloxCheck)', () => {
  test('start() reads the settings interval and fires checkAllBloxStatus on schedule', async () => {
    useSettingsStore.setState({ bloxStatusCheckInterval: 1 });
    bloxStatusMonitor.start();
    expect(bloxStatusMonitor.getState().intervalMinutes).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(bloxStatusMonitor.getState().lastResult).toEqual({ disconnected: ['Beta'] });
    expect(bloxStatusMonitor.getState().lastRunAt).not.toBeNull();
  });

  test('changing the setting reconfigures; 0 stops the timer', async () => {
    bloxStatusMonitor.start();
    useSettingsStore.setState({ bloxStatusCheckInterval: 2 });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(sweep).toHaveBeenCalledTimes(1);
    useSettingsStore.setState({ bloxStatusCheckInterval: 0 });
    await vi.advanceTimersByTimeAsync(240_000);
    expect(sweep).toHaveBeenCalledTimes(1);
  });

  test('a run while hidden is deferred until the tab is visible again', async () => {
    bloxStatusMonitor.start();
    setVisibility('hidden');
    await bloxStatusMonitor.runNow();
    expect(sweep).not.toHaveBeenCalled();
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(sweep).toHaveBeenCalledTimes(1);
  });

  test('runNow skips when a sweep is already running or there are no bloxes', async () => {
    useBloxsStore.setState({ _isCheckingAllStatus: true });
    await bloxStatusMonitor.runNow();
    expect(sweep).not.toHaveBeenCalled();
    useBloxsStore.setState({ _isCheckingAllStatus: false, bloxs: {} });
    await bloxStatusMonitor.runNow();
    expect(sweep).not.toHaveBeenCalled();
  });

  test('subscribers see running → idle transitions', async () => {
    const seen: boolean[] = [];
    const off = bloxStatusMonitor.subscribe((s) => seen.push(s.running));
    await bloxStatusMonitor.runNow();
    off();
    expect(seen).toEqual([true, false]);
  });
});

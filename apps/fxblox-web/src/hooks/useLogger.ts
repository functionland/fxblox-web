// Ported from apps/box/src/hooks/useLogger.ts — moment → Date, `__DEV__` → import.meta.env.DEV, and the
// production log/error sinks now feed the clientLogger ring buffer (debug banner "copy log").
import { useCallback, useEffect, useState } from 'react';
import { generateUniqueId } from '@/utils/uniqueId';
import { useSettingsStore, isDebugModeActive } from '@/stores/useSettingsStore';
import { appendLog } from '@/utils/clientLogger';

const days = (n: number): Date => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

export function useLogger() {
  const debugMode = useSettingsStore((state) => state.debugMode);
  const setDebugMode = useSettingsStore((state) => state.setDebugMode);
  const [isDebugModeEnable, setIsDebugModeEnable] = useState(false);

  useEffect(() => {
    setIsDebugModeEnable(isDebugModeActive(debugMode));
  }, [debugMode]);

  const log = useCallback(
    (...data: unknown[]) => {
      if (!import.meta.env.DEV && isDebugModeActive(debugMode)) {
        appendLog('log', ...data);
      }
    },
    [debugMode],
  );
  const error = useCallback(
    (...data: unknown[]) => {
      if (!import.meta.env.DEV && isDebugModeActive(debugMode)) {
        appendLog('error', ...data);
      }
    },
    [debugMode],
  );
  const toggleDebugMode = () => {
    if (debugMode && new Date(debugMode.endDate).getTime() > Date.now()) {
      // Disable debug mode
      setDebugMode(debugMode?.uniqueId || generateUniqueId(), days(-2));
    } else {
      // Enable debug mode
      setDebugMode(debugMode?.uniqueId || generateUniqueId(), days(2));
    }
  };
  return {
    log: import.meta.env.DEV ? () => null : log,
    logError: import.meta.env.DEV ? () => null : error,
    toggleDebugMode,
    isDebugModeEnable,
  };
}

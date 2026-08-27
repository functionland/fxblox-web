import { useEffect, useRef } from 'react';

/** Verbatim port of libs/component-library/src/lib/toast/hooks/useInterval.ts. */
export function useInterval(callback: () => void, delay?: number | null): void {
  const savedCallback = useRef<(() => void) | undefined>(undefined);

  // Save the latest callback.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval.
  useEffect(() => {
    function tick() {
      savedCallback.current?.();
    }
    if (delay) {
      const id = setInterval(tick, delay);
      return () => clearInterval(id);
    }
    return undefined;
  }, [delay]);
}

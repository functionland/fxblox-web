import { useCallback, useEffect, useMemo, useRef } from 'react';
import type React from 'react';

export interface UseLongPressOptions<E extends HTMLElement = HTMLElement> {
  /** ms before `onLongPress` fires (RN `delayLongPress` default). */
  delay?: number;
  /** Fired on a normal click that was NOT a long press. */
  onPress?: (e: React.MouseEvent<E>) => void;
  onPressStart?: (e: React.PointerEvent<E>) => void;
  onPressEnd?: (e: React.PointerEvent<E>) => void;
  /** Pointer movement (px) that cancels the pending long press. */
  moveThreshold?: number;
  disabled?: boolean;
  /** Suppress the touch context menu while a long-press handler is attached (default true). */
  preventContextMenu?: boolean;
}

export interface LongPressHandlers<E extends HTMLElement = HTMLElement> {
  onPointerDown: (e: React.PointerEvent<E>) => void;
  onPointerMove: (e: React.PointerEvent<E>) => void;
  onPointerUp: (e: React.PointerEvent<E>) => void;
  onPointerLeave: (e: React.PointerEvent<E>) => void;
  onPointerCancel: (e: React.PointerEvent<E>) => void;
  onClick: (e: React.MouseEvent<E>) => void;
  onContextMenu: (e: React.MouseEvent<E>) => void;
}

/**
 * RN `onLongPress` on the web via pointer events. Spread the returned handlers onto the element.
 * A click that follows a fired long press is swallowed (RN semantics: onPress does not fire after onLongPress).
 */
export function useLongPress<E extends HTMLElement = HTMLElement>(
  onLongPress: ((e: React.PointerEvent<E>) => void) | undefined,
  options: UseLongPressOptions<E> = {},
): LongPressHandlers<E> {
  const {
    delay = 500,
    onPress,
    onPressStart,
    onPressEnd,
    moveThreshold = 10,
    disabled = false,
    preventContextMenu = true,
  } = options;

  const timer = useRef<number | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const longFired = useRef(false);
  const latest = useRef({ onLongPress, onPress, onPressStart, onPressEnd });
  latest.current = { onLongPress, onPress, onPressStart, onPressEnd };

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  return useMemo<LongPressHandlers<E>>(
    () => ({
      onPointerDown: (e) => {
        if (disabled) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        longFired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        latest.current.onPressStart?.(e);
        if (latest.current.onLongPress) {
          clear();
          timer.current = window.setTimeout(() => {
            timer.current = null;
            longFired.current = true;
            latest.current.onLongPress?.(e);
          }, delay);
        }
      },
      onPointerMove: (e) => {
        if (timer.current === null) return;
        const dist = Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y);
        if (dist > moveThreshold) clear();
      },
      onPointerUp: (e) => {
        clear();
        latest.current.onPressEnd?.(e);
      },
      onPointerLeave: (e) => {
        clear();
        latest.current.onPressEnd?.(e);
      },
      onPointerCancel: (e) => {
        clear();
        latest.current.onPressEnd?.(e);
      },
      onClick: (e) => {
        if (disabled) return;
        if (longFired.current) {
          longFired.current = false;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        latest.current.onPress?.(e);
      },
      onContextMenu: (e) => {
        if (preventContextMenu && latest.current.onLongPress) e.preventDefault();
      },
    }),
    [clear, delay, disabled, moveThreshold, preventContextMenu],
  );
}

/* DOM rewrite of libs/component-library/src/lib/toast/components/Toast.tsx.
   Queue semantics live in ToastProvider (verbatim); this renderer replaces Reanimated/GestureHandler with a
   persistent `role="status"` live region portalled to <body>, a CSS transform transition, pointer swipe-up
   to dismiss, Escape, and a per-toast auto-hide timer (paused while the toast is focused or being dragged). */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FxErrorIcon } from '../../../icons/generated/FxErrorIcon.js';
import { FxInfoIcon } from '../../../icons/generated/FxInfoIcon.js';
import { FxSuccessIcon } from '../../../icons/generated/FxSuccessIcon.js';
import { FxWarningIcon } from '../../../icons/generated/FxWarningIcon.js';
import { cn } from '../../../utils/cn.js';
import useToastContext from '../hooks/useToastContext.js';
import type { BaseToastProps, ToastComponentsConfig, ToastProps } from '../types.toast.js';
import BaseToast from './BaseToast.js';

const defaultComponentsConfig: ToastComponentsConfig = {
  success: (props: BaseToastProps) => (
    <BaseToast localType={'success'} iconElement={<FxSuccessIcon />} {...props} />
  ),
  warning: (props: BaseToastProps) => (
    <BaseToast localType={'warning'} iconElement={<FxWarningIcon />} {...props} />
  ),
  error: (props: BaseToastProps) => (
    <BaseToast localType={'error'} iconElement={<FxErrorIcon />} {...props} />
  ),
  info: (props: BaseToastProps) => (
    <BaseToast localType={'info'} iconElement={<FxInfoIcon />} {...props} />
  ),
};

const SWIPE_DISMISS_PX = 30;

const ToasterInternal: React.FC = () => {
  const { activeToast, defaults, customToasts, hideToast } = useToastContext();
  const {
    onShow: defaultOnShow,
    onHide: defaultOnHide,
    transitionDuration: defaultTransition,
  } = defaults;

  const [currentToast, setCurrentToast] = useState<ToastProps | null>(activeToast);
  const [isVisible, setIsVisible] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  const exitTimer = useRef<number | null>(null);

  const toastTypes: ToastComponentsConfig = { ...defaultComponentsConfig, ...customToasts };

  const topOffset = currentToast?.topOffset ?? defaults.topOffset;
  const transitionDuration = currentToast?.transitionDuration ?? defaultTransition;
  const exitDuration = transitionDuration.exit;

  React.useEffect(() => {
    const onShow = activeToast?.onShow ?? defaultOnShow;

    if (activeToast) {
      if (exitTimer.current !== null) {
        window.clearTimeout(exitTimer.current);
        exitTimer.current = null;
      }
      setIsVisible(true);
      setDragY(0);
      if (currentToast !== activeToast) {
        setCurrentToast(activeToast);
      }
      onShow?.(activeToast);
    } else if (currentToast) {
      setIsVisible(false);
      exitTimer.current = window.setTimeout(() => {
        exitTimer.current = null;
        setCurrentToast(null);
      }, exitDuration);
      defaultOnHide?.(currentToast);
    }
  }, [activeToast, currentToast, defaultOnShow, defaultOnHide, exitDuration]);

  React.useEffect(
    () => () => {
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    },
    [],
  );

  const autoHideDuration = currentToast?.autoHideDuration ?? defaults.autoHideDuration;

  // One timer per toast (re-armed when the toast changes); cancelled while dragging / focused.
  React.useEffect(() => {
    if (!currentToast || !isVisible || isInteracting || !autoHideDuration) return;
    const id = window.setTimeout(hideToast, autoHideDuration);
    return () => window.clearTimeout(id);
  }, [currentToast, isVisible, isInteracting, autoHideDuration, hideToast]);

  const toastType = currentToast?.type ?? defaults.type;
  const onPress = currentToast?.onPress ?? defaults.onPress;
  const onPressCallback = useMemo(() => {
    if (!onPress) {
      return undefined;
    }
    return (toast: ToastProps) => {
      hideToast();
      onPress?.(toast);
    };
  }, [hideToast, onPress]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragStart.current = e.clientY;
    setIsInteracting(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStart.current === null) return;
    setDragY(Math.min(e.clientY - dragStart.current, 20));
  }, []);

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragStart.current === null) return;
      const dy = e.clientY - dragStart.current;
      dragStart.current = null;
      setDragY(0);
      setIsInteracting(false);
      if (dy < -SWIPE_DISMISS_PX) hideToast();
    },
    [hideToast],
  );

  const renderContent = (): React.ReactElement | null => {
    const toastComponent = toastTypes[toastType];
    if (!toastComponent) {
      return null;
    }
    return toastComponent({
      ...defaults,
      ...currentToast,
      onClose: hideToast,
      onPress: onPressCallback,
    });
  };

  if (typeof document === 'undefined') return null;

  // The live region is always mounted so screen readers announce toasts inserted into it.
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="fx-toast-viewport"
      style={{ paddingTop: topOffset }}
    >
      {currentToast && (
        <div
          data-testid="fx-toast"
          data-type={toastType}
          data-visible={isVisible}
          className={cn('fx-toast', isInteracting && 'cursor-grabbing')}
          style={{
            transform: isVisible
              ? `translateY(${dragY}px)`
              : `translateY(calc(-100% - ${topOffset}px))`,
            transitionDuration: isInteracting
              ? '0ms'
              : `${isVisible ? transitionDuration.enter : transitionDuration.exit}ms`,
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onFocus={() => setIsInteracting(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIsInteracting(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') hideToast();
          }}
        >
          {renderContent()}
        </div>
      )}
    </div>,
    document.body,
  );
};

export const Toast = ToasterInternal;

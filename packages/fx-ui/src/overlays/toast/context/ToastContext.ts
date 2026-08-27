/* Verbatim port of libs/component-library/src/lib/toast/context/ToastContext.ts */
import { createContext } from 'react';
import type { IToastContext } from '../types.toast.js';

export const toastDefaults = {
  type: 'info',
  autoHideDuration: 5000,
  transitionDuration: { enter: 250, exit: 100 },
  height: 60,
  topOffset: 40,
} as const;

export const defaultContext: IToastContext = {
  defaults: toastDefaults,
  customToasts: {},
  clearToastQueue: () => {},
  toasts: [],
  activeToast: toastDefaults,
  hideToast: () => {},
  queueToast: () => {},
  showToast: () => {},
};

const ToastContext = createContext<IToastContext>(defaultContext);

ToastContext.displayName = 'ToastContext';

export { ToastContext };

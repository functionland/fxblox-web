/* Verbatim port of libs/component-library/src/lib/toast/hooks/useToast.ts */
import { useMemo } from 'react';
import type { UseToastHook } from '../types.toast.js';
import useToastContext from './useToastContext.js';

const useToast = (): UseToastHook => {
  const context = useToastContext();
  return useMemo(
    () => ({
      showToast: context.showToast,
      queueToast: context.queueToast,
      hideToast: context.hideToast,
      clearToastQueue: context.clearToastQueue,
    }),
    [context.clearToastQueue, context.hideToast, context.queueToast, context.showToast],
  );
};

export default useToast;

/* Verbatim port of libs/component-library/src/lib/toast/hooks/useToastContext.ts */
import React from 'react';
import { ToastContext } from '../context/index.js';
import type { IToastContext } from '../types.toast.js';

const useToastContext = (): IToastContext => {
  const context = React.useContext<IToastContext>(ToastContext);
  if (context === undefined) {
    throw new Error('useToastContext must be used within a ToastProvider');
  }
  return context;
};

export default useToastContext;

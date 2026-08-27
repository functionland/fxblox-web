import { createContext, useContext } from 'react';

export interface FxSheetContextValue {
  /** Closes the nearest FxSheet (no-op outside one). */
  close: () => void;
  isOpen: boolean;
  /** true when rendered inside an FxSheet. */
  inSheet: boolean;
}

const noop = () => {};

export const FxSheetContext = createContext<FxSheetContextValue>({
  close: noop,
  isOpen: false,
  inSheet: false,
});

/** `useFxSheet().close()` from anywhere inside a sheet's children (mobile `useBottomSheetModal` equivalent). */
export function useFxSheet(): FxSheetContextValue {
  return useContext(FxSheetContext);
}

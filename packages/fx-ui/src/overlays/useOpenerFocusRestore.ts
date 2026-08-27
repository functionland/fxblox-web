import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Radix modal dialogs move focus back to their `Trigger` on close. Overlays opened imperatively
 * (`ref.present()`, `useConfirm()`, controlled `open`) have no trigger, so focus would fall to `<body>`.
 * This captures the element focused when `isOpen` flips to true and restores it through Radix's
 * `onCloseAutoFocus` (forwarded by vaul as well).
 *
 * The capture runs in a layout effect: React runs every layout effect of a commit before any passive
 * effect, and Radix FocusScope moves focus into the dialog from a passive `useEffect`, so at this point
 * `document.activeElement` is still the opener.
 */
export function useOpenerFocusRestore(isOpen: boolean): (event: Event) => void {
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  useLayoutEffect(() => {
    if (isOpen && !wasOpen.current) {
      const el = document.activeElement;
      opener.current = el instanceof HTMLElement && el !== document.body ? el : null;
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  return useCallback((event: Event) => {
    const el = opener.current;
    opener.current = null;
    if (el && el.isConnected) {
      event.preventDefault();
      el.focus();
    }
  }, []);
}

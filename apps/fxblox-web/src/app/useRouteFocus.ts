/**
 * Focus management on client-side navigation: move focus to the shell's `<main tabindex="-1">` when the pathname
 * changes (not on the initial load, where the browser's own focus handling applies) and reset the scroll position.
 * Screens that want a heading focused instead can call `focus()` themselves after this runs.
 */
import { useEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router';

export function useRouteFocus(target: RefObject<HTMLElement | null>): void {
  const { pathname } = useLocation();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = target.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, left: 0 });
  }, [pathname, target]);
}

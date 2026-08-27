import { useEffect, type RefObject } from 'react';
import { useReducedMotion } from '../../hooks/useMediaQuery.js';
import { useFxTheme } from '../../theme/ThemeProvider.js';
import { isColorToken } from '../../theme/tokens.js';

/**
 * Runs a Web Animations API animation on `ref` (looping colour/opacity blinks with distinct on/off
 * durations, which CSS keyframes cannot express with dynamic offsets). No-op under
 * `prefers-reduced-motion` or where `Element.animate` is missing (jsdom).
 */
export function useWebAnimation(
  ref: RefObject<HTMLElement | null>,
  keyframes: Keyframe[] | null,
  options: KeyframeAnimationOptions,
): void {
  const reduced = useReducedMotion();
  const optionsKey = JSON.stringify(options);
  const framesKey = keyframes ? JSON.stringify(keyframes) : null;
  useEffect(() => {
    const el = ref.current;
    if (!el || !framesKey || reduced || typeof el.animate !== 'function') return;
    const anim = el.animate(
      JSON.parse(framesKey) as Keyframe[],
      JSON.parse(optionsKey) as KeyframeAnimationOptions,
    );
    return () => anim.cancel();
  }, [ref, framesKey, optionsKey, reduced]);
}

/** Token → hex (for WAAPI keyframes, which cannot reliably interpolate `var()`), else pass-through. */
export function useResolvedColor(value: string): string {
  const { colors } = useFxTheme();
  return isColorToken(value) ? colors[value] : value;
}

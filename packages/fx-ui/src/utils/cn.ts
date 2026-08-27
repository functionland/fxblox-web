import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { textVariants } from '../theme/tokens.js';

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      // fx-text-* utilities set font-size (+ family/weight/line-height): let them conflict with text-* sizes.
      'font-size': [{ 'fx-text': Object.keys(textVariants) }],
      rounded: [{ rounded: ['fx-s', 'fx-m', 'fx-l'] }],
    },
  },
});

/** clsx + tailwind-merge. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

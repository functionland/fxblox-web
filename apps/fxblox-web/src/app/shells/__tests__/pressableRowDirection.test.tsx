/**
 * `.fx-pressable` sets `flex-direction: column` for React Native parity (RN's <Pressable> is a column box).
 * Tailwind's `flex` / `inline-flex` utilities only set `display`, so a call site that wants a ROW must say
 * `flex-row` explicitly — otherwise the children stack vertically.
 *
 * That is how the desktop sidebar broke: each nav item rendered its icon above its label, and because the item
 * has a fixed `h-11`, the overflow visually collided with the item below it. jsdom does not apply the stylesheet
 * so a rendering test cannot catch it; this asserts on the class list instead, which is what actually decides.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** Call sites that lay their children out horizontally and therefore must opt into `flex-row`. */
const ROW_PRESSABLES: Array<{ file: string; what: string }> = [
  { file: '../Sidebar.tsx', what: 'sidebar nav item (icon + label)' },
  { file: '../../../components/LanguageSelector.tsx', what: 'language selector (code + chevron)' },
  { file: '../../../screens/Settings/SettingsMenu.tsx', what: 'settings menu row (label + chevron)' },
];

describe('fx-pressable call sites that need a row', () => {
  for (const { file, what } of ROW_PRESSABLES) {
    it(`${what} sets flex-row explicitly`, () => {
      const src = read(file);
      // Every className string that turns an fx-pressable into a flex container must also pick a direction.
      const flexPressables = src
        .split('\n')
        .filter((line) => line.includes('fx-pressable') && /\b(inline-flex|flex)\b/.test(line));

      expect(flexPressables.length, `no fx-pressable flex class found in ${file}`).toBeGreaterThan(0);
      for (const line of flexPressables) {
        expect(
          /\bflex-(row|col)\b/.test(line),
          `${file}: this fx-pressable is a flex container but never states its direction, so it inherits ` +
            `column from .fx-pressable:\n  ${line.trim()}`,
        ).toBe(true);
      }
    });
  }
});

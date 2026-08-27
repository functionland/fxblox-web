/**
 * i18n resources: the mobile JSON (`translation.json`, `tasks.json`) merged with the per-route-group files
 * (`shell`, `setup`, `main`, `settings`) into the single `translation` namespace. Each group file owns a distinct
 * top-level key, so the merge is conflict-free; a deep merge is used anyway so a group may extend an existing
 * mobile block. `zh` falls back to `en` at runtime (i18next `fallbackLng`).
 */
import enTranslation from './locales/en/translation.json';
import enTasks from './locales/en/tasks.json';
import enShell from './locales/en/shell.json';
import enSetup from './locales/en/setup.json';
import enMain from './locales/en/main.json';
import enSettings from './locales/en/settings.json';
import zhTranslation from './locales/zh/translation.json';
import zhShell from './locales/zh/shell.json';
import zhSetup from './locales/zh/setup.json';
import zhMain from './locales/zh/main.json';
import zhSettings from './locales/zh/settings.json';

export type TranslationTree = { [key: string]: string | TranslationTree };

const isTree = (v: unknown): v is TranslationTree =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function deepMerge(...parts: unknown[]): TranslationTree {
  const out: TranslationTree = {};
  for (const part of parts) {
    if (!isTree(part)) continue;
    for (const [key, value] of Object.entries(part)) {
      const existing = out[key];
      out[key] =
        isTree(value) && isTree(existing)
          ? deepMerge(existing, value)
          : (value as string | TranslationTree);
    }
  }
  return out;
}

export const GROUP_FILES = ['shell', 'setup', 'main', 'settings'] as const;

export const resources = {
  en: {
    translation: deepMerge(enTranslation, enShell, enSetup, enMain, enSettings),
    tasks: enTasks as TranslationTree,
  },
  zh: {
    translation: deepMerge(zhTranslation, zhShell, zhSetup, zhMain, zhSettings),
    tasks: enTasks as TranslationTree,
  },
} as const;

export type Resources = typeof resources;

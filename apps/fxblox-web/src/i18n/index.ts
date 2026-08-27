/**
 * i18n — the mobile JSON resources (`en/translation.json`, `en/tasks.json`, `zh/translation.json`) merged with
 * the web route-group files (`shell`, `setup`, `main`, `settings`) in `./resources.ts`.
 * Persisted choice lives in `localStorage.userLanguage`; first run uses `navigator.language`.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from './resources';

export { resources } from './resources';

export const FALLBACK_LANGUAGE = 'en';
export const SUPPORTED_LANGUAGES = ['en', 'zh'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
const LANGUAGE_KEY = 'userLanguage';

function isSupported(lng: string | null | undefined): lng is SupportedLanguage {
  return !!lng && (SUPPORTED_LANGUAGES as readonly string[]).includes(lng);
}

export function getStoredLanguage(): SupportedLanguage | null {
  try {
    const v = localStorage.getItem(LANGUAGE_KEY);
    return isSupported(v) ? v : null;
  } catch {
    return null;
  }
}

export function getDeviceLanguage(): SupportedLanguage {
  try {
    const candidates = typeof navigator !== 'undefined' ? [navigator.language, ...(navigator.languages ?? [])] : [];
    for (const c of candidates) {
      const code = (c ?? '').split(/[-_]/)[0]?.toLowerCase();
      if (isSupported(code)) return code;
    }
  } catch {
    /* ignore */
  }
  return FALLBACK_LANGUAGE;
}

export function resolveInitialLanguage(): SupportedLanguage {
  return getStoredLanguage() ?? getDeviceLanguage();
}

const initial = resolveInitialLanguage();

void i18n.use(initReactI18next).init({
  resources,
  lng: initial,
  fallbackLng: FALLBACK_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  ns: ['translation', 'tasks'],
  defaultNS: 'translation',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

if (typeof document !== 'undefined') document.documentElement.lang = initial;
if (!getStoredLanguage()) {
  try {
    localStorage.setItem(LANGUAGE_KEY, initial);
  } catch {
    /* ignore */
  }
}

export const changeLanguage = async (language: string): Promise<boolean> => {
  if (!isSupported(language)) return false;
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    /* ignore */
  }
  try {
    await i18n.changeLanguage(language);
    if (typeof document !== 'undefined') document.documentElement.lang = language;
    return true;
  } catch (error) {
    console.error('Failed to set language:', error);
    return false;
  }
};

export default i18n;

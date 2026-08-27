/**
 * Typed view of the VITE_* build variables (see .env.example). Everything has a production default so the
 * app builds with no .env at all.
 */
const flag = (value: string | undefined, fallback = false): boolean =>
  value === undefined || value === '' ? fallback : /^(1|true|yes|on)$/i.test(value);

const list = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const env = {
  /** Blox hotspot WAP API (go-fula `:3500`). */
  BLOX_AP_URL: import.meta.env.VITE_BLOX_AP_URL ?? 'http://10.42.0.1:3500',
  DISCOVERY_URL: import.meta.env.VITE_DISCOVERY_URL ?? 'https://discovery.fula.network',
  POOLS_URL: import.meta.env.VITE_POOLS_URL ?? 'https://pools.fx.land',
  AI_TRAINING_URL: import.meta.env.VITE_AI_TRAINING_URL ?? 'https://ai-training.fx.land',
  REOWN_PROJECT_ID: import.meta.env.VITE_REOWN_PROJECT_ID ?? '94a4ca39db88ee0be8f6df95fdfb560a',
  ENABLE_BLE_AI: flag(import.meta.env.VITE_ENABLE_BLE_AI),
  ENABLE_BLE_CHUNKED_WRITES: flag(import.meta.env.VITE_ENABLE_BLE_CHUNKED_WRITES),
  ENABLE_BLOX_LOGS: flag(import.meta.env.VITE_ENABLE_BLOX_LOGS),
  ENABLE_GALLERY: flag(import.meta.env.VITE_ENABLE_GALLERY, import.meta.env.DEV),
  FORCE_BLE: flag(import.meta.env.VITE_FORCE_BLE),
  RELAY_WT_ADDRS: list(import.meta.env.VITE_RELAY_WT_ADDRS),
  BASE: import.meta.env.BASE_URL ?? '/',
  DEV: import.meta.env.DEV,
  APP_VERSION: __APP_VERSION__,
  GIT_SHA: __GIT_SHA__,
  BUILD_TIME: __BUILD_TIME__,
} as const;

export type Env = typeof env;

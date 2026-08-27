/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

interface ImportMetaEnv {
  readonly VITE_BLOX_AP_URL?: string;
  readonly VITE_DISCOVERY_URL?: string;
  readonly VITE_POOLS_URL?: string;
  readonly VITE_AI_TRAINING_URL?: string;
  readonly VITE_REOWN_PROJECT_ID?: string;
  readonly VITE_ENABLE_BLE_AI?: string;
  readonly VITE_ENABLE_BLE_CHUNKED_WRITES?: string;
  readonly VITE_ENABLE_BLOX_LOGS?: string;
  readonly VITE_ENABLE_GALLERY?: string;
  readonly VITE_FORCE_BLE?: string;
  readonly VITE_RELAY_WT_ADDRS?: string;
  readonly VITE_BASE?: string;
  readonly VITE_FAKE_BLOX_STATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
declare const __GIT_SHA__: string;
declare const __BUILD_TIME__: string;

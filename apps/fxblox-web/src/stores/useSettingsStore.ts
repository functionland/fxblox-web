// Ported from apps/box/src/stores/useSettingsStore.ts — `useColorScheme` → platform/theme, moment → Date,
// storage → shared IDB adapter. `bloxStatusCheckInterval` drives services/bloxStatusMonitor (foreground).
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateUniqueId } from '@/utils/uniqueId';
import type { SupportedChain } from '@/contracts/types';
import { BASE_AUTH_CODE, DEFAULT_CHAIN } from '@/contracts/config';
import { useSystemColorScheme, applyThemeToDocument, getSystemColorScheme, type ColorScheme } from '@/platform/theme';
import { PERSIST_KEYS, rehydrateHandler, zustandIdbStorage } from './persist/idbStorage';

export type { ColorScheme };

interface ChainSettings {
  selectedChain: SupportedChain;
  baseAuthorized: boolean;
  setSelectedChain: (chain: SupportedChain) => void;
  authorizeBase: (code: string) => boolean;
  resetBaseAuthorization: () => void;
}

export interface DebugMode {
  /** Date on write; an ISO string after a persist round-trip — always wrap in `new Date()` when reading. */
  endDate: Date | string;
  uniqueId: string;
}

export interface ModeSlice extends ChainSettings {
  _hasHydrated: boolean;
  setHasHydrated: (isHydrated: boolean) => void;
  isAuto: boolean;
  colorScheme: ColorScheme;
  debugMode?: DebugMode;
  bloxStatusCheckInterval: number; // 0=disabled, 480=8h, 1440=24h (in minutes)
  /** Web: whether the user asked to skip LAN HTTP and use Web Bluetooth for setup ("Prefer Bluetooth"). */
  preferBluetooth: boolean;
  toggleIsAuto: () => void;
  setColorScheme: (colorScheme: ColorScheme) => void;
  setDebugMode: (uniqueId: string, endDate: Date) => void;
  setBloxStatusCheckInterval: (interval: number) => void;
  setPreferBluetooth: (value: boolean) => void;
}

const daysFromNow = (days: number): Date => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

export const useSettingsStore = create<ModeSlice>()(
  persist(
    (set, get) => ({
      _hasHydrated: false,
      setHasHydrated: (isHydrated) => {
        set({ _hasHydrated: isHydrated });
      },
      isAuto: true,
      colorScheme: 'dark',
      debugMode: {
        uniqueId: generateUniqueId(),
        endDate: daysFromNow(-2),
      },
      bloxStatusCheckInterval: 0,
      preferBluetooth: false,
      // Chain settings
      selectedChain: DEFAULT_CHAIN,
      baseAuthorized: false,
      setSelectedChain: (chain: SupportedChain) => {
        // Only allow Base if authorized
        if (chain === 'base' && !get().baseAuthorized) {
          return;
        }
        set({ selectedChain: chain });
      },
      authorizeBase: (code: string) => {
        if (code === BASE_AUTH_CODE) {
          set({ baseAuthorized: true });
          return true;
        }
        return false;
      },
      resetBaseAuthorization: () => {
        set({
          baseAuthorized: false,
          selectedChain: get().selectedChain === 'base' ? 'skale' : get().selectedChain,
        });
      },
      setColorScheme: (colorScheme: ColorScheme) => set(() => ({ colorScheme })),
      toggleIsAuto: () => set((state) => ({ isAuto: !state.isAuto })),
      setDebugMode: (uniqueId, endDate) => {
        set({ debugMode: { endDate, uniqueId } });
      },
      setBloxStatusCheckInterval: (interval: number) => {
        set({ bloxStatusCheckInterval: interval });
      },
      setPreferBluetooth: (value: boolean) => set({ preferBluetooth: value }),
    }),
    {
      name: PERSIST_KEYS.settings,
      storage: zustandIdbStorage<Partial<ModeSlice>>(),
      onRehydrateStorage: rehydrateHandler<ModeSlice>(PERSIST_KEYS.settings, () => useSettingsStore.setState({ _hasHydrated: true })),
      partialize: (state): Partial<ModeSlice> => ({
        isAuto: state.isAuto,
        colorScheme: state.colorScheme,
        debugMode: state.debugMode,
        selectedChain: state.selectedChain,
        baseAuthorized: state.baseAuthorized,
        bloxStatusCheckInterval: state.bloxStatusCheckInterval,
        preferBluetooth: state.preferBluetooth,
      }),
    },
  ),
);

/** Resolved mode: system scheme when `isAuto`, else the stored choice. */
export const resolveColorMode = (state: Pick<ModeSlice, 'isAuto' | 'colorScheme'>, system: ColorScheme = getSystemColorScheme()): ColorScheme =>
  state.isAuto ? system : state.colorScheme;

/**
 * Custom hook to get the current color mode.
 */
export const useColorMode = (): ColorScheme => {
  const systemColorScheme = useSystemColorScheme();
  const isAuto = useSettingsStore((state) => state.isAuto);
  const colorScheme = useSettingsStore((state) => state.colorScheme);
  return isAuto ? systemColorScheme : colorScheme;
};

/** Mirror the resolved theme onto `<html data-theme>` + `localStorage['fx.theme']` (boot-time paint). */
export function startThemeSync(): () => void {
  const apply = () => {
    const s = useSettingsStore.getState();
    applyThemeToDocument(resolveColorMode(s), s.isAuto);
  };
  apply();
  return useSettingsStore.subscribe((s, prev) => {
    if (s.isAuto !== prev.isAuto || s.colorScheme !== prev.colorScheme || s._hasHydrated !== prev._hasHydrated) apply();
  });
}

export const isDebugModeActive = (debugMode: DebugMode | undefined): boolean =>
  !!debugMode && new Date(debugMode.endDate).getTime() >= Date.now();

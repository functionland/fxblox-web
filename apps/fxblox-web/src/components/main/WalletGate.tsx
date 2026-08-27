/**
 * WalletGate — lazily loads the Reown AppKit chunk (`app/bootstrap.loadWallet` → `initAppKit`) before any
 * subtree that uses the wallet hooks mounts. AppKit's React hooks (`useAppKit`, `useAppKitState`,
 * `useWalletInfo`, `useAppKitNetwork`) throw "Please call createAppKit before…" when the modal was never
 * created, and the data layer keeps AppKit out of the eager shell on purpose, so every wallet-dependent
 * component (WalletDetails, WalletNotification, EarningCard, TasksCard, PoolCard) renders behind this gate.
 *
 * The gate is a module-level singleton (one `initAppKit` per page); the theme follows `useColorMode()`.
 */
import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxSpinner, FxText } from '@functionland/fx-ui';
import { loadWallet } from '@/app/bootstrap';
import { useColorMode, type ColorScheme } from '@/stores/useSettingsStore';

export type WalletReadyState = 'idle' | 'loading' | 'ready' | 'error';

let state: WalletReadyState = 'idle';
let lastError: Error | null = null;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function setState(next: WalletReadyState, error: Error | null = null): void {
  state = next;
  lastError = error;
  emit();
}

/** Idempotent: resolves once AppKit is created; rejects (and allows a retry) on a chunk / init failure. */
export function ensureWalletReady(themeMode: ColorScheme): Promise<void> {
  if (state === 'ready') return Promise.resolve();
  if (pending) return pending;
  setState('loading');
  pending = Promise.resolve()
    .then(() => loadWallet())
    .then((m) => {
      m.initAppKit({ themeMode });
      setState('ready');
    })
    .catch((e: unknown) => {
      const err = e instanceof Error ? e : new Error(String(e));
      setState('error', err);
      throw err;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function walletReadyState(): WalletReadyState {
  return state;
}

export function walletReadyError(): Error | null {
  return lastError;
}

/** Test hook — forget the singleton. */
export function _resetWalletGateForTests(next: WalletReadyState = 'idle'): void {
  state = next;
  lastError = null;
  pending = null;
  emit();
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function useWalletReady(): WalletReadyState {
  return useSyncExternalStore(subscribe, walletReadyState, walletReadyState);
}

export interface WalletGateProps {
  children: ReactNode;
  /** Rendered while the chunk loads (default: a spinner row). */
  fallback?: ReactNode;
  /**
   * Wraps the loading AND error states — not the children. A whole-screen gate uses this to keep its page
   * chrome (title, back button) on screen while the ~3.8 MB wallet chunk loads and if it fails, instead of
   * blanking the route. It wraps only the pending states so the screen still supplies its own chrome once
   * ready, and so the gate itself stays mounted throughout (its theme-sync effect must keep running).
   */
  wrapPending?: (node: ReactNode) => ReactNode;
  /** Render nothing at all until ready (banners / notifications that should not flash a spinner). */
  silent?: boolean;
  testID?: string;
}

export function WalletGate({
  children,
  fallback,
  wrapPending,
  silent = false,
  testID,
}: WalletGateProps) {
  const { t } = useTranslation();
  const mode = useColorMode();
  const status = useWalletReady();

  useEffect(() => {
    void ensureWalletReady(mode).catch(() => undefined);
    // Init once; later theme changes are mirrored by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;
    void Promise.resolve()
      .then(() => loadWallet())
      .then((m) => m.setAppKitTheme(mode))
      .catch(() => undefined);
  }, [mode, status]);

  const retry = useCallback(() => {
    void ensureWalletReady(mode).catch(() => undefined);
  }, [mode]);

  const wrap = (node: ReactNode) => <>{wrapPending ? wrapPending(node) : node}</>;

  if (status === 'ready') return <>{children}</>;
  if (status === 'error') {
    if (silent) return null;
    return wrap(
      <FxBox
        role="alert"
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        gap="12"
        padding="12"
        borderRadius="m"
        backgroundColor="backgroundSecondary"
        testID={testID ? `${testID}-error` : 'wallet-gate-error'}
      >
        <FxText variant="bodySmallRegular" color="errorBase">
          {t('main.common.walletNotReady')}
        </FxText>
        <FxButton size="small" variant="inverted" onPress={retry}>
          {t('main.common.retry')}
        </FxButton>
      </FxBox>
    );
  }
  if (silent) return null;
  if (fallback !== undefined) return wrap(fallback);
  return wrap(
    <FxBox
      alignItems="center"
      justifyContent="center"
      paddingVertical="16"
      testID={testID ? `${testID}-loading` : 'wallet-gate-loading'}
    >
      <FxSpinner label={t('main.common.walletLoading')} />
    </FxBox>
  );
}

export default WalletGate;

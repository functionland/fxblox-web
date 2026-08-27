import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { FxButton } from '../../components/button/FxButton.js';
import { cn } from '../../utils/cn.js';
import { useOpenerFocusRestore } from '../useOpenerFocusRestore.js';

export interface ConfirmOptions {
  title: ReactNode;
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** Red confirm button (delete / reset / log out). */
  destructive?: boolean;
}

export interface AlertOptions {
  title: ReactNode;
  message?: ReactNode;
  okText?: string;
}

export interface ChooseOption<V> {
  label: string;
  value: V;
  destructive?: boolean;
}

export interface ChooseOptions<V> {
  title: ReactNode;
  message?: ReactNode;
  options: ChooseOption<V>[];
  /** `null` hides the cancel button (Escape still resolves `null`). */
  cancelText?: string | null;
}

export interface ConfirmApi {
  /** Resolves `true` on confirm, `false` on cancel / Escape. */
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /** Resolves when dismissed. */
  alert: (opts: AlertOptions) => Promise<void>;
  /** Resolves the chosen option's value, or `null` on cancel / Escape. */
  choose: <V>(opts: ChooseOptions<V>) => Promise<V | null>;
}

type Request = { settled: boolean } & (
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'alert'; opts: AlertOptions; resolve: () => void }
  | { kind: 'choose'; opts: ChooseOptions<unknown>; resolve: (v: unknown) => void }
);

const ConfirmContext = createContext<ConfirmApi | null>(null);

export interface FxConfirmProviderProps {
  children?: ReactNode;
  defaultConfirmText?: string;
  defaultCancelText?: string;
  defaultOkText?: string;
}

/**
 * Promise-based replacement for the 30 `Alert.alert` sites. Requests queue and show one at a time in a
 * Radix AlertDialog (focus trapped, overlay click ignored, Escape = cancel).
 */
export function FxConfirmProvider({
  children,
  defaultConfirmText = 'OK',
  defaultCancelText = 'Cancel',
  defaultOkText = 'OK',
}: FxConfirmProviderProps) {
  const [queue, setQueue] = useState<Request[]>([]);
  const current = queue[0];
  const onCloseAutoFocus = useOpenerFocusRestore(Boolean(current));

  const enqueue = useCallback((req: Omit<Request, 'settled'>) => {
    setQueue((q) => [...q, { ...req, settled: false } as Request]);
  }, []);

  const api = useMemo<ConfirmApi>(
    () => ({
      confirm: (opts) =>
        new Promise<boolean>((resolve) => enqueue({ kind: 'confirm', opts, resolve })),
      alert: (opts) => new Promise<void>((resolve) => enqueue({ kind: 'alert', opts, resolve })),
      choose: <V,>(opts: ChooseOptions<V>) =>
        new Promise<V | null>((resolve) =>
          enqueue({
            kind: 'choose',
            opts: opts as ChooseOptions<unknown>,
            resolve: resolve as (v: unknown) => void,
          }),
        ),
    }),
    [enqueue],
  );

  /** Settles a request exactly once (Radix Action/Cancel also emit onOpenChange(false), see `cancel`). */
  const finish = useCallback((req: Request, value: unknown) => {
    if (req.settled) return;
    req.settled = true;
    if (req.kind === 'confirm') req.resolve(Boolean(value));
    else if (req.kind === 'alert') req.resolve();
    else req.resolve(value === undefined ? null : value);
    setQueue((q) => q.filter((r) => r !== req));
  }, []);

  const cancel = () => {
    if (current) finish(current, current.kind === 'confirm' ? false : null);
  };

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      <AlertDialog.Root open={Boolean(current)} onOpenChange={(open) => !open && cancel()}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fx-overlay z-[950]" />
          <AlertDialog.Content
            className="fx-dialog-content z-[951] w-[min(420px,calc(100vw-40px))] p-5"
            onCloseAutoFocus={onCloseAutoFocus}
            data-testid="fx-confirm"
          >
            {current && (
              <>
                <AlertDialog.Title className="fx-text fx-text-h200 m-0 text-content1">
                  {current.opts.title}
                </AlertDialog.Title>
                <AlertDialog.Description
                  className={cn(
                    current.opts.message
                      ? 'fx-text fx-text-bodySmallRegular mt-2 text-content2'
                      : 'fx-visually-hidden',
                  )}
                >
                  {current.opts.message ?? ''}
                </AlertDialog.Description>
                <div
                  className={cn(
                    'mt-5 flex flex-wrap justify-end gap-2',
                    current.kind === 'choose' && 'flex-col',
                  )}
                >
                  {current.kind === 'confirm' && (
                    <>
                      <AlertDialog.Cancel asChild>
                        <FxButton variant="inverted" onPress={() => finish(current, false)}>
                          {current.opts.cancelText ?? defaultCancelText}
                        </FxButton>
                      </AlertDialog.Cancel>
                      <AlertDialog.Action asChild>
                        <FxButton
                          variant={current.opts.destructive ? 'destructive' : 'defaults'}
                          onPress={() => finish(current, true)}
                        >
                          {current.opts.confirmText ?? defaultConfirmText}
                        </FxButton>
                      </AlertDialog.Action>
                    </>
                  )}
                  {current.kind === 'alert' && (
                    <AlertDialog.Action asChild>
                      <FxButton onPress={() => finish(current, undefined)}>
                        {current.opts.okText ?? defaultOkText}
                      </FxButton>
                    </AlertDialog.Action>
                  )}
                  {current.kind === 'choose' && (
                    <>
                      {current.opts.options.map((o, i) => (
                        <AlertDialog.Action asChild key={i}>
                          <FxButton
                            variant={o.destructive ? 'destructive' : 'defaults'}
                            onPress={() => finish(current, o.value)}
                          >
                            {o.label}
                          </FxButton>
                        </AlertDialog.Action>
                      ))}
                      {current.opts.cancelText !== null && (
                        <AlertDialog.Cancel asChild>
                          <FxButton variant="inverted" onPress={() => finish(current, null)}>
                            {current.opts.cancelText ?? defaultCancelText}
                          </FxButton>
                        </AlertDialog.Cancel>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext.Provider>
  );
}

/** `const { confirm, alert, choose } = useConfirm();` — throws outside FxConfirmProvider. */
export function useConfirm(): ConfirmApi {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within an FxConfirmProvider');
  return ctx;
}

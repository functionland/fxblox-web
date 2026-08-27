import * as Dialog from '@radix-ui/react-dialog';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { Drawer } from 'vaul';
import { useIsDesktop } from '../../hooks/useMediaQuery.js';
import { FxCloseIcon } from '../../icons/generated/FxCloseIcon.js';
import { FxIconButton } from '../../components/icon-button/FxIconButton.js';
import { cn } from '../../utils/cn.js';
import { useOpenerFocusRestore } from '../useOpenerFocusRestore.js';
import { FxSheetContext, type FxSheetContextValue } from './FxSheetContext.js';

/** Imperative handle — mirrors `FxBottomSheetModalMethods` (`@gorhom/bottom-sheet`) so screen logic ports verbatim. */
export interface FxSheetMethods {
  present: () => void;
  close: () => void;
  dismiss: () => void;
  isOpen: () => boolean;
}

export type FxSheetPresentation = 'drawer' | 'dialog' | 'side';

export interface FxSheetProps {
  title?: string;
  /** Screen-reader description (wired to `aria-describedby`). */
  description?: string;
  children?: ReactNode;
  /** Controlled open state (optional — the imperative ref works without it). */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Fired when the sheet goes from open to closed (any reason). */
  onDismiss?: () => void;
  /** ≥ 900px presentation (default centered dialog). */
  desktopMode?: 'dialog' | 'side';
  /** Force a presentation regardless of viewport. */
  presentation?: FxSheetPresentation;
  /** Allow overlay click / Escape / swipe to close (default true). */
  dismissible?: boolean;
  /** RN compat (no-op). */
  keyboardShouldPersistTaps?: 'never' | 'handled';
  closeLabel?: string;
  className?: string;
  contentClassName?: string;
  testID?: string;
  ref?: Ref<FxSheetMethods>;
}

/**
 * Port of FxBottomSheetModal. Below 900px it is a vaul bottom drawer; at ≥ 900px a Radix dialog
 * (or a right-hand side panel with `desktopMode="side"`). Both share one open state, so crossing the
 * breakpoint while open keeps it open. Focus is trapped and restored by Radix/vaul.
 *
 * Usage (verbatim from mobile):
 *   const ref = useRef<FxSheetMethods>(null); ref.current?.present(); ref.current?.close();
 * or controlled: `<FxSheet open={open} onOpenChange={setOpen}>`; inside: `useFxSheet().close()`.
 */
export function FxSheet({
  title,
  description,
  children,
  open,
  defaultOpen = false,
  onOpenChange,
  onDismiss,
  desktopMode = 'dialog',
  presentation,
  dismissible = true,
  keyboardShouldPersistTaps: _k,
  closeLabel = 'Close',
  className,
  contentClassName,
  testID,
  ref,
}: FxSheetProps) {
  const isDesktop = useIsDesktop();
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolled;
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const onCloseAutoFocus = useOpenerFocusRestore(isOpen);

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolled(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !dismissible) return;
      setOpen(next);
    },
    [dismissible, setOpen],
  );

  const close = useCallback(() => setOpen(false), [setOpen]);

  useImperativeHandle(
    ref,
    () => ({
      present: () => setOpen(true),
      close,
      dismiss: close,
      isOpen: () => isOpenRef.current,
    }),
    [setOpen, close],
  );

  // onDismiss on the open → closed transition (mobile semantics).
  const wasOpen = useRef(isOpen);
  useEffect(() => {
    if (wasOpen.current && !isOpen) onDismiss?.();
    wasOpen.current = isOpen;
  }, [isOpen, onDismiss]);

  const ctx = useMemo<FxSheetContextValue>(
    () => ({ close, isOpen, inSheet: true }),
    [close, isOpen],
  );

  const mode: FxSheetPresentation = presentation ?? (isDesktop ? desktopMode : 'drawer');
  const TitleComp = mode === 'drawer' ? Drawer.Title : Dialog.Title;
  const DescriptionComp = mode === 'drawer' ? Drawer.Description : Dialog.Description;

  const header = (
    <div
      className={cn(
        'relative flex min-h-12 shrink-0 flex-row items-center px-5',
        title ? 'justify-center' : 'justify-end',
      )}
    >
      <TitleComp
        className={cn(
          'fx-text fx-text-bodyMediumRegular m-0 text-content1',
          !title && 'fx-visually-hidden',
        )}
      >
        {title ?? 'Sheet'}
      </TitleComp>
      {description ? (
        <DescriptionComp className="fx-visually-hidden">{description}</DescriptionComp>
      ) : null}
      <div className="absolute end-3 top-1">
        <FxIconButton aria-label={closeLabel} icon={<FxCloseIcon />} onPress={close} />
      </div>
    </div>
  );

  const body = (
    <div
      className={cn(
        'min-h-0 flex-1 overflow-y-auto px-5 pb-5 [padding-bottom:calc(20px+env(safe-area-inset-bottom,0px))]',
        contentClassName,
      )}
      data-testid={testID ? `${testID}-body` : undefined}
    >
      {children}
    </div>
  );

  // Radix warns when its default aria-describedby points at a missing Description; an explicit
  // `undefined` removes the attribute — but only when there is no description to point at.
  const describedBy = description ? {} : { 'aria-describedby': undefined };

  if (mode === 'drawer') {
    return (
      <FxSheetContext.Provider value={ctx}>
        <Drawer.Root open={isOpen} onOpenChange={handleOpenChange} dismissible={dismissible}>
          <Drawer.Portal>
            <Drawer.Overlay className="fx-overlay z-[900]" />
            <Drawer.Content
              className={cn('fx-sheet-content z-[901]', className)}
              onCloseAutoFocus={onCloseAutoFocus}
              {...describedBy}
              data-testid={testID}
              data-fx-sheet="drawer"
            >
              <Drawer.Handle className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" />
              {header}
              {body}
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </FxSheetContext.Provider>
    );
  }

  return (
    <FxSheetContext.Provider value={ctx}>
      <Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fx-overlay z-[900]" />
          <Dialog.Content
            className={cn(
              mode === 'side' ? 'fx-side-content' : 'fx-dialog-content',
              'z-[901]',
              className,
            )}
            onCloseAutoFocus={onCloseAutoFocus}
            {...describedBy}
            onEscapeKeyDown={dismissible ? undefined : (e) => e.preventDefault()}
            onPointerDownOutside={dismissible ? undefined : (e) => e.preventDefault()}
            data-testid={testID}
            data-fx-sheet={mode}
          >
            {header}
            {body}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </FxSheetContext.Provider>
  );
}

import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { FxCloseIcon } from '../../icons/generated/FxCloseIcon.js';
import { FxIconButton } from '../../components/icon-button/FxIconButton.js';
import { cn } from '../../utils/cn.js';
import { useOpenerFocusRestore } from '../useOpenerFocusRestore.js';

export interface FxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons row (right-aligned). */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Overlay click / Escape close the dialog (default true). */
  dismissible?: boolean;
  showClose?: boolean;
  closeLabel?: string;
  /** Optional element that opens the dialog (`asChild`). */
  trigger?: ReactNode;
  className?: string;
  testID?: string;
}

const SIZE_CLASS = {
  sm: 'w-[min(400px,calc(100vw-40px))]',
  md: 'w-[min(560px,calc(100vw-40px))]',
  lg: 'w-[min(760px,calc(100vw-40px))]',
};

/** Modal dialog (Radix): focus trap, Escape, restores focus. Replaces the mobile `Modal` components. */
export function FxDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
  showClose = true,
  closeLabel = 'Close',
  trigger,
  className,
  testID,
}: FxDialogProps) {
  const onCloseAutoFocus = useOpenerFocusRestore(open);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => (!next && !dismissible ? undefined : onOpenChange(next))}
    >
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      <Dialog.Portal>
        <Dialog.Overlay className="fx-overlay z-[900]" />
        <Dialog.Content
          className={cn('fx-dialog-content z-[901] p-5', SIZE_CLASS[size], className)}
          onCloseAutoFocus={onCloseAutoFocus}
          {...(description ? {} : { 'aria-describedby': undefined })}
          onEscapeKeyDown={dismissible ? undefined : (e) => e.preventDefault()}
          onPointerDownOutside={dismissible ? undefined : (e) => e.preventDefault()}
          data-testid={testID}
        >
          <div className="flex flex-row items-start justify-between gap-3">
            <Dialog.Title className="fx-text fx-text-h200 m-0 flex-1 text-content1">
              {title}
            </Dialog.Title>
            {showClose && (
              <Dialog.Close asChild>
                <FxIconButton
                  aria-label={closeLabel}
                  icon={<FxCloseIcon />}
                  marginTop={-8}
                  marginRight={-8}
                />
              </Dialog.Close>
            )}
          </div>
          {description ? (
            <Dialog.Description className="fx-text fx-text-bodySmallRegular mt-2 text-content2">
              {description}
            </Dialog.Description>
          ) : null}
          {children ? <div className="mt-4 min-h-0 flex-1 overflow-y-auto">{children}</div> : null}
          {footer ? (
            <div className="mt-5 flex flex-row flex-wrap justify-end gap-2">{footer}</div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const FxDialogClose = Dialog.Close;

import { useCopyToClipboard } from '../../hooks/useCopyToClipboard.js';
import { FxCheckIcon } from '../../icons/generated/FxCheckIcon.js';
import { FxCopyIcon } from '../../icons/generated/FxCopyIcon.js';
import { FxIconButton, type FxIconButtonProps } from '../icon-button/FxIconButton.js';

export interface FxCopyButtonProps extends Omit<
  FxIconButtonProps,
  'icon' | 'aria-label' | 'onPress'
> {
  /** Text to copy. */
  value: string;
  label?: string;
  copiedLabel?: string;
  onCopied?: (ok: boolean) => void;
  'aria-label'?: string;
}

/** Copies `value`; shows a check for 1.5 s and announces "Copied" to screen readers. */
export function FxCopyButton({
  value,
  label = 'Copy',
  copiedLabel = 'Copied',
  onCopied,
  ...rest
}: FxCopyButtonProps) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <>
      <FxIconButton
        aria-label={copied ? copiedLabel : label}
        icon={copied ? <FxCheckIcon color="successBase" /> : <FxCopyIcon />}
        onPress={async () => onCopied?.(await copy(value))}
        {...rest}
      />
      <span role="status" aria-live="polite" className="fx-visually-hidden">
        {copied ? copiedLabel : ''}
      </span>
    </>
  );
}

// Label + monospace value + copy (and optional share) — replaces the mobile "wide FxButton with a CopyIcon"
// pattern used for addresses / DIDs / peer ids (WalletDetails, BloxInfoSheet, Users).
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxCopyButton,
  FxEyeIcon,
  FxEyeOffIcon,
  FxIconButton,
  FxShareIcon,
  FxText,
  cn,
} from '@functionland/fx-ui';

export interface CopyRowProps {
  label: ReactNode;
  value: string;
  /** `middle` keeps both ends visible (peer ids); `none` wraps the whole value. */
  truncate?: 'middle' | 'end' | 'none';
  onShare?: () => void;
  copyLabel?: string;
  copiedLabel?: string;
  shareLabel?: string;
  /**
   * Passwords: the value stays out of the page (no text, `title` or `data-value`) until the user reveals it;
   * Copy still copies the real value.
   */
  secret?: boolean;
  revealLabel?: string;
  hideLabel?: string;
  className?: string;
  testID?: string;
}

/** `12D3KooW…abcd` — CSS cannot middle-truncate, so the display string is shortened and the full value kept in `title`. */
export function truncateMiddle(value: string, max = 28): string {
  if (value.length <= max) return value;
  const keep = Math.max(4, Math.floor((max - 1) / 2));
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

export function CopyRow({
  label,
  value,
  truncate = 'middle',
  onShare,
  copyLabel,
  copiedLabel,
  shareLabel,
  secret = false,
  revealLabel,
  hideLabel,
  className,
  testID,
}: CopyRowProps) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const masked = secret && !revealed;
  const display = truncate === 'middle' ? truncateMiddle(value) : value;
  return (
    <FxBox
      flexDirection="row"
      alignItems="center"
      gap="8"
      paddingVertical="8"
      minWidth={0}
      className={cn('border-b border-border last:border-b-0', className)}
      testID={testID}
    >
      <FxBox flex={1} minWidth={0}>
        <FxText variant="bodyXSSemibold" color="content3">
          {label}
        </FxText>
        {masked ? (
          <FxText variant="bodySmallRegular" color="content1" className="font-mono">
            <span aria-hidden="true">••••••••••••</span>
            <span className="sr-only">{t('main.common.hidden')}</span>
          </FxText>
        ) : (
          <FxText
            variant="bodySmallRegular"
            color="content1"
            numberOfLines={truncate === 'end' ? 1 : undefined}
            title={secret ? undefined : value}
            className={cn('font-mono', truncate === 'none' && 'break-all')}
            data-value={secret ? undefined : value}
          >
            {display}
          </FxText>
        )}
      </FxBox>
      {secret && (
        <FxIconButton
          aria-label={revealed ? (hideLabel ?? t('main.common.hide')) : (revealLabel ?? t('main.common.show'))}
          icon={revealed ? <FxEyeOffIcon /> : <FxEyeIcon />}
          pressed={revealed}
          onPress={() => setRevealed((r) => !r)}
        />
      )}
      <FxCopyButton
        value={value}
        label={copyLabel ?? t('main.common.copy')}
        copiedLabel={copiedLabel ?? t('main.common.copied')}
      />
      {onShare && (
        <FxIconButton
          aria-label={shareLabel ?? t('main.common.share')}
          icon={<FxShareIcon />}
          onPress={onShare}
        />
      )}
    </FxBox>
  );
}

export default CopyRow;

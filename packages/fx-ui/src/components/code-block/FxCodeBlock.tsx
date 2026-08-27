import { useState, type CSSProperties } from 'react';
import { FxBox, type FxBoxProps } from '../../primitives/FxBox.js';
import { FxText } from '../../primitives/FxText.js';
import { cn } from '../../utils/cn.js';
import { FxCopyButton } from '../copy-button/FxCopyButton.js';

export interface FxCodeBlockProps extends Omit<FxBoxProps, 'title' | 'children'> {
  code: string;
  /** Shown in the header (e.g. "json", "log"). */
  language?: string;
  title?: string;
  maxHeight?: number | string;
  /** Initial wrap state. */
  wrap?: boolean;
  showWrapToggle?: boolean;
  showCopy?: boolean;
  wrapLabel?: string;
  unwrapLabel?: string;
  preStyle?: CSSProperties;
}

/** Monospace block with max height, wrap toggle and copy (JSON previews, BLE logs, install output). */
export function FxCodeBlock({
  code,
  language,
  title,
  maxHeight = 240,
  wrap: initialWrap = false,
  showWrapToggle = true,
  showCopy = true,
  wrapLabel = 'Wrap lines',
  unwrapLabel = 'Unwrap lines',
  preStyle,
  className,
  ...rest
}: FxCodeBlockProps) {
  const [wrap, setWrap] = useState(initialWrap);
  const heading = title ?? language;
  return (
    <FxBox
      borderWidth={1}
      borderColor="border"
      borderRadius="s"
      backgroundColor="backgroundPrimary"
      overflow="hidden"
      className={cn('fx-code-block', className)}
      {...rest}
    >
      {(heading || showWrapToggle || showCopy) && (
        <FxBox
          flexDirection="row"
          alignItems="center"
          justifyContent="space-between"
          paddingLeft="12"
          paddingRight="4"
          minHeight={40}
          borderBottomWidth={1}
          borderBottomColor="border"
        >
          <FxText variant="bodyXSSemibold" color="content3" numberOfLines={1}>
            {heading}
          </FxText>
          <FxBox flexDirection="row" alignItems="center" gap="4">
            {showWrapToggle && (
              <button
                type="button"
                aria-pressed={wrap}
                onClick={() => setWrap((w) => !w)}
                className="fx-control-reset h-10 cursor-pointer rounded-fx-s px-2 fx-text-bodyXSSemibold text-content2 hover:bg-background-secondary"
              >
                {wrap ? unwrapLabel : wrapLabel}
              </button>
            )}
            {showCopy && <FxCopyButton value={code} />}
          </FxBox>
        </FxBox>
      )}
      <pre
        tabIndex={0}
        className="m-0 overflow-auto p-3 font-mono text-[12px] leading-4 text-content1"
        style={{
          maxHeight,
          whiteSpace: wrap ? 'pre-wrap' : 'pre',
          overflowWrap: wrap ? 'anywhere' : 'normal',
          ...preStyle,
        }}
      >
        <code>{code}</code>
      </pre>
    </FxBox>
  );
}

import { cloneElement, type ElementType, type ReactElement, type ReactNode } from 'react';
import { FxAudioIcon } from '../../icons/generated/FxAudioIcon.js';
import { FxDocumentIcon } from '../../icons/generated/FxDocumentIcon.js';
import { FxFolderIcon } from '../../icons/generated/FxFolderIcon.js';
import { FxOptionsHorizontalIcon } from '../../icons/generated/FxOptionsHorizontalIcon.js';
import { FxOptionsVerticalIcon } from '../../icons/generated/FxOptionsVerticalIcon.js';
import { FxPDFIcon } from '../../icons/generated/FxPDFIcon.js';
import type { FxSvgProps } from '../../icons/FxSvg.js';
import { FxBox } from '../../primitives/FxBox.js';
import {
  FxPressableOpacity,
  type FxPressableOpacityProps,
} from '../../primitives/FxPressableOpacity.js';
import { FxText } from '../../primitives/FxText.js';
import type { ColorToken } from '../../theme/tokens.js';
import { cn } from '../../utils/cn.js';
import { FxIconButton } from '../icon-button/FxIconButton.js';

const iconMap: Record<string, ElementType<FxSvgProps>> = {
  folder: FxFolderIcon,
  pdf: FxPDFIcon,
  audio: FxAudioIcon,
  document: FxDocumentIcon,
};

export type FxFileType = 'folder' | 'pdf' | 'audio' | 'document';

export interface FxFileProps extends Omit<FxPressableOpacityProps, 'children' | 'type' | 'name'> {
  name: ReactNode;
  details?: ReactNode;
  type: FxFileType;
  /** Extra badge icon (compact layout). */
  icon?: ReactElement<FxSvgProps>;
  disabled?: boolean;
  onPress?: () => void;
  onOptionsPress?: () => void;
  optionsLabel?: string;
  /** Mobile restyle variant (visuals derive from state on web). */
  variant?: string;
  /** Compact tile (157px) instead of the detailed row. */
  compact?: boolean;
}

/** Port of files.tsx (FileSimple / FileDetailed). The options button is a separate FxIconButton. */
export function FxFile({
  name,
  details,
  type,
  icon,
  disabled,
  onPress,
  onOptionsPress,
  optionsLabel = 'Options',
  variant: _variant,
  compact,
  className,
  ...rest
}: FxFileProps) {
  const color: ColorToken = disabled ? 'border' : 'content1';
  const detailColor: ColorToken = disabled ? 'border' : 'content3';
  const Icon = iconMap[type] ?? FxFolderIcon;

  if (compact) {
    return (
      <FxPressableOpacity
        as="div"
        onPress={onPress}
        disabled={disabled}
        alignItems="center"
        padding="8"
        width={157}
        gap="8"
        backgroundColor="backgroundPrimary"
        borderRadius="s"
        className={cn('active:bg-background-secondary active:opacity-100', className)}
        {...rest}
      >
        <Icon color={color} width={24} height={24} />
        {icon &&
          cloneElement(icon, { width: 16, height: 16, color: icon.props.color ?? 'content1' })}
        <FxText
          color={color}
          variant="bodyMediumRegular"
          numberOfLines={1}
          textAlign="center"
          maxWidth="100%"
        >
          {name}
        </FxText>
        <FxIconButton
          aria-label={optionsLabel}
          disabled={disabled}
          color={color}
          icon={<FxOptionsHorizontalIcon />}
          onPress={onOptionsPress}
        />
      </FxPressableOpacity>
    );
  }

  return (
    <FxPressableOpacity
      as="div"
      onPress={onPress}
      disabled={disabled}
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      paddingHorizontal="20"
      paddingVertical="16"
      backgroundColor="backgroundPrimary"
      className={cn('active:bg-background-secondary active:opacity-100', className)}
      {...rest}
    >
      <FxBox flexDirection="row" alignItems="center" gap="16" minWidth={0} flex={1}>
        <Icon color={color} width={24} height={24} />
        <FxBox minWidth={0}>
          <FxText color={color} variant="bodyMediumRegular" numberOfLines={1}>
            {name}
          </FxText>
          {details !== undefined && (
            <FxText color={detailColor} variant="bodyXXSRegular" numberOfLines={1}>
              {details}
            </FxText>
          )}
        </FxBox>
      </FxBox>
      <FxIconButton
        aria-label={optionsLabel}
        disabled={disabled}
        color={color}
        icon={<FxOptionsVerticalIcon />}
        onPress={onOptionsPress}
      />
    </FxPressableOpacity>
  );
}

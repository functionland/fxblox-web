import * as Avatar from '@radix-ui/react-avatar';
import type { ElementType, ReactNode } from 'react';
import { FxEditIcon } from '../../icons/generated/FxEditIcon.js';
import { FxInvertedCheckIcon } from '../../icons/generated/FxInvertedCheckIcon.js';
import type { FxSvgProps } from '../../icons/FxSvg.js';
import { FxBox, type FxBoxProps } from '../../primitives/FxBox.js';
import {
  FxPressableOpacity,
  type FxPressableOpacityProps,
} from '../../primitives/FxPressableOpacity.js';
import type { ColorToken } from '../../theme/tokens.js';

export type AvatarSize = 'small' | 'medium' | 'large' | 'xl';
export type AvatarIcon = 'none' | 'deselected' | 'selected' | 'edit';

const AvatarSizeMap: Record<AvatarSize, number> = { small: 32, medium: 48, large: 64, xl: 96 };

const RADIAN_CONVERSION = Math.PI / 180;
const ICON_SIZE = 16;
const ICON_BORDER = 2;
const ICON_WITH_BORDER = ICON_SIZE + ICON_BORDER;

const IconOffsetMap: Record<AvatarSize, number> = {
  small: -20 * RADIAN_CONVERSION,
  medium: -30 * RADIAN_CONVERSION,
  large: -40 * RADIAN_CONVERSION,
  xl: -45 * RADIAN_CONVERSION,
};

const IconDefs: Record<
  AvatarIcon,
  {
    icon: ElementType<FxSvgProps> | undefined;
    backgroundColor?: ColorToken;
    iconColor?: ColorToken;
  }
> = {
  none: { icon: undefined },
  deselected: { backgroundColor: 'backgroundApp', icon: undefined },
  selected: { backgroundColor: 'content1', icon: FxInvertedCheckIcon, iconColor: 'greenBase' },
  edit: { backgroundColor: 'content1', icon: FxEditIcon, iconColor: 'secondary' },
};

export interface FxAvatarProps extends Omit<FxPressableOpacityProps, 'children'> {
  /** Image URL (RN `source={{ uri }}` also accepted). */
  source: string | { uri: string };
  alt?: string;
  size: AvatarSize;
  icon?: AvatarIcon;
  /** Shown while the image loads / if it fails (initials, an icon…). */
  fallback?: ReactNode;
}

/** Port of avatar.tsx on Radix Avatar. Only becomes a button when `onPress` is given. */
export function FxAvatar({
  source,
  alt = '',
  size,
  icon = 'none',
  fallback,
  onPress,
  onLongPress,
  ...rest
}: FxAvatarProps) {
  const avatarSize = AvatarSizeMap[size];
  const iconOffset = IconOffsetMap[size];
  const radius = avatarSize / 2;
  const iconX = radius * Math.cos(iconOffset);
  const iconY = radius * Math.sin(iconOffset);
  const def = IconDefs[icon];
  const IconElem = def.icon;
  const src = typeof source === 'string' ? source : source.uri;

  const body = (
    <FxBox position="relative" width={avatarSize} height={avatarSize}>
      <Avatar.Root
        className="inline-flex overflow-hidden rounded-full bg-background-secondary align-middle select-none"
        style={{ width: avatarSize, height: avatarSize }}
      >
        <Avatar.Image src={src} alt={alt} className="h-full w-full object-cover" />
        <Avatar.Fallback
          delayMs={fallback ? 0 : 600}
          className="flex h-full w-full items-center justify-center text-content2 fx-text-bodySmallSemibold"
        >
          {fallback}
        </Avatar.Fallback>
      </Avatar.Root>
      {def.backgroundColor && (
        <FxBox
          aria-hidden
          justifyContent="center"
          alignItems="center"
          position="absolute"
          left={radius + iconX - ICON_WITH_BORDER / 2}
          top={radius - iconY - ICON_WITH_BORDER / 2}
          borderColor="content1"
          borderWidth={ICON_BORDER}
          width={ICON_WITH_BORDER}
          height={ICON_WITH_BORDER}
          backgroundColor={def.backgroundColor}
          style={{ borderRadius: ICON_SIZE / 2 + ICON_BORDER }}
        >
          {IconElem && <IconElem width="100%" height="100%" color={def.iconColor} />}
        </FxBox>
      )}
    </FxBox>
  );

  if (onPress || onLongPress) {
    return (
      <FxPressableOpacity onPress={onPress} onLongPress={onLongPress} borderRadius="l" {...rest}>
        {body}
      </FxPressableOpacity>
    );
  }
  return <FxBox {...(rest as FxBoxProps)}>{body}</FxBox>;
}

/* DOM rewrite of libs/component-library/src/lib/toast/components/BaseToast.tsx (same props/render slots). */
import React from 'react';
import { FxCloseIcon } from '../../../icons/generated/FxCloseIcon.js';
import { FxIconButton } from '../../../components/icon-button/FxIconButton.js';
import { FxText } from '../../../primitives/FxText.js';
import { colorVar, type ColorToken } from '../../../theme/tokens.js';
import type { BaseToastProps, LocalType } from '../types.toast.js';

const BaseToast: React.FC<BaseToastProps & { localType: LocalType }> = ({
  localType,
  ...props
}) => {
  const {
    iconElement,
    title,
    message,
    onClose,
    onPress,
    renderIcon,
    renderTitle,
    renderMessage,
    renderCloseButton,
  } = props;

  const colorType = `${localType}Base` as ColorToken;
  const color = colorVar(colorType);

  const content = (
    <>
      {renderTitle?.({ color, ...props }) ??
        (title !== undefined && (
          <FxText color={colorType} variant="bodySmallSemibold" numberOfLines={1} marginBottom={3}>
            {title}
          </FxText>
        ))}
      {renderMessage?.({ color, ...props }) ??
        (message !== undefined && (
          <FxText variant="bodyXSRegular" color="content2" numberOfLines={2}>
            {message}
          </FxText>
        ))}
    </>
  );

  return (
    <>
      {renderIcon?.({ color, ...props }) ?? (
        <div className="flex items-center justify-center px-4" aria-hidden="true">
          {iconElement ? (
            React.cloneElement(iconElement as React.ReactElement<{ color?: ColorToken }>, {
              color: colorType,
            })
          ) : (
            <div className="size-6" />
          )}
        </div>
      )}

      {onPress ? (
        <button
          type="button"
          onClick={() => onPress(props)}
          className="fx-control-reset flex min-w-0 flex-1 cursor-pointer flex-col items-start justify-center py-3 text-left"
        >
          {content}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col items-start justify-center py-3">
          {content}
        </div>
      )}

      {renderCloseButton ? (
        renderCloseButton({ color, ...props })
      ) : (
        <div className="flex items-center justify-center px-2">
          <FxIconButton
            aria-label="Dismiss"
            icon={<FxCloseIcon width={18} height={18} />}
            onPress={onClose}
          />
        </div>
      )}
    </>
  );
};

export default BaseToast;

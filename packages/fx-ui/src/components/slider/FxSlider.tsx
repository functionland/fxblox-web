import * as Slider from '@radix-ui/react-slider';
import type { CSSProperties } from 'react';
import { mergeStyle, resolveStyleProps, type BoxStyleProps } from '../../primitives/styleProps.js';
import { cn } from '../../utils/cn.js';

export interface FxSliderProps extends BoxStyleProps {
  disabled?: boolean;
  value?: number;
  onValueChange?: (value: number) => void;
  minimumValue?: number;
  maximumValue?: number;
  /** RN `step` (0 → integer steps, as the mobile implementation rounds). */
  step?: number;
  /** Unit label shown next to the value in the bubble. */
  label?: string;
  'aria-label'?: string;
  className?: string;
  style?: CSSProperties;
  testID?: string;
}

/** Port of slider.tsx on Radix Slider (keyboard arrows / Home / End; value bubble on hover, focus, drag). */
export function FxSlider({
  disabled,
  value,
  onValueChange,
  minimumValue = 0,
  maximumValue = 1,
  step = 0,
  label,
  'aria-label': ariaLabel,
  className,
  style,
  testID,
  ...rest
}: FxSliderProps) {
  const { style: resolved } = resolveStyleProps(rest);
  const current = value ?? minimumValue;
  return (
    <Slider.Root
      value={[current]}
      onValueChange={([v]) => {
        if (v !== undefined) onValueChange?.(v);
      }}
      min={minimumValue}
      max={maximumValue}
      step={step > 0 ? step : 1}
      disabled={disabled}
      className={cn(
        'group relative flex h-6 w-full touch-none select-none items-center',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
      style={mergeStyle(resolved, style)}
      data-testid={testID}
    >
      <Slider.Track className="relative h-1 w-full grow rounded-fx-s bg-background-secondary">
        <Slider.Range className="absolute h-full rounded-fx-s bg-green-base" />
      </Slider.Track>
      <Slider.Thumb
        aria-label={ariaLabel ?? label ?? 'Value'}
        className="relative block size-6 cursor-grab rounded-full bg-green-base outline-none focus-visible:outline-2 focus-visible:outline-secondary active:cursor-grabbing"
      >
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-fx-s bg-background-secondary px-2 py-1 fx-text-bodyXSRegular text-content1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 group-active:opacity-100 motion-reduce:transition-none"
        >
          {current}
          {label ? ` ${label}` : ''}
        </span>
      </Slider.Thumb>
    </Slider.Root>
  );
}

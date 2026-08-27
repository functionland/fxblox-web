import type { ReactNode } from 'react';
import { FxArrowRightIcon } from '../../icons/generated/FxArrowRightIcon.js';
import { FxBox, type FxBoxProps } from '../../primitives/FxBox.js';
import { FxText } from '../../primitives/FxText.js';
import { FxLedDot } from './FxLedDot.js';

export interface FxLedStep {
  color: string;
  onInterval?: number;
  offInterval?: number;
  /** Text describing the state ("Blinking blue: waiting for Wi-Fi"). */
  label?: ReactNode;
  /** Accessible name for the dot (defaults to the label when it is a string). */
  dotLabel?: string;
}

export interface FxLedSequenceProps extends Omit<FxBoxProps, 'children'> {
  steps: FxLedStep[];
  direction?: 'row' | 'column';
  size?: number;
  /** Arrow between steps in `row` direction (default true). */
  showArrows?: boolean;
}

/** Ordered list of LED states (setup screens explaining the Blox light sequence). */
export function FxLedSequence({
  steps,
  direction = 'column',
  size = 20,
  showArrows = true,
  ...rest
}: FxLedSequenceProps) {
  const row = direction === 'row';
  return (
    <FxBox
      as="ol"
      flexDirection={row ? 'row' : 'column'}
      alignItems={row ? 'center' : 'stretch'}
      flexWrap={row ? 'wrap' : undefined}
      gap={row ? '8' : '12'}
      className="m-0 list-none p-0"
      {...rest}
    >
      {steps.map((step, i) => (
        <FxBox as="li" key={i} flexDirection="row" alignItems="center" gap="8">
          <FxLedDot
            color={step.color}
            onInterval={step.onInterval}
            offInterval={step.offInterval}
            size={size}
            marginRight={0}
            label={step.dotLabel ?? (typeof step.label === 'string' ? step.label : undefined)}
          />
          {step.label && (
            <FxText variant="bodySmallRegular" color="content2">
              {step.label}
            </FxText>
          )}
          {row && showArrows && i < steps.length - 1 && (
            <FxArrowRightIcon color="content3" width={16} height={16} marginLeft="8" />
          )}
        </FxBox>
      ))}
    </FxBox>
  );
}

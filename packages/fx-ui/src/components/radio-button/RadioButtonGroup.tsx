import * as RadioGroup from '@radix-ui/react-radio-group';
import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { cn } from '../../utils/cn.js';
import { handlePress } from './utils.js';

export type ValueType = string | number;

type SingleValueProps<T> = {
  /** Function to execute on selection change. */
  onValueChange: (value: T) => void;
  /** Value of the currently selected radio button. */
  value: T;
};

type MultiValueProps<T> = {
  onValueChange: (value: T[]) => void;
  value: T[];
};

export type RadioButtonGroupProps<T extends ValueType = ValueType> = (
  SingleValueProps<T> | MultiValueProps<T>
) & {
  /** React elements containing radio buttons. */
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  orientation?: 'horizontal' | 'vertical';
  'aria-label'?: string;
  'aria-labelledby'?: string;
  testID?: string;
};

export type RadioButtonContextType<T extends ValueType> = Omit<
  RadioButtonGroupProps<T>,
  'children' | 'className' | 'style' | 'orientation' | 'aria-label' | 'aria-labelledby' | 'testID'
>;

interface InternalContext extends RadioButtonContextType<ValueType> {
  /** true inside a Group (the mobile context defaults to `value: ''`, which is indistinguishable from a real value). */
  inGroup: boolean;
  /** Radix RadioGroup values are strings; items register `String(value) → value` so keyboard changes map back. */
  registry: Map<string, ValueType>;
}

const initialContext: InternalContext = {
  value: '',
  onValueChange: () => null,
  inGroup: false,
  registry: new Map(),
};

export const RadioButtonContext = createContext<InternalContext>(initialContext);

export const useRadioButtonContext = () => useContext(RadioButtonContext);

/**
 * Port of RadioButtonGroup.tsx. A scalar `value` → Radix RadioGroup (single selection, arrow-key
 * navigation); an array `value` → a `role="group"` of checkboxes (multi-select, as on mobile).
 */
export function RadioButtonGroup({
  value,
  onValueChange,
  children,
  className,
  style,
  orientation = 'vertical',
  testID,
  ...aria
}: RadioButtonGroupProps<ValueType>) {
  const registry = useRef(new Map<string, ValueType>()).current;
  const isMulti = Array.isArray(value);
  const ctx = useMemo<InternalContext>(
    () => ({ value, onValueChange, inGroup: true, registry }) as InternalContext,
    [value, onValueChange, registry],
  );

  if (isMulti) {
    return (
      <RadioButtonContext.Provider value={ctx}>
        <div
          role="group"
          className={cn('fx-box', orientation === 'horizontal' && 'flex-row flex-wrap', className)}
          style={style}
          data-testid={testID}
          {...aria}
        >
          {children}
        </div>
      </RadioButtonContext.Provider>
    );
  }

  const change = onValueChange as (v: ValueType) => void;
  return (
    <RadioButtonContext.Provider value={ctx}>
      <RadioGroup.Root
        value={value === undefined || value === null ? '' : String(value)}
        onValueChange={(next) =>
          handlePress({
            value: registry.get(next) ?? next,
            onValueChange: change,
            contextValue: value,
          })
        }
        orientation={orientation}
        className={cn('fx-box', orientation === 'horizontal' && 'flex-row flex-wrap', className)}
        style={style}
        data-testid={testID}
        {...aria}
      >
        {children}
      </RadioGroup.Root>
    </RadioButtonContext.Provider>
  );
}

RadioButtonGroup.displayName = 'RadioButton.Group';

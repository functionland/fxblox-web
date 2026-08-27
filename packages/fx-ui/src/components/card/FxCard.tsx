import { createContext, useContext, useId, useMemo, type ReactNode } from 'react';
import { FxBox, type FxBoxProps } from '../../primitives/FxBox.js';
import { FxHorizontalRule } from '../../primitives/FxRule.js';
import {
  FxPressableOpacity,
  type FxPressableOpacityProps,
} from '../../primitives/FxPressableOpacity.js';
import { FxText, type FxTextProps } from '../../primitives/FxText.js';
import { cn } from '../../utils/cn.js';

export type FxCardProps = Omit<FxPressableOpacityProps, 'as'>;

const FxCardContext = createContext<{ titleId: string } | null>(null);

/**
 * Nested controls inside the card keep receiving pointer events; everything else falls through to the
 * hit-area button underneath (stretched-link pattern).
 */
const CONTENT_CLASS =
  'relative z-[1] flex min-w-0 flex-col pointer-events-none ' +
  '[&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_input]:pointer-events-auto ' +
  '[&_select]:pointer-events-auto [&_textarea]:pointer-events-auto [&_label]:pointer-events-auto ' +
  '[&_[role=button]]:pointer-events-auto [&_[role=switch]]:pointer-events-auto ' +
  '[&_[role=radio]]:pointer-events-auto [&_[role=checkbox]]:pointer-events-auto ' +
  '[&_[role=slider]]:pointer-events-auto [&_[role=combobox]]:pointer-events-auto';

/**
 * Port of card.tsx. A static container unless `onPress`/`onLongPress`/`href` is given; then an invisible
 * full-size button (named by `FxCard.Title` or `accessibilityLabel`) sits underneath the content, so
 * nested controls (kebab `FxIconButton`, switches…) are never inside another interactive element.
 */
function FxCardBase({
  onPress,
  onLongPress,
  delayLongPress,
  onPressIn,
  onPressOut,
  disabled,
  href,
  type: _type,
  hitSlop: _hitSlop,
  accessibilityLabel,
  className,
  children,
  ...rest
}: FxCardProps) {
  const titleId = `fx-card-title-${useId().replace(/:/g, '')}`;
  const ctx = useMemo(() => ({ titleId }), [titleId]);
  const interactive = Boolean(onPress || onLongPress || href);
  const shared = {
    padding: '16',
    paddingVertical: '24',
    backgroundColor: disabled ? 'border' : 'backgroundPrimary',
    borderRadius: 's',
  } as const;

  if (!interactive) {
    return (
      <FxCardContext.Provider value={ctx}>
        <FxBox
          {...shared}
          className={cn('fx-card', className)}
          aria-label={accessibilityLabel}
          {...(rest as FxBoxProps)}
        >
          {children}
        </FxBox>
      </FxCardContext.Provider>
    );
  }

  return (
    <FxCardContext.Provider value={ctx}>
      <FxBox
        {...shared}
        position="relative"
        className={cn(
          'fx-card has-[.fx-card-hit:active]:opacity-50 has-[.fx-card-hit:disabled]:opacity-60',
          className,
        )}
        {...(rest as FxBoxProps)}
      >
        <FxPressableOpacity
          href={href}
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={delayLongPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={disabled}
          aria-label={accessibilityLabel}
          aria-labelledby={accessibilityLabel ? undefined : titleId}
          className="fx-card-hit absolute inset-0 z-0 rounded-[inherit] active:opacity-100"
        />
        <div className={CONTENT_CLASS}>{children}</div>
      </FxBox>
    </FxCardContext.Provider>
  );
}

const FxCardTitle = ({ id, ...props }: FxTextProps) => {
  const ctx = useContext(FxCardContext);
  return <FxText id={id ?? ctx?.titleId} color="content1" variant="bodyLargeRegular" {...props} />;
};

const FxCardRowTitle = (props: FxTextProps) => (
  <FxText color="content1" variant="bodySmallRegular" {...props} />
);

export const FxCardRowData = (props: FxTextProps) => (
  <FxText color="content2" variant="bodySmallLight" {...props} />
);

const FxCardRowBase = (props: FxBoxProps & { children?: ReactNode }) => (
  <>
    <FxBox flexDirection="row" justifyContent="space-between" alignItems="center" {...props} />
    <FxHorizontalRule marginVertical="12" />
  </>
);

const FxCardRow = Object.assign(FxCardRowBase, { Title: FxCardRowTitle, Data: FxCardRowData });

export const FxCard = Object.assign(FxCardBase, { Title: FxCardTitle, Row: FxCardRow });

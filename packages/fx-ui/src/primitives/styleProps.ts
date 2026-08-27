/**
 * Bounded @shopify/restyle-compatible style props → inline `style` resolver.
 *
 * Mobile screens use props like `padding="16"`, `marginTop="8"`, `flexDirection="row"`,
 * `backgroundColor="backgroundPrimary"`, `borderRadius="s"`. This resolver maps exactly that
 * vocabulary (spacing keys '0'…'80', colour tokens, radius keys) onto CSS so the screen JSX ports
 * verbatim. Colours resolve to `var(--fx-…)` so they follow `[data-theme]` without re-rendering.
 */
import type { CSSProperties } from 'react';
import {
  borderRadii,
  colorVar,
  isColorToken,
  spacing,
  type ColorToken,
  type RadiusKey,
  type SpacingKey,
} from '../theme/tokens.js';

export type SpacingValue = SpacingKey | number | (string & {});
export type SizeValue = number | (string & {});
export type ColorValue = ColorToken | (string & {});
export type RadiusValue = RadiusKey | number | (string & {});

export interface SpacingProps {
  margin?: SpacingValue;
  marginTop?: SpacingValue;
  marginRight?: SpacingValue;
  marginBottom?: SpacingValue;
  marginLeft?: SpacingValue;
  marginStart?: SpacingValue;
  marginEnd?: SpacingValue;
  marginHorizontal?: SpacingValue;
  marginVertical?: SpacingValue;
  padding?: SpacingValue;
  paddingTop?: SpacingValue;
  paddingRight?: SpacingValue;
  paddingBottom?: SpacingValue;
  paddingLeft?: SpacingValue;
  paddingStart?: SpacingValue;
  paddingEnd?: SpacingValue;
  paddingHorizontal?: SpacingValue;
  paddingVertical?: SpacingValue;
  gap?: SpacingValue;
  rowGap?: SpacingValue;
  columnGap?: SpacingValue;
  // restyle shorthands
  m?: SpacingValue;
  mt?: SpacingValue;
  mr?: SpacingValue;
  mb?: SpacingValue;
  ml?: SpacingValue;
  ms?: SpacingValue;
  me?: SpacingValue;
  mx?: SpacingValue;
  my?: SpacingValue;
  p?: SpacingValue;
  pt?: SpacingValue;
  pr?: SpacingValue;
  pb?: SpacingValue;
  pl?: SpacingValue;
  ps?: SpacingValue;
  pe?: SpacingValue;
  px?: SpacingValue;
  py?: SpacingValue;
  g?: SpacingValue;
  rg?: SpacingValue;
  cg?: SpacingValue;
}

export interface LayoutProps {
  width?: SizeValue;
  height?: SizeValue;
  minWidth?: SizeValue;
  maxWidth?: SizeValue;
  minHeight?: SizeValue;
  maxHeight?: SizeValue;
  flex?: number | (string & {});
  flexGrow?: number;
  flexShrink?: number;
  flexBasis?: SizeValue;
  flexDirection?: CSSProperties['flexDirection'];
  flexWrap?: CSSProperties['flexWrap'];
  alignItems?: CSSProperties['alignItems'];
  alignSelf?: CSSProperties['alignSelf'];
  alignContent?: CSSProperties['alignContent'];
  justifyContent?: CSSProperties['justifyContent'];
  overflow?: 'visible' | 'hidden' | 'scroll' | 'auto';
  aspectRatio?: number | (string & {});
  display?: CSSProperties['display'];
}

export interface PositionProps {
  position?: CSSProperties['position'];
  top?: SizeValue;
  right?: SizeValue;
  bottom?: SizeValue;
  left?: SizeValue;
  start?: SizeValue;
  end?: SizeValue;
  zIndex?: number;
}

export interface BackgroundProps {
  backgroundColor?: ColorValue;
  bg?: ColorValue;
  opacity?: number;
}

export interface BorderProps {
  borderWidth?: number;
  borderTopWidth?: number;
  borderRightWidth?: number;
  borderBottomWidth?: number;
  borderLeftWidth?: number;
  borderStartWidth?: number;
  borderEndWidth?: number;
  borderColor?: ColorValue;
  borderTopColor?: ColorValue;
  borderRightColor?: ColorValue;
  borderBottomColor?: ColorValue;
  borderLeftColor?: ColorValue;
  borderStartColor?: ColorValue;
  borderEndColor?: ColorValue;
  borderRadius?: RadiusValue;
  borderTopLeftRadius?: RadiusValue;
  borderTopRightRadius?: RadiusValue;
  borderBottomLeftRadius?: RadiusValue;
  borderBottomRightRadius?: RadiusValue;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
}

export interface TextStyleProps {
  color?: ColorValue;
  textAlign?: CSSProperties['textAlign'];
  fontSize?: number;
  lineHeight?: number | (string & {});
  letterSpacing?: number;
  fontWeight?: CSSProperties['fontWeight'];
  fontStyle?: CSSProperties['fontStyle'];
  fontFamily?: string;
  textTransform?: CSSProperties['textTransform'];
  textDecorationLine?: 'none' | 'underline' | 'line-through' | 'underline line-through';
}

export type BoxStyleProps = SpacingProps &
  LayoutProps &
  PositionProps &
  BackgroundProps &
  BorderProps;
export type AllStyleProps = BoxStyleProps & TextStyleProps;

// --- value converters -------------------------------------------------------------------------

const px = (v: number | string): string => (typeof v === 'number' ? `${v}px` : v);

const space = (v: SpacingValue): string => {
  if (typeof v === 'number') return px(v);
  if (v in spacing) return px(spacing[v as SpacingKey]);
  return v;
};

const color = (v: ColorValue): string => (isColorToken(v) ? colorVar(v) : v);

const radius = (v: RadiusValue): string => {
  if (typeof v === 'number') return px(v);
  if (v in borderRadii) return px(borderRadii[v as RadiusKey]);
  return v;
};

type Setter = (style: Record<string, string | number>, value: never) => void;

const set =
  (prop: keyof CSSProperties, conv: (v: never) => string | number): Setter =>
  (style, value) => {
    style[prop] = conv(value);
  };

const setMany =
  (props: (keyof CSSProperties)[], conv: (v: never) => string | number): Setter =>
  (style, value) => {
    const out = conv(value);
    for (const p of props) style[p] = out;
  };

const asIs = (v: string | number): string | number => v;
const spaceC = space as (v: never) => string;
const pxC = px as (v: never) => string;
const colorC = color as (v: never) => string;
const radiusC = radius as (v: never) => string;
const asIsC = asIs as (v: never) => string | number;

const HANDLERS: Record<keyof AllStyleProps, Setter> = {
  // spacing
  margin: set('margin', spaceC),
  marginTop: set('marginTop', spaceC),
  marginRight: set('marginRight', spaceC),
  marginBottom: set('marginBottom', spaceC),
  marginLeft: set('marginLeft', spaceC),
  marginStart: set('marginInlineStart', spaceC),
  marginEnd: set('marginInlineEnd', spaceC),
  marginHorizontal: setMany(['marginLeft', 'marginRight'], spaceC),
  marginVertical: setMany(['marginTop', 'marginBottom'], spaceC),
  padding: set('padding', spaceC),
  paddingTop: set('paddingTop', spaceC),
  paddingRight: set('paddingRight', spaceC),
  paddingBottom: set('paddingBottom', spaceC),
  paddingLeft: set('paddingLeft', spaceC),
  paddingStart: set('paddingInlineStart', spaceC),
  paddingEnd: set('paddingInlineEnd', spaceC),
  paddingHorizontal: setMany(['paddingLeft', 'paddingRight'], spaceC),
  paddingVertical: setMany(['paddingTop', 'paddingBottom'], spaceC),
  gap: set('gap', spaceC),
  rowGap: set('rowGap', spaceC),
  columnGap: set('columnGap', spaceC),
  m: set('margin', spaceC),
  mt: set('marginTop', spaceC),
  mr: set('marginRight', spaceC),
  mb: set('marginBottom', spaceC),
  ml: set('marginLeft', spaceC),
  ms: set('marginInlineStart', spaceC),
  me: set('marginInlineEnd', spaceC),
  mx: setMany(['marginLeft', 'marginRight'], spaceC),
  my: setMany(['marginTop', 'marginBottom'], spaceC),
  p: set('padding', spaceC),
  pt: set('paddingTop', spaceC),
  pr: set('paddingRight', spaceC),
  pb: set('paddingBottom', spaceC),
  pl: set('paddingLeft', spaceC),
  ps: set('paddingInlineStart', spaceC),
  pe: set('paddingInlineEnd', spaceC),
  px: setMany(['paddingLeft', 'paddingRight'], spaceC),
  py: setMany(['paddingTop', 'paddingBottom'], spaceC),
  g: set('gap', spaceC),
  rg: set('rowGap', spaceC),
  cg: set('columnGap', spaceC),
  // layout
  width: set('width', pxC),
  height: set('height', pxC),
  minWidth: set('minWidth', pxC),
  maxWidth: set('maxWidth', pxC),
  minHeight: set('minHeight', pxC),
  maxHeight: set('maxHeight', pxC),
  flex: set('flex', asIsC),
  flexGrow: set('flexGrow', asIsC),
  flexShrink: set('flexShrink', asIsC),
  flexBasis: set('flexBasis', pxC),
  flexDirection: set('flexDirection', asIsC),
  flexWrap: set('flexWrap', asIsC),
  alignItems: set('alignItems', asIsC),
  alignSelf: set('alignSelf', asIsC),
  alignContent: set('alignContent', asIsC),
  justifyContent: set('justifyContent', asIsC),
  overflow: set('overflow', asIsC),
  aspectRatio: set('aspectRatio', asIsC),
  display: set('display', asIsC),
  // position
  position: set('position', asIsC),
  top: set('top', pxC),
  right: set('right', pxC),
  bottom: set('bottom', pxC),
  left: set('left', pxC),
  start: set('insetInlineStart', pxC),
  end: set('insetInlineEnd', pxC),
  zIndex: set('zIndex', asIsC),
  // background
  backgroundColor: set('backgroundColor', colorC),
  bg: set('backgroundColor', colorC),
  opacity: set('opacity', asIsC),
  // border
  borderWidth: set('borderWidth', pxC),
  borderTopWidth: set('borderTopWidth', pxC),
  borderRightWidth: set('borderRightWidth', pxC),
  borderBottomWidth: set('borderBottomWidth', pxC),
  borderLeftWidth: set('borderLeftWidth', pxC),
  borderStartWidth: set('borderInlineStartWidth', pxC),
  borderEndWidth: set('borderInlineEndWidth', pxC),
  borderColor: set('borderColor', colorC),
  borderTopColor: set('borderTopColor', colorC),
  borderRightColor: set('borderRightColor', colorC),
  borderBottomColor: set('borderBottomColor', colorC),
  borderLeftColor: set('borderLeftColor', colorC),
  borderStartColor: set('borderInlineStartColor', colorC),
  borderEndColor: set('borderInlineEndColor', colorC),
  borderRadius: set('borderRadius', radiusC),
  borderTopLeftRadius: set('borderTopLeftRadius', radiusC),
  borderTopRightRadius: set('borderTopRightRadius', radiusC),
  borderBottomLeftRadius: set('borderBottomLeftRadius', radiusC),
  borderBottomRightRadius: set('borderBottomRightRadius', radiusC),
  borderStyle: set('borderStyle', asIsC),
  // text
  color: set('color', colorC),
  textAlign: set('textAlign', asIsC),
  fontSize: set('fontSize', pxC),
  lineHeight: set('lineHeight', pxC),
  letterSpacing: set('letterSpacing', pxC),
  fontWeight: set('fontWeight', asIsC),
  fontStyle: set('fontStyle', asIsC),
  fontFamily: set('fontFamily', asIsC),
  textTransform: set('textTransform', asIsC),
  textDecorationLine: set('textDecorationLine', asIsC),
};

const BORDER_WIDTH_KEYS = new Set<string>([
  'borderWidth',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStartWidth',
  'borderEndWidth',
]);

export const styleKeys = new Set<string>(Object.keys(HANDLERS));

export function isStyleKey(key: string): key is keyof AllStyleProps {
  return styleKeys.has(key);
}

export interface ResolvedStyleProps<R> {
  style: CSSProperties;
  rest: R;
}

/**
 * Splits `props` into resolved inline `style` (restyle vocabulary → CSS) and `rest` (everything else).
 * A border width without an explicit `borderStyle` gets `solid` (RN default; CSS default is `none`).
 */
export function resolveStyleProps<P extends object>(
  props: P,
): ResolvedStyleProps<Omit<P, keyof AllStyleProps>> {
  const style: Record<string, string | number> = {};
  const rest: Record<string, unknown> = {};
  let hasBorderWidth = false;
  let hasBorderStyle = false;
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue;
    if (isStyleKey(key)) {
      HANDLERS[key](style, value as never);
      if (BORDER_WIDTH_KEYS.has(key)) hasBorderWidth = true;
      if (key === 'borderStyle') hasBorderStyle = true;
    } else {
      rest[key] = value;
    }
  }
  if (hasBorderWidth && !hasBorderStyle) style.borderStyle = 'solid';
  return { style: style as CSSProperties, rest: rest as Omit<P, keyof AllStyleProps> };
}

/** Merge resolved props with an explicit `style` prop (explicit wins). */
export function mergeStyle(
  resolved: CSSProperties,
  explicit?: CSSProperties,
): CSSProperties | undefined {
  if (!explicit) return Object.keys(resolved).length ? resolved : undefined;
  return { ...resolved, ...explicit };
}

export { px as toPx, space as toSpace, color as toColor, radius as toRadius };

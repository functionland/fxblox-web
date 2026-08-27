/**
 * Fx design tokens — values copied verbatim from
 * E:\GitHub\fx\libs\component-library\src\lib\theme\theme.ts (paletteLight / paletteDark + semantic map),
 * plus five tokens that mobile screens reference but the mobile theme never defined
 * (borderBase, successMuted, errorMuted, warningMuted, infoMuted).
 */
export const colorTokens = [
  'backgroundApp',
  'backgroundPrimary',
  'backgroundSecondary',
  'border',
  'borderBase',
  'content1',
  'content2',
  'content3',
  'greenPressed',
  'greenBase',
  'greenHover',
  'greenBorder',
  'greenBackground',
  'successBase',
  'successMuted',
  'infoBase',
  'infoMuted',
  'warningBase',
  'warningMuted',
  'errorBase',
  'errorMuted',
  'primary',
  'secondary',
  'white',
  'transparent',
] as const;

export type ColorToken = (typeof colorTokens)[number];

export const lightColors: Record<ColorToken, string> = {
  backgroundApp: '#FFFFFF',
  backgroundPrimary: '#F8F9FA',
  backgroundSecondary: '#E9ECEF',
  border: '#CED4DA',
  borderBase: '#CED4DA',
  content1: '#343A40',
  content2: '#495057',
  content3: '#6F767D',
  greenPressed: '#038082',
  greenBase: '#049B8F',
  greenHover: '#06B597',
  greenBorder: '#97F7CC',
  greenBackground: '#CAFBE0',
  successBase: '#37B24D',
  successMuted: '#D3F9D8',
  infoBase: '#1C7ED6',
  infoMuted: '#D0EBFF',
  warningBase: '#FAB005',
  warningMuted: '#FFF3BF',
  errorBase: '#FA4343',
  errorMuted: '#FFE3E3',
  primary: '#06B597',
  secondary: '#187AF9',
  white: '#FFFFFF',
  transparent: 'rgba(0,0,0,0)',
};

export const darkColors: Record<ColorToken, string> = {
  backgroundApp: '#212529',
  backgroundPrimary: '#343A40',
  backgroundSecondary: '#495057',
  border: '#868E96',
  borderBase: '#868E96',
  content1: '#F8F9FA',
  content2: '#E9ECEF',
  content3: '#CED4DA',
  greenPressed: '#038082',
  greenBase: '#049B8F',
  greenHover: '#06B597',
  greenBorder: '#035B4C',
  greenBackground: '#02362D',
  successBase: '#37B24D',
  successMuted: '#1C5927',
  infoBase: '#1C7ED6',
  infoMuted: '#0E3F6B',
  warningBase: '#FCC419',
  warningMuted: '#806A1D',
  errorBase: '#FA5252',
  errorMuted: '#7D2929',
  primary: '#06B597',
  secondary: '#187AF9',
  white: '#FFFFFF',
  transparent: 'rgba(0,0,0,0)',
};

/** restyle spacing keys ('0'…'80', 4pt scale) → px. */
export const spacing = {
  '0': 0,
  '4': 4,
  '8': 8,
  '12': 12,
  '16': 16,
  '20': 20,
  '24': 24,
  '32': 32,
  '40': 40,
  '48': 48,
  '56': 56,
  '64': 64,
  '72': 72,
  '80': 80,
} as const;

export type SpacingKey = keyof typeof spacing;

export const borderRadii = { s: 4, m: 6, l: 20 } as const;
export type RadiusKey = keyof typeof borderRadii;

export const breakpoints = { desktop: 900, wide: 1280 } as const;

export type ColorMode = 'light' | 'dark';
export type ThemeMode = ColorMode | 'auto';

const kebab = (s: string): string => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

/** kebab-case CSS variable name for a token, e.g. backgroundApp → --fx-background-app */
export function cssVar(token: ColorToken): string {
  return `--fx-${kebab(token)}`;
}

/** `var(--fx-…)` expression for a token — use this for runtime inline styles / SVG fills. */
export function colorVar(token: ColorToken): string {
  return `var(${cssVar(token)})`;
}

/** Tailwind theme name for a token (`@theme inline { --color-<name> }`), e.g. backgroundApp → background-app */
export function tailwindColorName(token: ColorToken): string {
  return kebab(token);
}

export function isColorToken(value: unknown): value is ColorToken {
  return typeof value === 'string' && (colorTokens as readonly string[]).includes(value);
}

export function colorsFor(mode: ColorMode): Record<ColorToken, string> {
  return mode === 'dark' ? darkColors : lightColors;
}

// --- Text variants (theme.ts `textVariants`) ----------------------------------------------------

export type FontFamilyToken = 'heading' | 'body';

export interface TextVariantSpec {
  fontFamily?: FontFamilyToken;
  fontWeight?: 300 | 400 | 500 | 600;
  fontSize: number;
  lineHeight?: number;
  textTransform?: 'uppercase';
}

/** Mirrors theme.ts textVariants. OpenSans Light/Regular/Semibold = 300/400/600; Montserrat Medium/SemiBold = 500/600. */
export const textVariants = {
  body: { fontSize: 16 },
  eyebrow2: {
    fontFamily: 'heading',
    fontWeight: 500,
    fontSize: 8,
    lineHeight: 10,
    textTransform: 'uppercase',
  },
  bodyXXSRegular: { fontFamily: 'body', fontWeight: 400, fontSize: 10, lineHeight: 14 },
  bodyXSLight: { fontFamily: 'body', fontWeight: 300, fontSize: 12, lineHeight: 16 },
  bodyXSRegular: { fontFamily: 'body', fontWeight: 400, fontSize: 12, lineHeight: 16 },
  bodyXSSemibold: { fontFamily: 'body', fontWeight: 600, fontSize: 12, lineHeight: 16 },
  bodySmallLight: { fontFamily: 'body', fontWeight: 300, fontSize: 14, lineHeight: 24 },
  bodySmallRegular: { fontFamily: 'body', fontWeight: 400, fontSize: 14, lineHeight: 24 },
  bodySmallSemibold: { fontFamily: 'body', fontWeight: 600, fontSize: 14, lineHeight: 24 },
  bodyLargeLight: { fontFamily: 'body', fontWeight: 300, fontSize: 20, lineHeight: 30 },
  bodyLargeRegular: { fontFamily: 'body', fontWeight: 400, fontSize: 20, lineHeight: 30 },
  bodyMediumLight: { fontFamily: 'body', fontWeight: 300, fontSize: 16, lineHeight: 28 },
  bodyMediumRegular: { fontFamily: 'body', fontWeight: 400, fontSize: 16, lineHeight: 28 },
  h200: { fontFamily: 'heading', fontWeight: 600, fontSize: 18, lineHeight: 24 },
  h300: { fontFamily: 'heading', fontWeight: 600, fontSize: 24, lineHeight: 36 },
  h400: { fontFamily: 'heading', fontWeight: 600, fontSize: 28, lineHeight: 40 },
} as const satisfies Record<string, TextVariantSpec>;

export type TextVariant = keyof typeof textVariants;

/**
 * Literal class names for every text variant. Tailwind's scanner only picks up literal strings,
 * so components must map through this table rather than build `fx-text-${variant}` dynamically.
 */
export const textVariantClass: Record<TextVariant, string> = {
  body: 'fx-text-body',
  eyebrow2: 'fx-text-eyebrow2',
  bodyXXSRegular: 'fx-text-bodyXXSRegular',
  bodyXSLight: 'fx-text-bodyXSLight',
  bodyXSRegular: 'fx-text-bodyXSRegular',
  bodyXSSemibold: 'fx-text-bodyXSSemibold',
  bodySmallLight: 'fx-text-bodySmallLight',
  bodySmallRegular: 'fx-text-bodySmallRegular',
  bodySmallSemibold: 'fx-text-bodySmallSemibold',
  bodyLargeLight: 'fx-text-bodyLargeLight',
  bodyLargeRegular: 'fx-text-bodyLargeRegular',
  bodyMediumLight: 'fx-text-bodyMediumLight',
  bodyMediumRegular: 'fx-text-bodyMediumRegular',
  h200: 'fx-text-h200',
  h300: 'fx-text-h300',
  h400: 'fx-text-h400',
};

/** Tailwind radius utilities (`--radius-fx-*`; `rounded-s`/`rounded-l` collide with Tailwind's side classes). */
export const radiusClass: Record<RadiusKey, string> = {
  s: 'rounded-fx-s',
  m: 'rounded-fx-m',
  l: 'rounded-fx-l',
};

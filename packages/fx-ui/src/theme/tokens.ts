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
  '0': 0, '4': 4, '8': 8, '12': 12, '16': 16, '20': 20, '24': 24, '32': 32,
  '40': 40, '48': 48, '56': 56, '64': 64, '72': 72, '80': 80,
} as const;

export const borderRadii = { s: 4, m: 6, l: 20 } as const;

export const breakpoints = { desktop: 900, wide: 1280 } as const;

export const APP_HORIZONTAL_PADDING = 20;

export type ColorMode = 'light' | 'dark';

/** kebab-case CSS variable name for a token, e.g. backgroundApp → --fx-background-app */
export function cssVar(token: ColorToken): string {
  return `--fx-${token.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`;
}

/**
 * WebMuffin's Soft Calm design system (v1.0): one violet, everything else
 * whispers. Linen grounds, Cloud surfaces, Graphite instead of black, Index
 * Violet for action and AI only, and four natural tints for quiet meaning.
 *
 * Stated values are the system's own; the in-between steps of each tint
 * (50, 300, 500) are OKLCH mixes of its surface and text pair, and the
 * violet scale follows the system's swatches.
 */

export const softCalmColors = {
  white: '#ffffff',

  // Linen neutrals, lightest to darkest.
  cloud: '#fdfcfa',
  linen: '#f7f5f0',
  linen200: '#efece5',
  linen300: '#e6e2da',
  linen400: '#d2cec6',
  linen500: '#9c99aa',
  slate: '#7a7889',
  slateDeep: '#605e70',
  graphite: '#2e2d3a',

  // Index Violet: action, AI, selection.
  violet50: '#f8f6fd',
  violet100: '#eeebfa',
  violet200: '#ddd8f6',
  violet300: '#c9c2f2',
  violet400: '#958ae7',
  violet500: '#5b4bdb',
  violet600: '#4a3cc8',
  violet700: '#3a2da3',
  violet800: '#2a2178',

  // Natural tints: 100 is the surface, 700 the text (≥ 4.5 : 1 on its surface).
  sage50: '#ecf2e8',
  sage100: '#dce8d6',
  sage300: '#afc2ac',
  sage500: '#809b81',
  sage700: '#4c6e51',

  mist50: '#ebf3f4',
  mist100: '#dce9ee',
  mist300: '#abc2cb',
  mist500: '#789aa6',
  mist700: '#3d6c7c',

  rose50: '#f8eeee',
  rose100: '#f1e0e3',
  rose300: '#d1b1b8',
  rose500: '#ae818b',
  rose700: '#844a5a',

  sand50: '#f7f1e9',
  sand100: '#f1e6d8',
  sand300: '#ccb9a4',
  sand500: '#a68a70',
  sand700: '#7a5634',
} as const;

const sora = 'Sora, Inter, "Helvetica Neue", Arial, sans-serif';
const inter = 'Inter, "Helvetica Neue", Arial, sans-serif';
const serif = 'Newsreader, Georgia, "Times New Roman", serif';
const mono = '"JetBrains Mono", Menlo, Consolas, monospace';

/**
 * Type roles: Sora light and regular for headlines (never heavier than 500),
 * Newsreader for subtext, Inter for reading and UI, lowercase JetBrains Mono
 * for metadata and scores.
 */
export const softCalmType = {
  display: { family: sora, weight: 300, lineHeight: 1.1, letterSpacing: -1.6 },
  headline: { family: sora, weight: 400, lineHeight: 1.14, letterSpacing: -1.2 },
  title: { family: sora, weight: 500, lineHeight: 1.3, letterSpacing: -0.3 },
  subtext: { family: serif, weight: 400, lineHeight: 1.3, letterSpacing: -0.2 },
  body: { family: inter, weight: 400, lineHeight: 1.5 },
  label: { family: inter, weight: 500, lineHeight: 1.3 },
  mono: { family: mono, weight: 400, lineHeight: 1.35 },
} as const;

/** Corner radii: chips, inputs, cards; buttons and tags are full pills. */
export const softCalmRadii = { chip: 10, input: 16, card: 26 } as const;

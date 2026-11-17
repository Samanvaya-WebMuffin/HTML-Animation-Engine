/**
 * The Cowork theme, on WebMuffin's Soft Calm design system (`softcalm.ts`):
 * Linen grounds lit by a soft violet aurora, Cloud surfaces, Graphite text,
 * Index Violet only for action and AI, and natural tints that each carry
 * one meaning everywhere they appear. Every colour token for the Cowork
 * video lives here; components use the named `components` tokens, never
 * palette values directly.
 *
 * Meanings (never used for anything else):
 *   violet — Cowork acting: the hub, the primary action, AI answers, selection
 *   mist   — knowledge and sources: documents, emails, citations, data flowing
 *   rose   — people and teams; with its deeper text, friction and no access
 *   sand   — insight and time: highlighted passages, key figures, clocks
 *   sage   — outcomes: verified, done, saved, high confidence, growth
 *
 * Ramps: 50 lightest tint, 100 surfaces, 300 glows and aurora light, 500
 * fills, dots and strokes, 700 text (≥ 4.5 : 1 on its 100 surface).
 */
import { formatColor, oklchToRgb, parseColor, rgbToOklch } from '../color/color.js';
import { cubicBezier } from '../easing/cubic-bezier.js';
import { linear } from '../easing/ease.js';
import { spring } from '../easing/spring.js';
import { defaultTheme } from './default.js';
import { softCalmColors, softCalmType } from './softcalm.js';
import { defineTheme } from './theme.js';

/**
 * On a phone screen the system's quiet tints read as grey, so the film shows
 * them a little more vivid: every violet and tint step keeps its lightness
 * and hue, with its OKLCH chroma raised by this factor (neutrals unchanged).
 */
const VIVID = 1.4;
const vivid = (hex: string): string => {
  const o = rgbToOklch(parseColor(hex));
  return formatColor(oklchToRgb({ ...o, c: o.c * VIVID }));
};
type SoftCalm = typeof softCalmColors;
type Key = keyof SoftCalm;
const isTint = (key: string) => /^(violet|sage|mist|rose|sand)\d+$/.test(key);
const film = Object.fromEntries(
  (Object.keys(softCalmColors) as Key[]).map((key) => [
    key,
    isTint(key) ? vivid(softCalmColors[key]) : softCalmColors[key],
  ]),
) as Readonly<Record<Key, string>>;

const palette = {
  ...film,
  /** Shadows are cast in a violet-tinted graphite, never black. */
  shadow: '#2a2640',
  /** Alarm red: only for what is lost (the pinboard's question marks). */
  red: '#e5383b',
  redSoft: '#ffb3b0',
  /** Coral: the words "is lost" in the opening line (warm, readable on Cloud). */
  coral: '#f0533f',
  coralSoft: '#ffc2b8',
  /** A clock running out: go, hurry, late. */
  go: '#22b45a',
  hurry: '#f28c18',
} as const;

const p = palette;

/** A named colour for every part of every component. */
const components = {
  bg: { canvas: p.linen, grid: p.linen200, gridMajor: p.linen300 },
  /** Light pools on the background: mostly violet, one meaning hint at a time. */
  // Index Violet is calmer than the old electric violet, so the light uses
  // its deeper steps to read on Linen as clearly.
  aurora: {
    primary: p.violet400,
    soft: p.violet300,
    deep: p.violet500,
    knowledge: p.mist500,
    people: p.rose500,
    insight: p.sand500,
    time: p.sand500,
    outcome: p.sage500,
    friction: p.rose500,
  },
  surface: {
    paper: p.cloud,
    raised: p.cloud,
    sunken: p.linen,
    tint: p.violet100,
    /** Frosted glass: Cloud at this opacity over whatever is behind. */
    glass: p.cloud,
  },
  stroke: {
    hairline: p.linen300,
    strong: p.linen400,
    focus: p.violet200,
    connector: p.linen400,
    connectorActive: p.violet500,
  },
  text: {
    primary: p.graphite,
    secondary: p.slateDeep,
    tertiary: p.slate,
    accent: p.violet500,
    onBrand: p.white,
  },
  brand: {
    fill: p.violet500,
    deep: p.violet700,
    glow: p.violet300,
    soft: p.violet200,
    tint: p.violet100,
  },
  /**
   * The one key action on a screen is solid Index Violet (Send, Join the
   * waitlist); other actions are Violet Haze (`soft*`) or hairline Cloud
   * (`secondary*`). Buttons never darken hard.
   */
  button: {
    primaryBg: p.violet500,
    primaryTop: p.violet400,
    primaryFg: p.white,
    primaryStroke: p.violet500,
    softBg: p.violet100,
    softFg: p.violet600,
    secondaryBg: p.cloud,
    secondaryFg: p.graphite,
    secondaryStroke: p.linen300,
  },
  source: { bg: p.mist100, fg: p.mist700, icon: p.mist500, glow: p.mist300, pulse: p.mist500 },
  person: { bg: p.rose100, fg: p.rose700, fill: p.rose500, glow: p.rose300, pulse: p.rose500 },
  insight: { bg: p.sand100, fg: p.sand700, marker: p.sand100, fill: p.sand500 },
  time: { bg: p.sand50, fg: p.sand700, ring: p.sand500, track: p.sand100 },
  outcome: { bg: p.sage100, fg: p.sage700, fill: p.sage500, glow: p.sage300 },
  friction: { bg: p.rose100, fg: p.rose700, fill: p.rose500, glow: p.rose300 },
  status: { running: p.violet400, done: p.sage500, restricted: p.rose500, insight: p.sand500 },
  citation: { bg: p.violet100, number: p.violet600, hover: p.violet200 },
  /** Questions people send: Graphite bubbles with Cloud text. */
  message: { bg: p.graphite, fg: p.cloud, unread: p.rose500 },
  confidence: { bg: p.sage100, fg: p.sage700, dot: p.sage500 },
  /** What is lost: red question marks where knowledge used to be. */
  lost: { mark: p.red, glow: p.redSoft, coral: p.coral, coralGlow: p.coralSoft },
  /** A clock running out, start to end (mixed in OKLCH). */
  urgency: { start: p.go, middle: p.hurry, end: p.red },
  /** The Cowork mark: knowledge, people, insight and outcomes, together on a violet tile. */
  mark: {
    knowledge: p.mist100,
    people: p.rose100,
    insight: p.sand100,
    outcome: p.sage100,
    tile: p.violet500,
  },
  /** People are all in the rose family, told apart by tint. */
  avatar: {
    rep: p.rose500,
    coo: p.rose700,
    hr: p.rose500,
    intern: p.rose300,
    cfo: p.rose700,
    team: p.rose300,
  },
} as const;

export const coworkTheme = defineTheme({
  name: 'cowork',

  colors: palette,
  components,

  // Sora for headlines and titles, Newsreader for subtext, Inter for UI and
  // reading, JetBrains Mono for metadata (all bundled with the examples).
  type: softCalmType,

  easing: {
    linear,
    /** Strong ease-out: fast arrival, long gentle settle. */
    enter: cubicBezier(0.16, 1, 0.3, 1),
    exit: cubicBezier(0.7, 0, 0.84, 0),
    /** Barely-there spring (ζ ≈ 0.73, ~4 % overshoot): only for physical contact. */
    snap: spring({ stiffness: 320, damping: 26 }),
    camera: cubicBezier(0.65, 0, 0.35, 1),
    wipe: cubicBezier(0.77, 0, 0.175, 1),
    /** Focus pulls: a quick start that eases gently into sharp focus. */
    focus: cubicBezier(0.33, 0, 0.2, 1),
    /** Slow drifts that never stop dead. */
    drift: cubicBezier(0.45, 0, 0.55, 1),
  },

  durations: {
    fast: 0.25,
    base: 0.45,
    slow: 0.8,
    camera: 1.4,
    stagger: 0.06,
    /** Between letters of a kinetic headline. */
    letter: 0.018,
    /** A move between two groups on the board. */
    flight: 1.25,
  },

  lighting: {
    shadow: p.shadow,
    highlight: p.white,
    // Wide, faint blur, no hard offsets.
    elevation: {
      low: [
        { y: 1, blur: 3, alpha: 0.05 },
        { y: 8, blur: 24, alpha: 0.06 },
      ],
      mid: [
        { y: 2, blur: 6, alpha: 0.04 },
        { y: 16, blur: 40, alpha: 0.07 },
        { y: 32, blur: 88, alpha: 0.06 },
      ],
      high: [
        { y: 3, blur: 8, alpha: 0.05 },
        { y: 24, blur: 56, alpha: 0.09 },
        { y: 56, blur: 130, alpha: 0.08 },
      ],
    },
    sheen: 0.1,
    shade: 0.03,
    glow: 0.45,
    backdrop: { centre: p.cloud, edge: p.linen },
  },

  // The video keeps the default theme's key, kit and room.
  sound: defaultTheme.sound,
});

export type CoworkTheme = typeof coworkTheme;

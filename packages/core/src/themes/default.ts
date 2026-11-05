/**
 * The default theme. Every design token lives here: colours, type, easing
 * and durations. Edit this file to restyle every example that uses it.
 * Examples import tokens from here and never hard-code hex values.
 */
import { cubicBezier } from '../easing/cubic-bezier.js';
import { linear } from '../easing/ease.js';
import { spring } from '../easing/spring.js';
import { defineTheme } from './theme.js';

const colors = {
  ink: '#0d0e12',
  paper: '#f4f1ea',
  surface: '#1a1c22',
  muted: '#8a8f9c',
  lime: '#c6ff3d',
  pink: '#ff5fa2',
  blue: '#3d7cff',
  orange: '#ff8a3d',
  violet: '#8b5cff',
  /** Deepest tone: cast shadows and vignette edges. */
  shade: '#030407',
  /** Lifted backdrop centre, between ink and surface. */
  dusk: '#171a22',
  /** Pure light: sheens, speculars, glints. */
  light: '#ffffff',
} as const;

export const defaultTheme = defineTheme({
  name: 'default',

  colors,

  type: {
    // Inter and JetBrains Mono are bundled with the examples (OFL); register them via `fontFaces`
    // so text measures and renders the same on every machine.
    display: {
      family: 'Inter, "Helvetica Neue", Arial, sans-serif',
      weight: 800,
      lineHeight: 1.05,
      letterSpacing: -1,
    },
    body: {
      family: 'Inter, "Helvetica Neue", Arial, sans-serif',
      weight: 400,
      lineHeight: 1.35,
    },
    mono: {
      family: '"JetBrains Mono", Menlo, Consolas, monospace',
      weight: 500,
      lineHeight: 1.3,
    },
  },

  easing: {
    linear,
    /** Strong ease-out (expo-like): fast arrival, long gentle settle. */
    enter: cubicBezier(0.16, 1, 0.3, 1),
    /** Ease-in: accelerates away. */
    exit: cubicBezier(0.7, 0, 0.84, 0),
    /** Underdamped spring (ζ ≈ 0.55): ~12 % overshoot, then settles. */
    snap: spring({ stiffness: 400, damping: 22 }),
    /** Symmetric ease-in-out for camera moves. */
    camera: cubicBezier(0.65, 0, 0.35, 1),
    /** Steep in-out for wipes and reveals. */
    wipe: cubicBezier(0.77, 0, 0.175, 1),
  },

  lighting: {
    shadow: colors.shade,
    highlight: colors.light,
    elevation: {
      low: [
        { y: 1, blur: 2, alpha: 0.45 },
        { y: 4, blur: 10, alpha: 0.3 },
      ],
      mid: [
        { y: 2, blur: 4, alpha: 0.4 },
        { y: 10, blur: 24, alpha: 0.35 },
        { y: 24, blur: 56, alpha: 0.3 },
      ],
      high: [
        { y: 3, blur: 6, alpha: 0.35 },
        { y: 18, blur: 40, alpha: 0.4 },
        { y: 44, blur: 96, alpha: 0.35 },
      ],
    },
    sheen: 0.2,
    shade: 0.16,
    glow: 0.55,
    backdrop: { centre: colors.dusk, edge: colors.shade },
  },

  durations: {
    fast: 0.25,
    base: 0.45,
    slow: 0.8,
    camera: 1.4,
    stagger: 0.06,
  },
});

export type DefaultTheme = typeof defaultTheme;

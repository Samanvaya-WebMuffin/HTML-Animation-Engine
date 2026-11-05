/**
 * Light and shadow helpers: lit surfaces, stacked shadows, glows, backdrops,
 * specular sweeps and ground shadows. Each returns plain scene data, so it
 * works in every renderer and stays a pure function of its inputs.
 *
 * Light comes from above: lit surfaces are lighter at the top and shadows
 * fall straight down. Pass the theme's `LightingTokens` for the house look.
 */
import {
  circle,
  clamp,
  groupNode,
  lerp,
  linearGradient,
  mixColors,
  radialGradient,
  rect,
  shapeNode,
  withAlpha,
  type Geometry,
  type GroupNode,
  type LightingTokens,
  type LinearGradient,
  type Shadow,
  type ShadowLayer,
  type ShapeNode,
} from '@html-animation-engine/core';
import type { Box } from './reveal.js';

export type Elevation = keyof LightingTokens['elevation'];

export interface ElevationOptions {
  /** Multiplies every layer's opacity (e.g. 0.5 on a light background). Default 1. */
  readonly strength?: number;
  /**
   * How high the object is, 0–1+: scales offsets and blur, and fades the
   * shadow as it rises (a lifted object casts a softer, fainter shadow). Default 1.
   */
  readonly lift?: number;
  /** Horizontal offset, for light that is not straight above. Default 0. */
  readonly x?: number;
}

/** A stacked drop shadow (contact, key and ambient layers) for an elevation token. */
export function elevationShadows(
  lighting: LightingTokens,
  level: Elevation | readonly ShadowLayer[],
  options: ElevationOptions = {},
): Shadow[] {
  const layers = typeof level === 'string' ? lighting.elevation[level] : level;
  const lift = Math.max(options.lift ?? 1, 0);
  const strength = (options.strength ?? 1) / Math.max(1, Math.sqrt(lift));
  return layers.map((layer) => ({
    x: (options.x ?? 0) * lift,
    y: layer.y * lift,
    blur: layer.blur * Math.max(lift, 0.15),
    color: withAlpha(lighting.shadow, clamp(layer.alpha * strength, 0, 1)),
  }));
}

export interface GlowOptions {
  /** Outer radius of the glow in px. Default 24. */
  readonly radius?: number;
  /** 0–1+, multiplies the theme's glow opacity. Default 1. */
  readonly strength?: number;
}

/** A coloured glow (a tight core and a wide halo) to use as a node's shadow. */
export function glowShadows(
  lighting: LightingTokens,
  color: string,
  options: GlowOptions = {},
): Shadow[] {
  const radius = options.radius ?? 24;
  const alpha = lighting.glow * (options.strength ?? 1);
  return [
    { x: 0, y: 0, blur: radius, color: withAlpha(color, clamp(alpha * 0.7, 0, 1)) },
    { x: 0, y: 0, blur: radius * 0.35, color: withAlpha(color, clamp(alpha, 0, 1)) },
  ];
}

/**
 * Vertical gradient for a surface lit from above: `top` and `bottom` are the
 * surface's top and bottom edges in local px.
 */
export function litGradient(
  lighting: LightingTokens,
  color: string,
  top: number,
  bottom: number,
  options: { readonly sheen?: number; readonly shade?: number } = {},
): LinearGradient {
  const sheen = options.sheen ?? lighting.sheen;
  const shade = options.shade ?? lighting.shade;
  return linearGradient(0, top, 0, bottom, [
    { offset: 0, color: mixColors(color, lighting.highlight, sheen) },
    { offset: 0.45, color },
    { offset: 1, color: mixColors(color, lighting.shadow, shade) },
  ]);
}

/** `litGradient` spanning a centred box (such as a `rect`). */
export function litFill(
  lighting: LightingTokens,
  color: string,
  box: { readonly y: number; readonly height: number },
  options?: { readonly sheen?: number; readonly shade?: number },
): LinearGradient {
  const h = Math.abs(box.height);
  return litGradient(lighting, color, box.y - h / 2, box.y + h / 2, options);
}

/** A soft light placed in the backdrop. */
export interface BackdropLight {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: string;
  /** 0–1. Default 0.18. */
  readonly alpha?: number;
}

export interface BackdropOptions {
  readonly width: number;
  readonly height: number;
  /** Where the backdrop is brightest. Default: a little above the centre. */
  readonly focus?: { readonly x: number; readonly y: number };
  /** Coloured light pools on the backdrop (e.g. accent colours, drifting with `t`). */
  readonly lights?: readonly BackdropLight[];
  /** Override the theme's centre and edge colours (e.g. for a paper backdrop). */
  readonly centre?: string;
  readonly edge?: string;
}

/**
 * A full-frame backdrop: a soft pool of light that falls off into a
 * vignette, plus optional coloured light pools. Draw it first.
 */
export function backdrop(
  id: string,
  lighting: LightingTokens,
  options: BackdropOptions,
): GroupNode {
  const { width, height } = options;
  const centre = options.centre ?? lighting.backdrop.centre;
  const edge = options.edge ?? lighting.backdrop.edge;
  const focus = options.focus ?? { x: width / 2, y: height * 0.42 };
  const reach = Math.hypot(Math.max(focus.x, width - focus.x), Math.max(focus.y, height - focus.y));
  const frame = rect(width / 2, height / 2, width, height);
  return groupNode(`${id}`, [
    shapeNode(`${id}-base`, {
      geometry: frame,
      fill: radialGradient(focus.x, focus.y, reach, [
        { offset: 0, color: centre },
        { offset: 0.55, color: mixColors(centre, edge, 0.45) },
        { offset: 1, color: edge },
      ]),
    }),
    ...(options.lights ?? []).map((light, i) =>
      shapeNode(`${id}-light${i}`, {
        geometry: frame,
        fill: radialGradient(light.x, light.y, light.radius, [
          { offset: 0, color: withAlpha(light.color, light.alpha ?? 0.18) },
          { offset: 0.5, color: withAlpha(light.color, (light.alpha ?? 0.18) * 0.35) },
          { offset: 1, color: withAlpha(light.color, 0) },
        ]),
      }),
    ),
  ]);
}

export interface SweepOptions {
  /** Width of the bright band, in px. Default 60. */
  readonly width?: number;
  /** Direction the band travels, in degrees (0 = left to right). Default 20. */
  readonly angle?: number;
  /** Peak opacity of the band. Default 0.35. */
  readonly strength?: number;
  readonly color: string;
}

/**
 * A specular sweep: a bright band crossing `bounds` as `p` goes 0 → 1,
 * clipped to `clip`. Returns `null` outside 0 < p < 1. Place it right after
 * the node it lights, in the same coordinates.
 */
export function lightSweep(
  id: string,
  clip: Geometry,
  bounds: Box,
  p: number,
  options: SweepOptions,
): GroupNode | null {
  if (!(p > 0 && p < 1)) return null;
  const band = options.width ?? 60;
  const angle = ((options.angle ?? 20) * Math.PI) / 180;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  // Length of the bounds projected on the travel direction, plus room for the band.
  const span = Math.abs(bounds.width * dx) + Math.abs(bounds.height * dy) + band * 2;
  const x1 = bounds.x - (dx * span) / 2;
  const y1 = bounds.y - (dy * span) / 2;
  const centre = lerp(band / span, 1 - band / span, p);
  const half = band / 2 / span;
  const clear = withAlpha(options.color, 0);
  return groupNode(
    id,
    [
      shapeNode(`${id}-band`, {
        geometry: rect(bounds.x, bounds.y, bounds.width + 2, bounds.height + 2),
        // A soft bell rather than a triangle, so the band has no crease at its peak.
        fill: linearGradient(
          x1,
          y1,
          x1 + dx * span,
          y1 + dy * span,
          BELL.map(([at, a]) => ({
            offset: centre + at * half,
            color: a === 0 ? clear : withAlpha(options.color, (options.strength ?? 0.35) * a),
          })),
        ),
      }),
    ],
    { clip },
  );
}

/** Offsets (in band half-widths) and relative opacities of a sweep's soft profile. */
const BELL: readonly (readonly [number, number])[] = [
  [-1, 0],
  [-0.6, 0.22],
  [-0.3, 0.7],
  [0, 1],
  [0.3, 0.7],
  [0.6, 0.22],
  [1, 0],
];

export interface GroundShadowOptions {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: string;
  /** Opacity at the centre. Default 0.6. */
  readonly alpha?: number;
}

/** A soft elliptical shadow on the ground, e.g. beneath a floating or 3D object. */
export function groundShadow(id: string, options: GroundShadowOptions): ShapeNode {
  const r = Math.max(options.width / 2, 0.001);
  const alpha = options.alpha ?? 0.6;
  return shapeNode(id, {
    geometry: circle(0, 0, r),
    fill: radialGradient(0, 0, r, [
      { offset: 0, color: withAlpha(options.color, alpha) },
      { offset: 0.5, color: withAlpha(options.color, alpha * 0.45) },
      { offset: 1, color: withAlpha(options.color, 0) },
    ]),
    transform: {
      x: options.x,
      y: options.y,
      scaleY: Math.max(options.height / options.width, 0.001),
    },
  });
}

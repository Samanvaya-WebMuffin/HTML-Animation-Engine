import {
  clamp,
  groupNode,
  lerp,
  linear,
  morph,
  pathLength,
  pathGeometry,
  progress,
  random,
  rect,
  shapeNode,
  staggerOrder,
  type Ease,
  type Geometry,
  type GroupNode,
  type MorphFrame,
  type MorphKey,
  type Paint,
  type SceneNode,
  type Shadow,
  type Shadows,
  type ShapeNode,
  type Stroke,
} from '@html-animation-engine/core';
import type { Timing } from './reveal.js';

export interface ShapeMorphOptions {
  readonly id: string;
  readonly keys: readonly MorphKey[];
  /** Position of the shape's local origin. */
  readonly x: number;
  readonly y: number;
  readonly stroke?: Stroke;
  /** Shadows, fixed or derived from the current form (e.g. a glow in its colour). */
  readonly shadow?: Shadows | ((form: MorphFrame) => Shadows);
  /** Turns the current form's colour into a paint (e.g. a lit gradient). Default: the solid colour. */
  readonly paint?: (form: MorphFrame) => Paint;
  readonly samples?: number;
}

/** One shape changing form over time (see core `morph`). */
export function shapeMorph(options: ShapeMorphOptions): (t: number) => ShapeNode {
  const track = morph(options.keys, options.samples ? { samples: options.samples } : {});
  return (t) => {
    const form = track.at(t);
    const fill = form.fill === undefined ? undefined : (options.paint?.(form) ?? form.fill);
    const shadow = typeof options.shadow === 'function' ? options.shadow(form) : options.shadow;
    return shapeNode(options.id, {
      geometry: form.geometry,
      ...(fill === undefined ? {} : { fill }),
      ...(options.stroke ? { stroke: options.stroke } : {}),
      ...(shadow ? { shadow } : {}),
      opacity: form.opacity,
      transform: { x: options.x, y: options.y, rotation: form.rotation },
    });
  };
}

export interface PathDrawOptions extends Timing {
  readonly id: string;
  readonly d: string;
  readonly color: string;
  readonly width: number;
  readonly cap?: Stroke['cap'];
  readonly join?: Stroke['join'];
  readonly x?: number;
  readonly y?: number;
  readonly scale?: number;
  /** Shadows or glows; they follow the drawn part of the stroke. */
  readonly shadow?: Shadows;
}

/** Draws a path's stroke from start to end (animated stroke-dashoffset). */
export function pathDraw(options: PathDrawOptions): (t: number) => ShapeNode {
  // Pad the dash so rounding in the browser's own length never leaves a gap.
  const length = pathLength(options.d) * 1.02 + 1;
  const geometry = pathGeometry(options.d);
  return (t) => {
    const p = progress(t, options.start, options.duration, options.ease ?? linear);
    return shapeNode(options.id, {
      geometry,
      // At p = 0 draw nothing (a round cap would otherwise show a dot).
      visible: p > 0,
      stroke: {
        color: options.color,
        width: options.width,
        cap: options.cap ?? 'round',
        join: options.join ?? 'round',
        dash: [length, length],
        dashOffset: length * (1 - p),
      },
      ...(options.shadow ? { shadow: options.shadow } : {}),
      transform: { x: options.x ?? 0, y: options.y ?? 0, scale: options.scale ?? 1 },
    });
  };
}

export interface StaggerGridOptions {
  readonly id: string;
  /** Centre of the grid. */
  readonly x: number;
  readonly y: number;
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  readonly gap: number;
  readonly radius?: number;
  readonly colors: readonly string[];
  readonly start: number;
  /** Delay between successive tiles, s. */
  readonly each: number;
  readonly duration: number;
  readonly ease?: Ease;
  /** `'center'` ripples out radially; `'random'` uses `seed`. Default `'start'`. */
  readonly from?: 'start' | 'end' | 'center' | 'random';
  readonly seed?: number | string;
  /** Turns a tile colour into a paint, in the tile's local space (centred on 0, 0). */
  readonly paint?: (color: string) => Paint;
  /** Each tile's shadows, given its eased entrance progress `p` (0 → 1). */
  readonly shadow?: (p: number) => Shadows;
  /**
   * Extra node drawn over a tile, in the tile's local space (moving and
   * scaling with it), e.g. a light sweep. `x`/`y` is the tile's resting centre.
   */
  readonly overlay?: (
    index: number,
    t: number,
    tile: { readonly x: number; readonly y: number },
  ) => SceneNode | null;
}

/** A grid of tiles that pop in one after another. */
export function staggerGrid(options: StaggerGridOptions): (t: number) => GroupNode {
  const { id, cols, rows, cell, gap } = options;
  const count = cols * rows;
  const pitch = cell + gap;
  const tiles = Array.from({ length: count }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const dx = col - (cols - 1) / 2;
    const dy = row - (rows - 1) / 2;
    const order =
      options.from === 'center'
        ? Math.hypot(dx, dy)
        : options.from === 'random'
          ? random(options.seed ?? 0, id, i) * count
          : staggerOrder(i, count, options.from ?? 'start');
    return {
      x: options.x + dx * pitch,
      y: options.y + dy * pitch,
      order,
      color: options.colors[i % options.colors.length] ?? '',
    };
  });
  const paints = tiles.map((tile) => options.paint?.(tile.color) ?? tile.color);
  return (t) =>
    groupNode(
      id,
      tiles.map((tile, i) => {
        const p = progress(
          t,
          options.start + tile.order * options.each,
          options.duration,
          options.ease ?? linear,
        );
        const transform = { x: tile.x, y: tile.y, scale: p, rotation: lerp(-45, 0, clamp(p)) };
        const body = shapeNode(`${id}-${i}`, {
          geometry: rect(0, 0, cell, cell, options.radius ?? 0),
          fill: paints[i] ?? tile.color,
          ...(options.shadow && p > 0 ? { shadow: options.shadow(p) } : {}),
          opacity: clamp(p * 3),
          visible: p > 0,
          transform,
        });
        const extra = p > 0 ? options.overlay?.(i, t, tile) : null;
        if (!extra) return body;
        // The overlay rides on the tile: same transform and fade.
        return groupNode(
          `${id}-${i}-tile`,
          [{ ...body, transform: undefined, opacity: 1 }, extra],
          {
            opacity: clamp(p * 3),
            transform,
          },
        );
      }),
    );
}

export interface LandingOptions extends Timing {
  readonly id: string;
  readonly geometry: Geometry;
  readonly fill: Paint;
  readonly shadowColor: string;
  /** Final position of the element's origin. */
  readonly x: number;
  readonly y: number;
  /** Shadow offset once landed, px. */
  readonly shadow: { readonly x: number; readonly y: number };
  /** How far above its resting place the element starts, px. Default 60. */
  readonly drop?: number;
  /** Scale at the start (lifted towards the viewer). Default 1.12. */
  readonly lift?: number;
  /**
   * Soft shadows beneath the hard one, given the height above the resting
   * place (1 at the start, 0 once landed), e.g. a stacked elevation shadow.
   */
  readonly ambient?: (height: number) => readonly Shadow[];
  /** Extra nodes that ride on the element (e.g. a label), in its local space. */
  readonly content?: readonly SceneNode[] | ((t: number) => readonly SceneNode[]);
}

/**
 * An element that drops into place; its hard offset shadow grows from nothing
 * to full length as it lands.
 */
export function landingShadow(options: LandingOptions): (t: number) => GroupNode {
  const drop = options.drop ?? 60;
  const lift = options.lift ?? 1.12;
  return (t) => {
    const p = progress(t, options.start, options.duration, options.ease ?? linear);
    const shadow = clamp(p, 0, 1.2);
    return groupNode(
      options.id,
      [
        shapeNode(`${options.id}-body`, {
          geometry: options.geometry,
          fill: options.fill,
          shadow: [
            ...(options.ambient?.(clamp(1 - p, 0, 1)) ?? []),
            {
              x: options.shadow.x * shadow,
              y: options.shadow.y * shadow,
              color: options.shadowColor,
            },
          ],
        }),
        ...(typeof options.content === 'function' ? options.content(t) : (options.content ?? [])),
      ],
      {
        opacity: clamp(p * 4),
        transform: { x: options.x, y: options.y - drop * (1 - p), scale: lerp(lift, 1, p) },
      },
    );
  };
}

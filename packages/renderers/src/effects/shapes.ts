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
  type MorphKey,
  type SceneNode,
  type Shadow,
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
  readonly shadow?: Shadow;
  readonly samples?: number;
}

/** One shape changing form over time (see core `morph`). */
export function shapeMorph(options: ShapeMorphOptions): (t: number) => ShapeNode {
  const track = morph(options.keys, options.samples ? { samples: options.samples } : {});
  return (t) => {
    const form = track.at(t);
    return shapeNode(options.id, {
      geometry: form.geometry,
      ...(form.fill === undefined ? {} : { fill: form.fill }),
      ...(options.stroke ? { stroke: options.stroke } : {}),
      ...(options.shadow ? { shadow: options.shadow } : {}),
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
        return shapeNode(`${id}-${i}`, {
          geometry: rect(0, 0, cell, cell, options.radius ?? 0),
          fill: tile.color,
          opacity: clamp(p * 3),
          visible: p > 0,
          transform: { x: tile.x, y: tile.y, scale: p, rotation: lerp(-45, 0, clamp(p)) },
        });
      }),
    );
}

export interface LandingOptions extends Timing {
  readonly id: string;
  readonly geometry: Geometry;
  readonly fill: string;
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
  /** Extra nodes that ride on the element (e.g. a label), in its local space. */
  readonly content?: readonly SceneNode[];
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
          shadow: {
            x: options.shadow.x * shadow,
            y: options.shadow.y * shadow,
            color: options.shadowColor,
          },
        }),
        ...(options.content ?? []),
      ],
      {
        opacity: clamp(p * 4),
        transform: { x: options.x, y: options.y - drop * (1 - p), scale: lerp(lift, 1, p) },
      },
    );
  };
}

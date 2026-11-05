import {
  circle,
  groupNode,
  linear,
  progress,
  rect,
  shapeNode,
  type Ease,
  type GroupNode,
  type SceneNode,
  type ShapeNode,
} from '@html-animation-engine/core';

/** When an effect plays: `start` and `duration` in seconds, plus an ease. */
export interface Timing {
  readonly start: number;
  readonly duration: number;
  readonly ease?: Ease;
}

export type Edge = 'left' | 'right' | 'top' | 'bottom';

/** A box given by its centre and size. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The part of `box` uncovered when a wipe from `from` has progressed by `p`. */
function wipeRect(box: Box, from: Edge, p: number) {
  const horizontal = from === 'left' || from === 'right';
  const w = horizontal ? box.width * p : box.width;
  const h = horizontal ? box.height : box.height * p;
  const left = box.x - box.width / 2;
  const top = box.y - box.height / 2;
  const x = from === 'right' ? left + box.width - w / 2 : from === 'left' ? left + w / 2 : box.x;
  const y = from === 'bottom' ? top + box.height - h / 2 : from === 'top' ? top + h / 2 : box.y;
  return { x, y, w, h };
}

export interface HighlighterOptions extends Box, Timing {
  readonly id: string;
  readonly color: string;
  /** Edge the stroke starts from. Default `'left'`. */
  readonly from?: Edge;
  /** Tilt in degrees, for a hand-drawn feel. Default -1.5. */
  readonly tilt?: number;
  readonly radius?: number;
}

/** A highlighter stroke that wipes across a box (place it behind text). */
export function highlighterWipe(options: HighlighterOptions): (t: number) => ShapeNode {
  const { id, color, from = 'left', tilt = -1.5, radius = 4 } = options;
  return (t) => {
    const p = progress(t, options.start, options.duration, options.ease ?? linear);
    const { x, y, w, h } = wipeRect({ ...options, x: 0, y: 0 }, from, p);
    return shapeNode(id, {
      geometry: rect(x, y, w, h, Math.min(radius, w / 2)),
      fill: color,
      transform: { x: options.x, y: options.y, rotation: tilt },
    });
  };
}

export interface MaskRevealOptions extends Box, Timing {
  readonly id: string;
  /** Edge the reveal starts from. Default `'left'`. */
  readonly from?: Edge;
}

/** Reveals `children` through a rectangular mask that wipes across a box. */
export function maskReveal(
  options: MaskRevealOptions,
): (t: number, children: readonly SceneNode[]) => GroupNode {
  return (t, children) => {
    const p = progress(t, options.start, options.duration, options.ease ?? linear);
    const { x, y, w, h } = wipeRect(options, options.from ?? 'left', p);
    return groupNode(options.id, children, { clip: rect(x, y, w, h) });
  };
}

export interface CircleRevealOptions extends Timing {
  readonly id: string;
  /** Centre of the circle. */
  readonly x: number;
  readonly y: number;
  /** Final radius; use the distance to the farthest corner to uncover everything. */
  readonly radius: number;
}

/** Reveals `children` through a circle growing from its centre. */
export function circleReveal(
  options: CircleRevealOptions,
): (t: number, children: readonly SceneNode[]) => GroupNode {
  return (t, children) => {
    const p = progress(t, options.start, options.duration, options.ease ?? linear);
    return groupNode(options.id, children, {
      clip: circle(options.x, options.y, options.radius * p),
    });
  };
}

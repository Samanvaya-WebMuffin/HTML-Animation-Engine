import { mixColors } from '../color/color.js';
import type { Ease } from '../easing/ease.js';
import { lerp } from '../math.js';
import { lerpPoints, progress, type Point } from '../tween.js';
import { polygonPath } from './path.js';
import { effectiveRadius, sampleOutline, type Geometry, type RectGeometry } from './shape.js';

export interface MorphKey {
  /** Time in seconds at which the object has exactly this form. */
  readonly at: number;
  readonly shape: Geometry;
  readonly fill?: string;
  /** Degrees. Default 0. */
  readonly rotation?: number;
  /** Default 1. */
  readonly opacity?: number;
  /** Ease for the transition that arrives at this key. */
  readonly ease?: Ease;
}

/** The morphing object at one instant: geometry and appearance together. */
export interface MorphFrame {
  readonly geometry: Geometry;
  readonly fill: string | undefined;
  readonly rotation: number;
  readonly opacity: number;
}

export interface Morph {
  readonly keys: readonly MorphKey[];
  readonly start: number;
  readonly end: number;
  /** The object's form at time `t`. Exact key forms are returned at key times. */
  at(t: number): MorphFrame;
}

export interface MorphOptions {
  /** Outline samples for transitions that involve a path. Default 256. */
  samples?: number;
}

type ShapeMixer = (p: number) => Geometry;

function mixRects(a: RectGeometry, b: RectGeometry): ShapeMixer {
  const ra = effectiveRadius(a);
  const rb = effectiveRadius(b);
  return (p) => ({
    kind: 'rect',
    x: lerp(a.x, b.x, p),
    y: lerp(a.y, b.y, p),
    width: lerp(a.width, b.width, p),
    height: lerp(a.height, b.height, p),
    radius: lerp(ra, rb, p),
  });
}

/**
 * Rotates `points` so that, paired index by index with `reference`, the total
 * squared distance is smallest. This keeps the morph from twisting.
 */
function alignTo(reference: readonly Point[], points: readonly Point[]): Point[] {
  const n = points.length;
  let bestOffset = 0;
  let bestCost = Infinity;
  for (let offset = 0; offset < n; offset++) {
    let cost = 0;
    for (let i = 0; i < n && cost < bestCost; i++) {
      const a = reference[i] as Point;
      const b = points[(i + offset) % n] as Point;
      cost += (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    }
    if (cost < bestCost) {
      bestCost = cost;
      bestOffset = offset;
    }
  }
  return Array.from({ length: n }, (_, i) => points[(i + bestOffset) % n] as Point);
}

function mixOutlines(a: Geometry, b: Geometry, samples: number): ShapeMixer {
  const from = sampleOutline(a, samples);
  const to = alignTo(from, sampleOutline(b, samples));
  return (p) => ({ kind: 'path', d: polygonPath(lerpPoints(from, to, p)) });
}

/** A mixer for one transition, prepared once so `at(t)` stays cheap and pure. */
function shapeMixer(a: Geometry, b: Geometry, samples: number): ShapeMixer {
  if (a.kind === 'rect' && b.kind === 'rect') return mixRects(a, b);
  return mixOutlines(a, b, samples);
}

/**
 * One object that changes form over time: rect → pill → circle → any path,
 * with geometry, fill, rotation and opacity interpolating together. Fill
 * mixes in OKLCH. All outline matching happens here, at construction, so
 * `at(t)` is a pure function of `t`.
 */
export function morph(keys: readonly MorphKey[], options: MorphOptions = {}): Morph {
  if (keys.length === 0) throw new RangeError('morph: need at least one key.');
  const samples = options.samples ?? 256;
  for (let i = 1; i < keys.length; i++) {
    if ((keys[i] as MorphKey).at < (keys[i - 1] as MorphKey).at) {
      throw new RangeError(`morph: key ${i} is earlier than key ${i - 1}.`);
    }
  }
  const mixers = keys
    .slice(1)
    .map((key, i) => shapeMixer((keys[i] as MorphKey).shape, key.shape, samples));

  const frameOf = (key: MorphKey): MorphFrame => ({
    geometry: key.shape,
    fill: key.fill,
    rotation: key.rotation ?? 0,
    opacity: key.opacity ?? 1,
  });
  const first = keys[0] as MorphKey;
  const last = keys[keys.length - 1] as MorphKey;

  return {
    keys,
    start: first.at,
    end: last.at,
    at(t) {
      if (t <= first.at) return frameOf(first);
      if (t >= last.at) return frameOf(last);
      let i = 1;
      while ((keys[i] as MorphKey).at <= t) i++;
      const from = keys[i - 1] as MorphKey;
      const to = keys[i] as MorphKey;
      const p = progress(t, from.at, to.at - from.at, to.ease);
      if (p === 0) return frameOf(from);
      if (p === 1) return frameOf(to);
      const fill =
        from.fill !== undefined && to.fill !== undefined
          ? mixColors(from.fill, to.fill, p)
          : (to.fill ?? from.fill);
      return {
        geometry: (mixers[i - 1] as ShapeMixer)(p),
        fill,
        rotation: lerp(from.rotation ?? 0, to.rotation ?? 0, p),
        opacity: lerp(from.opacity ?? 1, to.opacity ?? 1, p),
      };
    },
  };
}

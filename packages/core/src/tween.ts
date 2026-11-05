import { mixColors } from './color/color.js';
import { linear, type Ease } from './easing/ease.js';
import { clamp, lerp } from './math.js';

/**
 * Eased progress of a window that starts at `start` and lasts `duration`
 * seconds: 0 before it, 1 after it, `ease(p)` inside.
 */
export function progress(t: number, start: number, duration: number, ease: Ease = linear): number {
  if (duration <= 0) return t >= start ? 1 : 0;
  return ease(clamp((t - start) / duration));
}

export interface StaggerOptions {
  /** Start time of the first item, in seconds. */
  start: number;
  /** Delay between consecutive items, in seconds. */
  each: number;
  /** Duration of each item, in seconds. */
  duration: number;
  ease?: Ease;
  /** Which item goes first. Default `'start'`. */
  from?: 'start' | 'end' | 'center';
}

/** Stagger order of item `index` out of `count` (0 = first to move). */
export function staggerOrder(index: number, count: number, from: StaggerOptions['from'] = 'start') {
  switch (from) {
    case 'end':
      return count - 1 - index;
    case 'center':
      return Math.abs(index - (count - 1) / 2);
    default:
      return index;
  }
}

/** Eased progress of item `index` out of `count` in a staggered group. */
export function staggerProgress(
  t: number,
  index: number,
  count: number,
  options: StaggerOptions,
): number {
  const delay = staggerOrder(index, count, options.from) * options.each;
  return progress(t, options.start + delay, options.duration, options.ease);
}

/**
 * Reading hold in seconds for on-screen text: at least 1.2 s plus 0.25 s per
 * word (the "snap and settle" house rule).
 */
export function holdFor(textOrWordCount: string | number): number {
  const words =
    typeof textOrWordCount === 'number'
      ? textOrWordCount
      : textOrWordCount.split(/\s+/).filter(Boolean).length;
  return 1.2 + 0.25 * words;
}

// ---------------------------------------------------------------------------
// Keyframe tracks
// ---------------------------------------------------------------------------

export interface Keyframe<T> {
  /** Time in seconds. */
  readonly at: number;
  readonly value: T;
  /** Ease for the segment that arrives at this keyframe. */
  readonly ease?: Ease;
}

export type Mixer<T> = (from: T, to: T, p: number) => T;

/**
 * A track that holds the first value before the first key, the last value
 * after the last key, and mixes neighbours in between. Keys must be in
 * ascending time order.
 */
export function keyframes<T>(keys: readonly Keyframe<T>[], mix: Mixer<T>): (t: number) => T {
  if (keys.length === 0) throw new RangeError('keyframes: need at least one key.');
  for (let i = 1; i < keys.length; i++) {
    const prev = keys[i - 1];
    const key = keys[i];
    if (prev && key && key.at < prev.at) {
      throw new RangeError(`keyframes: key ${i} (at ${key.at}) is before key ${i - 1}.`);
    }
  }
  const first = keys[0] as Keyframe<T>;
  const last = keys[keys.length - 1] as Keyframe<T>;
  return (t) => {
    if (t <= first.at) return first.value;
    if (t >= last.at) return last.value;
    let i = 1;
    while ((keys[i] as Keyframe<T>).at <= t) i++;
    const from = keys[i - 1] as Keyframe<T>;
    const to = keys[i] as Keyframe<T>;
    return mix(from.value, to.value, progress(t, from.at, to.at - from.at, to.ease));
  };
}

// ---------------------------------------------------------------------------
// Interpolators
// ---------------------------------------------------------------------------

export interface Point {
  readonly x: number;
  readonly y: number;
}

export function lerpPoint(a: Point, b: Point, p: number): Point {
  return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) };
}

export function lerpPoints(a: readonly Point[], b: readonly Point[], p: number): Point[] {
  if (a.length !== b.length) {
    throw new RangeError(`lerpPoints: lengths differ (${a.length} vs ${b.length}).`);
  }
  return a.map((point, i) => lerpPoint(point, b[i] as Point, p));
}

/**
 * An animatable rectangle. `x`/`y` are its **centre**, so scaling and shape
 * changes stay centred. `rotation` is in degrees.
 */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius?: number;
  readonly rotation?: number;
  readonly fill?: string;
}

/** Interpolates every rectangle property; `fill` mixes in OKLCH. */
export function lerpRect(a: Rect, b: Rect, p: number): Rect {
  const fill =
    a.fill !== undefined && b.fill !== undefined
      ? mixColors(a.fill, b.fill, p)
      : p < 1
        ? a.fill
        : b.fill;
  return {
    x: lerp(a.x, b.x, p),
    y: lerp(a.y, b.y, p),
    width: lerp(a.width, b.width, p),
    height: lerp(a.height, b.height, p),
    radius: lerp(a.radius ?? 0, b.radius ?? 0, p),
    // Linear, not shortest-arc: 0° → 360° is a full spin.
    rotation: lerp(a.rotation ?? 0, b.rotation ?? 0, p),
    ...(fill === undefined ? {} : { fill }),
  };
}

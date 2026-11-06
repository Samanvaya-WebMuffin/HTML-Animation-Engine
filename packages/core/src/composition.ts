import type { Soundtrack } from './audio/types.js';
import { seedToInt, type Seed } from './random/hash.js';
import type { FontSource, FontSpec } from './text/font.js';

/**
 * A composition is a pure function of time. `render(t, ctx)` must draw the
 * frame at `t` seconds from scratch: no wall-clock reads, no
 * `requestAnimationFrame`, no `Math.random()`, no state carried over from the
 * previous call. Rendering the same `t` twice must give identical output.
 */

/** Everything a composition may read while setting up or rendering. */
export interface RenderContext {
  /** Host element, sized exactly `width` × `height` CSS pixels. */
  readonly root: HTMLElement;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  /** Frame index for `t` at `fps` (`Math.floor(t * fps)`). */
  readonly frame: number;
  /** Device pixel ratio the output is rendered at (e.g. 2 for `--scale 2`). */
  readonly pixelRatio: number;
  /**
   * The composition's random seed as a 32-bit integer. Use it for all
   * randomness: `random(ctx.seed, 'star', i)` or `createRng(ctx.seed)`.
   */
  readonly seed: number;
  /**
   * True when the viewer prefers reduced motion. Playback already holds on key
   * moments in this mode; compositions may also drop non-essential motion.
   */
  readonly reducedMotion: boolean;
}

export type SetupContext = Omit<RenderContext, 'frame'>;

export interface Composition {
  /** Stable, URL-safe identifier (usually the example folder name). */
  readonly id: string;
  readonly title?: string;
  readonly width: number;
  readonly height: number;
  /**
   * Authoring frame rate: playback in the playground, and `ctx.frame`. A
   * composition is a pure function of time, so export may sample it at any
   * rate (60 fps by default) unless `fixedFps` is set.
   */
  readonly fps: number;
  /**
   * True when the content only changes on its own `fps` grid (e.g. wrapped
   * Remotion code, which is written in frames). Export then keeps `fps`, since
   * any other rate would repeat or skip frames.
   */
  readonly fixedFps?: boolean;
  /** Duration in seconds. */
  readonly duration: number;
  /** CSS colour painted behind the frame, or `'transparent'`. */
  readonly background: string;
  /** Random seed. Default: the composition `id`. Change it to reshuffle all randomness. */
  readonly seed?: Seed;
  /** Font files to register (via `FontFace`) before anything is measured. */
  readonly fontFaces?: readonly FontSource[];
  /** Fonts to load before `setup` runs, so text is measured with the real font. */
  readonly fonts?: readonly FontSpec[];
  /**
   * Sound, as data: sounds placed at times (see `Soundtrack`). Export renders
   * it with `renderSoundtrack` and muxes it into the MP4; it never affects frames.
   */
  readonly audio?: Soundtrack;
  /**
   * Optional one-off setup: build DOM/canvas structure, load fonts and
   * textures. May be async. It must not start timers or animation loops.
   */
  setup?(ctx: SetupContext): void | Promise<void>;
  /** Draw the frame at `t` seconds. Synchronous and pure. */
  render(t: number, ctx: RenderContext): void;
  /** Optional cleanup when the composition is unmounted. */
  teardown?(ctx: SetupContext): void;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Validates a composition and returns it unchanged (typed). */
export function defineComposition<C extends Composition>(composition: C): C {
  const { id, width, height, fps, duration } = composition;
  if (!ID_PATTERN.test(id)) {
    throw new Error(`Composition id "${id}" must be lowercase kebab-case.`);
  }
  for (const [key, value] of Object.entries({ width, height, fps })) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`Composition "${id}": ${key} must be a positive integer, got ${value}.`);
    }
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Composition "${id}": duration must be a positive number, got ${duration}.`);
  }
  return composition;
}

/** The numeric seed for a composition: its `seed`, or a hash of its `id`. */
export function compositionSeed(composition: Pick<Composition, 'id' | 'seed'>): number {
  return seedToInt(composition.seed ?? composition.id);
}

/**
 * Tolerance used when converting time to frames, so that values such as
 * `0.1 * 30` (= 2.9999999999999996) land on frame 3, not frame 2.
 */
const FRAME_EPSILON = 1e-6;

/** Number of frames in `[0, duration)` at `fps`. */
export function frameCount(duration: number, fps: number): number {
  return Math.max(1, Math.round(duration * fps));
}

/** Time in seconds of frame `frame` at `fps`. */
export function frameToTime(frame: number, fps: number): number {
  return frame / fps;
}

/** Frame index that contains time `t` at `fps`. */
export function timeToFrame(t: number, fps: number): number {
  return Math.floor(t * fps + FRAME_EPSILON);
}

/** Snaps `t` to the start of the frame that contains it. */
export function snapToFrame(t: number, fps: number): number {
  return frameToTime(timeToFrame(t, fps), fps);
}

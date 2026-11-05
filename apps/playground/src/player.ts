import { frameCount, frameToTime, timeToFrame } from '@html-animation-engine/core';

export interface PlayerState {
  readonly frame: number;
  readonly frameCount: number;
  readonly fps: number;
  readonly t: number;
  readonly playing: boolean;
  readonly reducedMotion: boolean;
}

/**
 * Reduced-motion playback: instead of running through every frame, playback
 * holds on each key moment for `hold` seconds and cuts to the next.
 */
export interface ReducedMotionPlayback {
  /** Key moments in seconds (usually the example's `stills`). */
  readonly keyTimes: readonly number[];
  /** Seconds to hold each key moment. */
  readonly hold: number;
}

/**
 * Playback clock for the playground. It turns wall-clock ticks into a frame
 * index and nothing else: what gets drawn depends only on `t = frame / fps`,
 * so playback, scrubbing and export all show the same frames.
 *
 * The caller supplies `now` (milliseconds) to `play` and `tick`, which keeps
 * this class deterministic under test.
 */
export class Player {
  #fps: number;
  #duration: number;
  #frameCount: number;
  #frame = 0;
  #playing = false;
  #anchorMs = 0;
  #anchorFrame = 0;
  #anchorKey = 0;
  #reduced: ReducedMotionPlayback | null = null;
  readonly loop: boolean;
  readonly #onChange: (state: PlayerState) => void;

  constructor(options: {
    fps: number;
    duration: number;
    loop?: boolean;
    onChange: (state: PlayerState) => void;
  }) {
    this.#fps = options.fps;
    this.#duration = options.duration;
    this.#frameCount = frameCount(options.duration, options.fps);
    this.loop = options.loop ?? true;
    this.#onChange = options.onChange;
  }

  get state(): PlayerState {
    return {
      frame: this.#frame,
      frameCount: this.#frameCount,
      fps: this.#fps,
      t: frameToTime(this.#frame, this.#fps),
      playing: this.#playing,
      reducedMotion: this.#reduced !== null,
    };
  }

  /** Jumps to `frame` (clamped). Re-anchors the clock if playing. */
  seek(frame: number, now?: number): void {
    const clamped = Math.min(Math.max(Math.round(frame), 0), this.#frameCount - 1);
    if (this.#playing && now !== undefined) this.#anchor(now, clamped);
    if (clamped === this.#frame) return;
    this.#frame = clamped;
    this.#emit();
  }

  step(delta: number, now?: number): void {
    this.seek(this.#frame + delta, now);
  }

  play(now: number): void {
    if (this.#playing) return;
    if (!this.loop && this.#frame >= this.#frameCount - 1) this.#frame = 0;
    this.#playing = true;
    this.#anchor(now, this.#frame);
    if (this.#reduced) this.#tickReduced(now, this.#reduced); // cut to the first key moment
    this.#emit();
  }

  pause(): void {
    if (!this.#playing) return;
    this.#playing = false;
    this.#emit();
  }

  toggle(now: number): void {
    if (this.#playing) this.pause();
    else this.play(now);
  }

  /** Switches reduced-motion playback on (with its key moments) or off (`null`). */
  setReducedMotion(playback: ReducedMotionPlayback | null, now?: number): void {
    this.#reduced = playback && playback.keyTimes.length > 0 ? playback : null;
    if (this.#playing && now !== undefined) this.#anchor(now, this.#frame);
    this.#emit();
  }

  /** Advances to the frame due at `now`. Call once per display refresh. */
  tick(now: number): void {
    if (!this.#playing) return;
    if (this.#reduced) {
      this.#tickReduced(now, this.#reduced);
      return;
    }
    const elapsed = Math.max(0, now - this.#anchorMs) / 1000;
    let next = this.#anchorFrame + timeToFrame(elapsed, this.#fps);
    if (next >= this.#frameCount) {
      if (this.loop) {
        next %= this.#frameCount;
      } else {
        next = this.#frameCount - 1;
        this.#playing = false;
      }
    }
    if (next !== this.#frame || !this.#playing) {
      this.#frame = next;
      this.#emit();
    }
  }

  /** Changes the sampling rate, keeping the current time as close as possible. */
  configure(options: { fps?: number; duration?: number }, now?: number): void {
    const t = frameToTime(this.#frame, this.#fps);
    this.#fps = options.fps ?? this.#fps;
    this.#duration = options.duration ?? this.#duration;
    this.#frameCount = frameCount(this.#duration, this.#fps);
    this.#frame = Math.min(timeToFrame(t, this.#fps), this.#frameCount - 1);
    if (this.#playing && now !== undefined) this.#anchor(now, this.#frame);
    this.#emit();
  }

  #keyFrames(playback: ReducedMotionPlayback): number[] {
    return playback.keyTimes.map((t) => Math.min(timeToFrame(t, this.#fps), this.#frameCount - 1));
  }

  #tickReduced(now: number, playback: ReducedMotionPlayback): void {
    const keys = this.#keyFrames(playback);
    const steps = Math.floor(Math.max(0, now - this.#anchorMs) / 1000 / playback.hold);
    let index = this.#anchorKey + steps;
    if (index >= keys.length) {
      if (this.loop) {
        index %= keys.length;
      } else {
        index = keys.length - 1;
        this.#playing = false;
      }
    }
    const next = keys[index] ?? this.#frame;
    if (next !== this.#frame || !this.#playing) {
      this.#frame = next;
      this.#emit();
    }
  }

  #anchor(now: number, frame: number): void {
    this.#anchorMs = now;
    this.#anchorFrame = frame;
    if (this.#reduced) {
      // Start from the first key moment at or after the current frame.
      const keys = this.#keyFrames(this.#reduced);
      const index = keys.findIndex((key) => key >= frame);
      this.#anchorKey = index === -1 ? 0 : index;
    }
  }

  #emit(): void {
    this.#onChange(this.state);
  }
}

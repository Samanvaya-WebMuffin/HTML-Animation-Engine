import { frameCount, frameToTime, timeToFrame } from '@html-animation-engine/core';

export interface PlayerState {
  readonly frame: number;
  readonly frameCount: number;
  readonly fps: number;
  readonly t: number;
  readonly playing: boolean;
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

  /** Advances to the frame due at `now`. Call once per display refresh. */
  tick(now: number): void {
    if (!this.#playing) return;
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

  #anchor(now: number, frame: number): void {
    this.#anchorMs = now;
    this.#anchorFrame = frame;
  }

  #emit(): void {
    this.#onChange(this.state);
  }
}

/**
 * The Cowork film's beat grid: 110 bpm from the film's first frame. The
 * music plays on it, and the film's choreography and sound effects are
 * placed on it, so cuts, camera moves, arrivals and hits land with the beat:
 * scene cuts and camera flights on beats, other moments on sixteenths, and
 * every sound effect on a thirty-second (at most 34 ms from where it was
 * written). Typing's sound is one soft tap per five keystrokes, each on a
 * sixteenth.
 */
import { tempo } from '@html-animation-engine/core';

export const BPM = 110;
export const GRID = tempo({ bpm: BPM });
/** One beat, s. */
export const BEAT = GRID.secondsPerBeat;

/** `n` beats, in seconds. */
export const beats = (n: number): number => n * BEAT;

/** The nearest grid point to `t` (s from the film's start) on a grid of `BEAT / div`. */
export function onGrid(t: number, div = 4): number {
  const unit = BEAT / div;
  return Math.round(t / unit) * unit;
}

/** A table of times with every number moved to the nearest grid point (`BEAT / div`). */
export function gridTimes<T>(table: T, div = 4): T {
  const walk = (value: unknown): unknown => {
    if (typeof value === 'number') return Number.isFinite(value) ? onGrid(value, div) : value;
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
    return value;
  };
  return walk(table) as T;
}

/** Sound effects sit on thirty-seconds. */
export const SFX_DIV = 8;

export interface TempoOptions {
  /** Beats per minute. */
  bpm: number;
  /** Beats per bar. Default 4. */
  beatsPerBar?: number;
  /** Time in seconds of beat 0 (e.g. the first downbeat in the music). Default 0. */
  offset?: number;
}

export interface Tempo {
  readonly bpm: number;
  readonly beatsPerBar: number;
  readonly offset: number;
  /** Length of one beat in seconds. */
  readonly secondsPerBeat: number;
  /** Absolute time of beat `n` (0-based; fractions allowed). */
  beat(n: number): number;
  /** Absolute time of bar `n` (0-based; fractions allowed). */
  bar(n: number): number;
  /** Duration of `n` beats, in seconds. */
  beats(n: number): number;
  /** Duration of `n` bars, in seconds. */
  bars(n: number): number;
  /** Fractional beat index at time `t`. */
  beatAt(t: number): number;
  /** Fractional bar index at time `t`. */
  barAt(t: number): number;
  /** Time of the nearest beat subdivision to `t` (`division = 2` → eighth notes in 4/4). */
  snap(t: number, division?: number): number;
  /**
   * 1 on each beat, decaying exponentially until the next. `decay` is the
   * fraction of a beat after which the pulse falls to ~5 %. 0 before beat 0.
   */
  pulse(t: number, decay?: number): number;
}

/** A tempo grid for locking animation to music. */
export function tempo({ bpm, beatsPerBar = 4, offset = 0 }: TempoOptions): Tempo {
  if (!(bpm > 0)) throw new RangeError(`tempo: bpm must be > 0, got ${bpm}.`);
  if (!Number.isInteger(beatsPerBar) || beatsPerBar < 1) {
    throw new RangeError(`tempo: beatsPerBar must be a positive integer, got ${beatsPerBar}.`);
  }
  const secondsPerBeat = 60 / bpm;
  const beatAt = (t: number) => (t - offset) / secondsPerBeat;
  return {
    bpm,
    beatsPerBar,
    offset,
    secondsPerBeat,
    beat: (n) => offset + n * secondsPerBeat,
    bar: (n) => offset + n * beatsPerBar * secondsPerBeat,
    beats: (n) => n * secondsPerBeat,
    bars: (n) => n * beatsPerBar * secondsPerBeat,
    beatAt,
    barAt: (t) => beatAt(t) / beatsPerBar,
    snap: (t, division = 1) =>
      offset + (Math.round(beatAt(t) * division) / division) * secondsPerBeat,
    pulse(t, decay = 0.5) {
      const beat = beatAt(t);
      if (beat < 0) return 0;
      const sinceBeat = beat - Math.floor(beat + 1e-9);
      return Math.exp((-3 * Math.max(0, sinceBeat)) / decay);
    },
  };
}

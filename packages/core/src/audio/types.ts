/**
 * A soundtrack is plain data: sounds placed at times. `renderSoundtrack`
 * turns it into PCM with a pure, seeded mixer, so rendering it twice gives
 * byte-identical audio, just as frames are a pure function of `t`.
 *
 * Units: seconds for time, Hz for frequency, linear gain (use `db()` to write
 * decibels), pan from -1 (left) to 1 (right).
 */

/** Decoded audio: one Float32Array per channel, samples in [-1, 1]. */
export interface PcmAudio {
  readonly sampleRate: number;
  readonly channels: readonly Float32Array[];
}

/**
 * Amplitude envelope. Attack rises linearly, hold stays at full level, then
 * the level falls exponentially towards `sustain`, reaching -60 dB of the way
 * after `decay` seconds. With `length` the note is held until then and fades
 * out over `release` (again a -60 dB time).
 */
export interface Envelope {
  readonly attack?: number;
  readonly hold?: number;
  readonly decay: number;
  /** Level held after the decay (0–1). Default 0 (percussive). */
  readonly sustain?: number;
  /** Seconds from the start until the release begins (for sustained notes). */
  readonly length?: number;
  readonly release?: number;
}

/** A resonant filter; the cutoff can glide exponentially to `to` over `time` seconds. */
export interface Filter {
  readonly type: 'lowpass' | 'highpass' | 'bandpass';
  readonly freq: number;
  /** Resonance. Default 0.707 (Butterworth) for low/high-pass, 1 for band-pass. */
  readonly q?: number;
  readonly sweep?: { readonly to: number; readonly time: number };
}

/** Placement shared by every sound: offset, level, stereo position, reverb send. */
export interface SoundPlacement {
  /** Seconds after the event time (for layering, flams, echoes). */
  readonly delay?: number;
  readonly gain?: number;
  readonly pan?: number;
  /** Fraction sent to the reverb (0–1). */
  readonly send?: number;
}

/** A recorded sample, by the name it has in `Soundtrack.samples`. */
export interface SampleSound extends SoundPlacement {
  readonly type: 'sample';
  readonly sample: string;
  /**
   * Seconds into the sample where its transient is. The sample is started
   * that much early, so the transient lands exactly on the event time.
   */
  readonly onset?: number;
  /** Playback rate: 2 = an octave up (and twice as short). Default 1. */
  readonly rate?: number;
  readonly filter?: Filter;
}

/** An oscillator voice. */
export interface ToneSound extends SoundPlacement {
  readonly type: 'tone';
  readonly wave: 'sine' | 'triangle' | 'saw' | 'square';
  readonly freq: number;
  readonly envelope: Envelope;
  /** Pitch starts at `from` × freq and settles to freq (time constant `time`). */
  readonly pitch?: { readonly from: number; readonly time: number };
  /** Phase modulation by a sine at `ratio` × freq; the index decays with time constant `decay`. */
  readonly fm?: { readonly ratio: number; readonly index: number; readonly decay?: number };
  /** Unison: `voices` detuned copies spread `detune` cents and `width` across the stereo field. */
  readonly unison?: { readonly voices: number; readonly detune: number; readonly width?: number };
  readonly filter?: Filter;
  /** Soft saturation amount (tanh drive, 0 = clean). */
  readonly drive?: number;
}

/** Seeded noise through an optional filter. */
export interface NoiseSound extends SoundPlacement {
  readonly type: 'noise';
  readonly color?: 'white' | 'pink';
  readonly envelope: Envelope;
  readonly filter?: Filter;
  /**
   * Re-triggered start (the classic analogue clap): `count` short bursts
   * `spacing` s apart, each decaying in `decay` s, before the main envelope.
   */
  readonly bursts?: { readonly count: number; readonly spacing: number; readonly decay: number };
  /** Stereo: independent noise per channel. Default false (mono). */
  readonly stereo?: boolean;
}

/** Several sounds played together. */
export interface LayerSound extends SoundPlacement {
  readonly type: 'layer';
  readonly layers: readonly Sound[];
}

export type Sound = SampleSound | ToneSound | NoiseSound | LayerSound;

/** A sound at a time. */
export interface SoundEvent extends SoundPlacement {
  /** Seconds from the start of the composition. */
  readonly at: number;
  readonly sound: Sound;
}

export interface ReverbOptions {
  /** Room size 0–1 (longer tail). Default 0.7. */
  readonly size?: number;
  /** High-frequency damping 0–1. Default 0.4. */
  readonly damping?: number;
  /** Pre-delay in seconds. Default 0.02. */
  readonly predelay?: number;
  /** Level of the wet signal. Default 1. */
  readonly gain?: number;
}

export interface Soundtrack {
  /** Sample files by name (URLs or paths, resolved by whoever loads them). */
  readonly samples?: Readonly<Record<string, string>>;
  readonly events: readonly SoundEvent[];
  readonly reverb?: ReverbOptions;
  /** Master gain before the limiter. Default 1. */
  readonly gain?: number;
  /** Peak ceiling of the limiter in dBFS. Default -1.5 (headroom for AAC encoding). */
  readonly ceiling?: number;
  /** Seed for noise. Default: the composition seed. */
  readonly seed?: number;
}

/** Decibels to linear gain. */
export function db(decibels: number): number {
  return 10 ** (decibels / 20);
}

const NOTE = /^([A-Ga-g])([#b]?)(-?\d+)$/;
const SEMITONE: Readonly<Record<string, number>> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** MIDI note number of a note name such as 'A4' (69), 'F#3' or 'Bb2'. */
export function noteNumber(name: string): number {
  const m = NOTE.exec(name);
  if (!m) throw new Error(`Not a note name: "${name}" (expected e.g. "A4", "F#3", "Bb2").`);
  const [, letter = 'a', accidental, octave = '4'] = m;
  const shift = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  return (Number(octave) + 1) * 12 + (SEMITONE[letter.toLowerCase()] ?? 0) + shift;
}

/** Frequency of a MIDI note (A4 = 69 = `tuning` Hz). */
export function midiToHz(midi: number, tuning = 440): number {
  return tuning * 2 ** ((midi - 69) / 12);
}

/** Frequency of a note name or MIDI number. */
export function hz(note: string | number, tuning = 440): number {
  return midiToHz(typeof note === 'number' ? note : noteNumber(note), tuning);
}

/** Identity helper with validation: events must have finite times, samples must be declared. */
export function defineSoundtrack(track: Soundtrack): Soundtrack {
  const names = new Set(Object.keys(track.samples ?? {}));
  const check = (sound: Sound) => {
    if (sound.type === 'layer') sound.layers.forEach(check);
    else if (sound.type === 'sample' && !names.has(sound.sample)) {
      throw new Error(`Soundtrack: sample "${sound.sample}" is not declared in \`samples\`.`);
    }
  };
  for (const event of track.events) {
    if (!Number.isFinite(event.at))
      throw new Error(`Soundtrack: event time ${event.at} is not finite.`);
    check(event.sound);
  }
  return track;
}

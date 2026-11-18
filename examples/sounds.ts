import {
  db,
  type Ease,
  defineSoundtrack,
  hz,
  lerp,
  noteNumber,
  random,
  type Sound,
  type SoundEvent,
  type Soundtrack,
} from '@html-animation-engine/core';
import clapGroupUrl from './sounds/clap-group.wav?url';
import clapUrl from './sounds/clap.wav?url';
import snap1Url from './sounds/snap-1.wav?url';
import snap2Url from './sounds/snap-2.wav?url';
import { theme } from './index.js';

/**
 * The sound kit every example uses: recorded finger snaps and hand claps
 * (CC0, see sounds/README.md), each layered with synths tuned to the theme's
 * key, plus a few pure-synth sounds for camera moves, ticks and beds.
 */

const tokens = theme.sound;
const level = (name: keyof typeof tokens.levels) => db(tokens.levels[name]);
const ROOT = noteNumber(tokens.root);

/** Frequency of scale degree `degree` (0 = root; wraps into higher octaves), shifted by `octave`. */
export function note(degree: number, octave = 0): number {
  const size = tokens.scale.length;
  const wrapped = ((degree % size) + size) % size;
  const up = Math.floor(degree / size) + octave;
  return hz(ROOT + (tokens.scale[wrapped] as number) + 12 * up, tokens.tuning);
}

/** Frequencies of a named chord, shifted by `octave`. */
export function chord(name: keyof typeof tokens.chords, octave = 0): number[] {
  return (tokens.chords[name] as readonly number[]).map((s) =>
    hz(ROOT + s + 12 * octave, tokens.tuning),
  );
}

/** Transient positions inside each sample (measured at 30 % of peak), so hits land on their cue. */
const SAMPLES = {
  'snap-1': { url: snap1Url, onset: 0.003 },
  'snap-2': { url: snap2Url, onset: 0.0083 },
  clap: { url: clapUrl, onset: 0.0018 },
  'clap-group': { url: clapGroupUrl, onset: 0.0027 },
} as const;

type SampleName = keyof typeof SAMPLES;

function sample(name: SampleName, gain: number, extra: Partial<Sound> = {}): Sound {
  return { type: 'sample', sample: name, onset: SAMPLES[name].onset, gain, ...extra } as Sound;
}

const layer = (layers: Sound[], extra: Partial<Sound> = {}): Sound =>
  ({ type: 'layer', layers, ...extra }) as Sound;

export interface HitOptions {
  /** Scale degree of the synth layer (0 = root). */
  readonly degree?: number;
  /** Which recording (alternate takes so repeated hits don't sound mechanical). */
  readonly take?: number;
  readonly gain?: number;
  readonly pan?: number;
}

/** Finger snap + a short FM pluck at a scale degree, two octaves up. */
export function snap(options: HitOptions = {}): Sound {
  const { degree = 0, take = 0, gain = 1, pan = 0 } = options;
  return layer(
    [
      sample(take % 2 === 0 ? 'snap-1' : 'snap-2', level('snap'), { send: 0.18 }),
      {
        type: 'tone',
        wave: 'sine',
        freq: note(degree, 2),
        fm: { ratio: 2, index: 1.1, decay: 0.045 },
        pitch: { from: 1.02, time: 0.004 },
        envelope: { attack: 0.001, decay: 0.55 },
        gain: level('pluck'),
        send: 0.3,
      },
    ],
    { gain, pan },
  );
}

/**
 * Hand clap (single clap + a three-person clap flammed 6 ms later) over an
 * analogue-style noise clap, a detuned saw stab on `chord`, and a sub thump.
 * `big` adds weight for a scene's main hit.
 */
export function clap(
  options: { chord?: keyof typeof tokens.chords; big?: boolean; gain?: number; pan?: number } = {},
): Sound {
  const { big = false, gain = 1, pan = 0 } = options;
  const name = options.chord ?? 'home';
  const stab: Sound[] = chord(name, 1).map((freq) => ({
    type: 'tone',
    wave: 'saw',
    freq,
    unison: { voices: 3, detune: 14, width: 0.7 },
    filter: { type: 'lowpass', freq: big ? 5200 : 3800, q: 0.9, sweep: { to: 650, time: 0.2 } },
    envelope: { attack: 0.002, decay: big ? 0.9 : 0.55 },
    gain: level('stab') / Math.sqrt(tokens.chords[name]?.length ?? 1),
    send: 0.4,
  }));
  return layer(
    [
      sample('clap', level('clap'), { send: 0.25 }),
      sample('clap-group', db(tokens.levels.clap - (big ? 2 : 6)), { delay: 0.006, send: 0.35 }),
      {
        type: 'noise',
        filter: { type: 'bandpass', freq: 1150, q: 1.3 },
        bursts: { count: 3, spacing: 0.0095, decay: 0.009 },
        envelope: { attack: 0.0005, decay: big ? 0.3 : 0.2 },
        stereo: true,
        gain: db(tokens.levels.clap - 9),
        send: 0.35,
      },
      layer(stab),
      {
        type: 'tone',
        wave: 'sine',
        freq: chord(name, -1)[0] as number,
        pitch: { from: 2.4, time: 0.018 },
        envelope: { attack: 0.001, decay: big ? 0.5 : 0.3 },
        gain: level('sub') * (big ? 1.2 : 1),
      },
    ],
    { gain, pan },
  );
}

/** Soft FM pluck (no sample) at a scale degree. */
export function pluck(options: HitOptions & { octave?: number; decay?: number } = {}): Sound {
  const { degree = 0, octave = 2, gain = 1, pan = 0, decay = 0.7 } = options;
  return {
    type: 'tone',
    wave: 'sine',
    freq: note(degree, octave),
    fm: { ratio: 2, index: 1.4, decay: 0.06 },
    envelope: { attack: 0.002, decay },
    gain: level('pluck') * gain,
    pan,
    send: 0.35,
  };
}

/** Bright FM bell with a long tail (sparkles, reveals). */
export function bell(options: HitOptions & { octave?: number } = {}): Sound {
  const { degree = 0, octave = 3, gain = 1, pan = 0 } = options;
  return {
    type: 'tone',
    wave: 'sine',
    freq: note(degree, octave),
    fm: { ratio: 3.5, index: 1.6, decay: 0.25 },
    envelope: { attack: 0.001, decay: 1.8 },
    gain: level('bell') * gain,
    pan,
    send: 0.55,
  };
}

/**
 * A reveal with no hit in it, about half a second long: a quick rising
 * sparkle of soft bells up the scale (panned left to right), a detuned
 * shimmer chord swelling underneath with its filter opening, and a breath
 * of high air. For a name appearing (the Cowork lockup).
 */
export function magic(options: { gain?: number; octave?: number } = {}): Sound {
  const { gain = 1.25, octave = 3 } = options;
  const sparkle = [0, 1, 2, 3, 4, 5, 7].map((degree, k): Sound => ({
    type: 'tone',
    wave: 'sine',
    freq: note(degree, octave),
    fm: { ratio: 3, index: 0.9, decay: 0.12 },
    envelope: { attack: 0.004, decay: 0.55 - k * 0.03 },
    gain: level('bell') * (0.55 + 0.08 * k),
    pan: -0.5 + (k / 6) * 1,
    delay: k * 0.05,
    send: 0.6,
  }));
  const shimmer = chord('home', octave - 1).map((freq): Sound => ({
    type: 'tone',
    wave: 'saw',
    freq,
    unison: { voices: 4, detune: 14, width: 1 },
    filter: { type: 'lowpass', freq: 700, q: 0.9, sweep: { to: 5200, time: 0.4 } },
    envelope: { attack: 0.16, hold: 0.12, decay: 0.55 },
    gain: db(tokens.levels.keys - 2),
    send: 0.5,
  }));
  const air: Sound = {
    type: 'noise',
    color: 'pink',
    stereo: true,
    filter: { type: 'highpass', freq: 3500, sweep: { to: 9000, time: 0.45 } },
    envelope: { attack: 0.22, decay: 0.35 },
    gain: db(tokens.levels.whoosh - 22),
    send: 0.4,
  };
  return layer([...sparkle, ...shimmer, air], { gain });
}

/**
 * A synth string swell, about a second: violins high on the home chord
 * (detuned saws, a small bowed scoop into pitch, the filter opening as
 * they swell) over a cello and bass root in two low octaves, with a faint
 * touch of bow noise. For the Cowork name appearing.
 */
export function strings(options: { gain?: number } = {}): Sound {
  const { gain = 1 } = options;
  const violins = chord('home', 3).map((freq, k): Sound => ({
    type: 'tone',
    wave: 'saw',
    freq,
    pitch: { from: 0.985, time: 0.06 },
    unison: { voices: 5, detune: 10, width: 1 },
    filter: { type: 'lowpass', freq: 1800, q: 0.8, sweep: { to: 4200, time: 0.35 } },
    envelope: { attack: 0.12, hold: 0.28, decay: 0.95 },
    gain: db(tokens.levels.keys + 1),
    pan: (k - 1) * 0.35,
    delay: k * 0.015,
    send: 0.55,
  }));
  const low = [note(0, 0), note(0, 1), note(4, 1)].map((freq, k): Sound => ({
    type: 'tone',
    wave: 'saw',
    freq,
    pitch: { from: 0.99, time: 0.08 },
    unison: { voices: 3, detune: 6, width: 0.5 },
    filter: { type: 'lowpass', freq: k === 0 ? 420 : 750, q: 0.7 },
    envelope: { attack: 0.16, hold: 0.3, decay: 1.0 },
    gain: db(tokens.levels.bass + (k === 0 ? 3 : 0)),
    send: 0.35,
  }));
  const bow: Sound = {
    type: 'noise',
    color: 'pink',
    stereo: true,
    filter: { type: 'bandpass', freq: 2600, q: 0.9 },
    envelope: { attack: 0.1, decay: 0.3 },
    gain: db(tokens.levels.whoosh - 26),
    send: 0.3,
  };
  return layer([...violins, ...low, bow], { gain });
}

/** How long before its landing a `meet` sound starts (its lead-in swell): cue it this much early. */
export const MEET_LEAD = 0.55;

/**
 * The name appearing ("Meet Cowork"), three candidates. Each swells in for
 * `MEET_LEAD` seconds and lands on the beat after it:
 * - `rise`: a reversed-air swell, then the home chord run upwards as glassy
 *   FM bells, landing on a shimmering string chord with a soft sub.
 * - `bloom`: a filtered riser into a wide string-and-brass chord bloom, with
 *   high sparkles scattered over its tail and a low boom.
 * - `glass`: an airy vowel-like choir pad with a glass bell chord on top,
 *   a shimmer of detuned high sines, and a breath of air.
 */
export function meet(variant: 'rise' | 'bloom' | 'glass', options: { gain?: number } = {}): Sound {
  // Balanced by loudness: each lands about -19 LUFS (momentary) over the film's bed.
  const gain = (options.gain ?? 1) * (variant === 'rise' ? 0.72 : 1);
  const L = MEET_LEAD;
  const swell: Sound = {
    type: 'noise',
    color: 'pink',
    stereo: true,
    filter: { type: 'bandpass', freq: 900, q: 0.8, sweep: { to: 5200, time: L } },
    envelope: { attack: L * 0.95, decay: 0.12 },
    gain: db(tokens.levels.whoosh - 14),
    send: 0.5,
  };
  const sub: Sound = {
    type: 'tone',
    wave: 'sine',
    freq: note(0, -2),
    pitch: { from: 1.6, time: 0.05 },
    envelope: { attack: 0.004, decay: 1.4 },
    gain: db(tokens.levels.sub - 4),
    delay: L,
  };
  const glassBell = (freq: number, at: number, g: number, pan = 0): Sound => ({
    type: 'tone',
    wave: 'sine',
    freq,
    fm: { ratio: 3.5, index: 1.6, decay: 0.25 },
    envelope: { attack: 0.004, decay: 1.6 },
    gain: db(tokens.levels.bell + 2) * g,
    pan,
    delay: at,
    send: 0.6,
  });
  if (variant === 'rise') {
    const run = [...chord('home', 1), ...chord('home', 2)].map((freq, k, all) =>
      glassBell(
        freq,
        L - 0.42 + k * 0.06,
        0.55 + (0.45 * k) / all.length,
        -0.6 + (1.2 * k) / all.length,
      ),
    );
    return layer(
      [
        swell,
        ...run,
        { ...violins('home', 1.6, { gain: 1.1, swell: 0.12 }), delay: L } as Sound,
        ...chord('home', 3)
          .slice(1, 4)
          .map((f, k) => glassBell(f, L + 0.02 + k * 0.03, 0.7, k - 1)),
        sub,
      ],
      { gain },
    );
  }
  if (variant === 'bloom') {
    const riser: Sound = {
      type: 'tone',
      wave: 'saw',
      freq: note(0, 1),
      pitch: { from: 0.5, time: L * 0.5 },
      unison: { voices: 5, detune: 20, width: 1 },
      filter: { type: 'lowpass', freq: 400, q: 1.1, sweep: { to: 4000, time: L } },
      envelope: { attack: L * 0.9, decay: 0.15 },
      gain: db(tokens.levels.keys - 4),
      send: 0.5,
    };
    const brass = chord('home', 0).map((freq, k): Sound => ({
      type: 'tone',
      wave: 'saw',
      freq,
      unison: { voices: 3, detune: 8, width: 0.8 },
      filter: { type: 'lowpass', freq: 700, q: 0.9, sweep: { to: 2600, time: 0.35 } },
      envelope: { attack: 0.06, decay: 1.8, sustain: 0.3, length: 1.0, release: 1.2 },
      gain: db(tokens.levels.keys - 3),
      pan: (k / 4 - 0.5) * 0.6,
      delay: L,
      send: 0.55,
    }));
    const sparkles = Array.from({ length: 9 }, (_, k) => {
      const notes = chord('home', 3);
      const freq = notes[Math.floor(seeded('meet-bloom', k) * notes.length)] as number;
      return glassBell(
        freq,
        L + 0.12 + k * 0.13 + 0.05 * seeded('meet-bloom-t', k),
        0.45 * (1 - k / 12),
        seeded('meet-bloom-p', k) * 1.6 - 0.8,
      );
    });
    return layer(
      [
        swell,
        riser,
        ...brass,
        { ...violins('home', 1.8, { gain: 1.2, swell: 0.1 }), delay: L } as Sound,
        ...sparkles,
        { ...sub, gain: db(tokens.levels.sub - 1) },
      ],
      { gain },
    );
  }
  // glass
  const choir = chord('home', 1)
    .slice(0, 4)
    .map((freq, k): Sound => ({
      type: 'tone',
      wave: 'saw',
      freq,
      fm: vibrato(freq, 4.4, 0.002),
      unison: { voices: 6, detune: 18, width: 1 },
      filter: { type: 'bandpass', freq: 1100 + 250 * k, q: 1.6 },
      envelope: { attack: L, decay: 2, sustain: 0.8, length: L + 1.2, release: 1.4 },
      gain: db(tokens.levels.keys + 4),
      send: 0.7,
    }));
  const shimmer = chord('home', 3).map((freq, k): Sound => ({
    type: 'tone',
    wave: 'sine',
    freq,
    unison: { voices: 4, detune: 12, width: 1 },
    envelope: { attack: 0.2, decay: 2.2 },
    gain: db(tokens.levels.bell - 4),
    pan: (k / 4 - 0.5) * 1.2,
    delay: L + 0.04 * k,
    send: 0.7,
  }));
  return layer(
    [
      swell,
      ...choir,
      ...chord('home', 2)
        .slice(1)
        .map((f, k) => glassBell(f, L + k * 0.02, 0.8, (k - 1.5) * 0.4)),
      ...shimmer,
      { ...sub, gain: db(tokens.levels.sub - 7) },
    ],
    { gain },
  );
}

/** Tiny pitched click (typing, digits, small repeated events). */
export function tick(options: HitOptions = {}): Sound {
  const { degree = 0, gain = 1, pan = 0 } = options;
  return layer(
    [
      {
        type: 'tone',
        wave: 'sine',
        freq: note(degree, 3),
        envelope: { attack: 0.0005, decay: 0.05 },
        gain: level('tick'),
      },
      {
        type: 'noise',
        filter: { type: 'highpass', freq: 5000 },
        envelope: { attack: 0.0002, decay: 0.012 },
        gain: level('tick') * 0.5,
      },
    ],
    { gain, pan, send: 0.12 },
  );
}

/** A key press: the snap recording sped up (short and bright) over a tick. */
export function key(options: HitOptions = {}): Sound {
  const { degree = 0, take = 0, gain = 1, pan = 0 } = options;
  return layer(
    [
      sample(take % 2 === 0 ? 'snap-1' : 'snap-2', level('snap') * 0.22, {
        rate: 1.7 + 0.15 * (take % 3),
        filter: { type: 'highpass', freq: 900 },
      }),
      tick({ degree, gain: 0.7 }),
    ],
    { gain, pan, send: 0.1 },
  );
}

/**
 * A typing tap: faint and soft, a fingertip on a key rather than a click.
 * The snap recording a little faster, its brightness filtered away, with no
 * pitched tick, so a stream of them sits far under everything else.
 */
export function tap(options: HitOptions = {}): Sound {
  const { take = 0, gain = 1, pan = 0 } = options;
  return sample(take % 2 === 0 ? 'snap-1' : 'snap-2', level('snap') * 0.36 * gain, {
    rate: 1.25 + 0.1 * (take % 3),
    filter: { type: 'lowpass', freq: 2200, q: 0.5 },
    pan,
    send: 0.04,
  });
}

/**
 * A notification ding: a bright bell tone with the inharmonic partials of a
 * small struck bar (×2.76, ×5.4), so it reads as a chime rather than a synth.
 */
export function ding(options: HitOptions & { octave?: number } = {}): Sound {
  const { degree = 0, octave = 3, gain = 1, pan = 0 } = options;
  const freq = note(degree, octave);
  const partial = (ratio: number, decay: number, g: number): Sound => ({
    type: 'tone',
    wave: 'sine',
    freq: freq * ratio,
    envelope: { attack: 0.001, decay },
    gain: level('ding') * g,
  });
  return layer([partial(1, 1.1, 1), partial(2.76, 0.4, 0.35), partial(5.4, 0.14, 0.18)], {
    gain,
    pan,
    send: 0.3,
  });
}

/** Something popping into view: a short, high snap and a quick falling blip. */
export function pop(options: HitOptions = {}): Sound {
  const { degree = 0, take = 0, gain = 1, pan = 0 } = options;
  return layer(
    [
      sample(take % 2 === 0 ? 'snap-1' : 'snap-2', level('pop') * 0.5, {
        rate: 1.35,
        filter: { type: 'highpass', freq: 700 },
      }),
      {
        type: 'tone',
        wave: 'sine',
        freq: note(degree, 1),
        pitch: { from: 2.2, time: 0.01 },
        envelope: { attack: 0.0005, decay: 0.07 },
        gain: level('pop'),
      },
    ],
    { gain, pan, send: 0.08 },
  );
}

/**
 * Something hard cracking: the snap recording slowed down (deeper, with a
 * longer crunch), a short burst of bright grit, and a low knock. `size` 0–1
 * goes from a hairline tick to a heavy break.
 */
export function crack(
  options: { size?: number; take?: number; gain?: number; pan?: number } = {},
): Sound {
  const { size = 0.5, take = 0, gain = 1, pan = 0 } = options;
  return layer(
    [
      sample(take % 2 === 0 ? 'snap-1' : 'snap-2', level('snap'), {
        rate: lerp(0.95, 0.55, size) + 0.06 * (take % 3),
      }),
      {
        type: 'noise',
        filter: { type: 'highpass', freq: lerp(3500, 1800, size) },
        envelope: { attack: 0.0005, decay: lerp(0.03, 0.12, size) },
        stereo: true,
        gain: level('snap') * 0.35,
      },
      {
        type: 'tone',
        wave: 'sine',
        freq: note(0, -1),
        pitch: { from: 2.2, time: 0.015 },
        envelope: { attack: 0.001, decay: lerp(0.08, 0.3, size) },
        gain: level('sub') * size,
      },
    ],
    { gain, pan, send: 0.25 },
  );
}

/**
 * Paper rustling, very faint: a few soft, irregular crinkles of filtered
 * noise and a breath of air. `take` varies it so repeats don't match.
 */
export function rustle(options: { take?: number; gain?: number; pan?: number } = {}): Sound {
  const { take = 0, gain = 1, pan = 0 } = options;
  const r = (key: string) => random('rustle', key, take);
  return layer(
    [
      {
        type: 'noise',
        filter: {
          type: 'bandpass',
          freq: 2600 + r('from') * 1800,
          q: 0.8,
          sweep: { to: 1700 + r('to') * 1200, time: 0.2 },
        },
        bursts: {
          count: 3 + Math.floor(r('count') * 3),
          spacing: 0.024 + r('spacing') * 0.02,
          decay: 0.018,
        },
        envelope: { attack: 0.004, decay: 0.22 },
        stereo: true,
        gain: level('rustle'),
      },
      {
        type: 'noise',
        color: 'pink',
        filter: { type: 'highpass', freq: 5000 },
        envelope: { attack: 0.012, decay: 0.14 },
        stereo: true,
        gain: level('rustle') * 0.4,
      },
    ],
    { gain, pan, send: 0.15 },
  );
}

/** Paper or a folder landing flat: a soft papery slap with a little weight under it. */
export function slap(options: { gain?: number; pan?: number } = {}): Sound {
  const { gain = 1, pan = 0 } = options;
  return layer(
    [
      {
        type: 'noise',
        color: 'pink',
        filter: { type: 'bandpass', freq: 1400, q: 0.7 },
        envelope: { attack: 0.0008, decay: 0.07 },
        gain: level('pop') * 0.8,
      },
      {
        type: 'tone',
        wave: 'sine',
        freq: note(0, 0),
        pitch: { from: 1.8, time: 0.015 },
        envelope: { attack: 0.001, decay: 0.09 },
        gain: level('sub') * 0.25,
      },
    ],
    { gain, pan, send: 0.1 },
  );
}

/** Low thump for things landing (sub pitch-drop and a soft knock). */
export function thump(options: { gain?: number; pan?: number } = {}): Sound {
  const { gain = 1, pan = 0 } = options;
  return layer(
    [
      {
        type: 'tone',
        wave: 'sine',
        freq: note(0, -1),
        pitch: { from: 2.8, time: 0.02 },
        envelope: { attack: 0.001, decay: 0.35 },
        gain: level('sub'),
      },
      {
        type: 'noise',
        color: 'pink',
        filter: { type: 'lowpass', freq: 900 },
        envelope: { attack: 0.0005, decay: 0.06 },
        gain: level('sub') * 0.6,
      },
    ],
    { gain, pan },
  );
}

/**
 * Air moving: stereo pink noise through a band-pass sweeping `from` → `to`
 * Hz over `duration`, swelling towards `peak` (0–1 of the way) then fading.
 * Use it for camera moves, wipes and things flying past.
 */
export function whoosh(
  duration: number,
  options: { from?: number; to?: number; peak?: number; gain?: number; pan?: number } = {},
): Sound {
  const { from = 250, to = 2800, peak = 0.7, gain = 1, pan = 0 } = options;
  return {
    type: 'noise',
    color: 'pink',
    stereo: true,
    filter: { type: 'bandpass', freq: from, q: 0.9, sweep: { to, time: duration } },
    envelope: { attack: duration * peak, decay: duration * (1 - peak) * 2.2 + 0.15 },
    gain: level('whoosh') * gain,
    pan,
    send: 0.3,
  };
}

// ---------------------------------------------------------------------------
// Music: a light synth groove to sit under a whole video.
// ---------------------------------------------------------------------------

/** A soft synth kick: a sine falling onto the low root, with a faint click. */
export function kick(options: { gain?: number; pan?: number } = {}): Sound {
  const { gain = 1, pan = 0 } = options;
  return layer(
    [
      {
        type: 'tone',
        wave: 'sine',
        freq: note(0, -1),
        pitch: { from: 2.2, time: 0.03 },
        envelope: { attack: 0.001, decay: 0.32 },
        gain: level('kick'),
      },
      {
        type: 'noise',
        filter: { type: 'bandpass', freq: 2500, q: 0.8 },
        envelope: { attack: 0.0005, decay: 0.012 },
        gain: level('kick') * 0.12,
      },
    ],
    { gain, pan },
  );
}

/** A hi-hat: a short hiss of high noise (`open` rings longer). */
export function hat(options: { gain?: number; pan?: number; open?: boolean } = {}): Sound {
  const { gain = 1, pan = 0, open = false } = options;
  return {
    type: 'noise',
    filter: { type: 'highpass', freq: 7500 },
    envelope: { attack: 0.0005, decay: open ? 0.22 : 0.045 },
    gain: level('hat') * gain,
    pan,
    send: 0.06,
  };
}

/** A soft backbeat: a tiny, airy synth clap. */
export function rim(options: { gain?: number; pan?: number } = {}): Sound {
  const { gain = 1, pan = 0 } = options;
  return {
    type: 'noise',
    filter: { type: 'bandpass', freq: 1700, q: 1.1 },
    bursts: { count: 2, spacing: 0.008, decay: 0.01 },
    envelope: { attack: 0.0005, decay: 0.09 },
    gain: level('rim') * gain,
    pan,
    send: 0.3,
  };
}

/** A round synth bass note on the root of `chord`, `length` seconds long. */
export function bass(
  name: keyof typeof tokens.chords,
  length: number,
  options: { gain?: number } = {},
): Sound {
  const { gain = 1 } = options;
  const freq = chord(name, -1)[0] as number;
  const envelope = { attack: 0.012, decay: 0.6, sustain: 0.5, length, release: 0.25 };
  return layer(
    [
      { type: 'tone', wave: 'sine', freq, envelope, gain: level('bass') },
      {
        type: 'tone',
        wave: 'triangle',
        freq: freq * 2,
        filter: { type: 'lowpass', freq: 420 },
        envelope,
        gain: level('bass') * 0.35,
      },
    ],
    { gain },
  );
}

/** Soft synth keys: `chord` an octave up, mellow and slightly detuned, closing as it rings. */
export function keys(
  name: keyof typeof tokens.chords,
  length: number,
  options: { gain?: number; pan?: number } = {},
): Sound {
  const { gain = 1, pan = 0 } = options;
  const notes = chord(name, 1);
  return layer(
    notes.map((freq) => ({
      type: 'tone',
      wave: 'triangle',
      freq,
      unison: { voices: 2, detune: 8, width: 0.6 },
      filter: { type: 'lowpass', freq: 1800, q: 0.5, sweep: { to: 700, time: length } },
      envelope: { attack: 0.02, decay: 0.9, sustain: 0.35, length, release: 0.6 },
      gain: level('keys') / Math.sqrt(notes.length),
    })),
    { gain, pan, send: 0.45 },
  );
}

/**
 * A string player's vibrato as phase modulation: `rate` Hz, ±`depth` of the
 * pitch (about 5 Hz and a few cents, as a section plays it).
 */
function vibrato(freq: number, rate = 5.1, depth = 0.003) {
  return { ratio: rate / freq, index: (depth * freq) / rate };
}

/**
 * A synth string section holding `chord` for `length` seconds, bowed in
 * slowly and swelling, as in a film score: violins high on the chord with
 * vibrato (detuned saws, the filter opening as the bow pressure builds),
 * violas below them, and cellos and basses on the root in two low octaves.
 * Soft at both ends, so one held chord flows into the next.
 */
export function violins(
  name: keyof typeof tokens.chords,
  length: number,
  options: { gain?: number; swell?: number; pan?: number } = {},
): Sound {
  const { gain = 1, pan = 0 } = options;
  const swell = Math.min(length * 0.45, options.swell ?? 0.9);
  const envelope = (attack: number) => ({
    attack,
    decay: 2.5,
    sustain: 0.9,
    length,
    release: 1.5,
  });
  const high = chord(name, 1).slice(1);
  const violin = high.map((freq, k): Sound => ({
    type: 'tone',
    wave: 'saw',
    freq,
    fm: vibrato(freq),
    unison: { voices: 5, detune: 14, width: 1 },
    filter: { type: 'lowpass', freq: 1300, q: 0.6, sweep: { to: 3400, time: swell * 1.6 } },
    envelope: envelope(swell),
    gain: (level('keys') * db(1)) / Math.sqrt(high.length),
    pan: pan + (k / (high.length - 1) - 0.5) * 0.5,
  }));
  const mid = chord(name, 0).slice(1, 4);
  const viola = mid.map((freq): Sound => ({
    type: 'tone',
    wave: 'saw',
    freq,
    fm: vibrato(freq, 4.8, 0.0025),
    unison: { voices: 4, detune: 10, width: 0.7 },
    filter: { type: 'lowpass', freq: 900, q: 0.6, sweep: { to: 1900, time: swell * 1.6 } },
    envelope: envelope(swell * 1.1),
    gain: (level('keys') * db(-3)) / Math.sqrt(mid.length),
  }));
  const root = chord(name, 0)[0] as number;
  const low = [root, root / 2].map((freq, k): Sound => ({
    type: 'tone',
    wave: 'saw',
    freq,
    fm: vibrato(freq, 4.5, 0.002),
    unison: { voices: 3, detune: 7, width: 0.4 },
    filter: { type: 'lowpass', freq: k === 0 ? 650 : 380, q: 0.6 },
    envelope: envelope(swell * 0.8),
    gain: level('bass') * (k === 0 ? db(-2) : db(1)),
  }));
  return layer([...violin, ...viola, ...low], { gain, send: 0.55 });
}

/**
 * One short bowed note (spiccato) at `freq` Hz: for a ticking string
 * ostinato over held strings.
 */
export function spiccato(freq: number, options: { gain?: number; pan?: number } = {}): Sound {
  const { gain = 1, pan = 0 } = options;
  return {
    type: 'tone',
    wave: 'saw',
    freq,
    pitch: { from: 0.994, time: 0.02 },
    unison: { voices: 3, detune: 9, width: 0.5 },
    filter: { type: 'lowpass', freq: 2600, q: 0.7, sweep: { to: 1400, time: 0.2 } },
    envelope: { attack: 0.01, decay: 0.32 },
    gain: level('keys') * db(-1) * gain,
    pan,
    send: 0.5,
  };
}

/** A soft sustained chord bed under a scene, `length` seconds long. */
export function pad(
  length: number,
  options: {
    chord?: keyof typeof tokens.chords;
    gain?: number;
    attack?: number;
    release?: number;
  } = {},
): Sound {
  const { gain = 1, attack = 1.2, release = 1.6 } = options;
  const notes = chord(options.chord ?? 'home');
  return layer(
    notes.map((freq) => ({
      type: 'tone',
      wave: 'saw',
      freq,
      unison: { voices: 4, detune: 16, width: 0.9 },
      filter: { type: 'lowpass', freq: 850, q: 0.6 },
      envelope: { attack, decay: 1.5, sustain: 0.8, length, release },
      gain: (level('bed') * gain) / Math.sqrt(notes.length),
    })),
    { send: 0.6 },
  );
}

/**
 * When a move eased by `ease` over [start, start + duration] first reaches
 * `level` of the way: for a spring (`easing.snap`) the first time it touches
 * its target, which is the moment it visibly lands. Eases that never reach
 * `level` use the moment they reach 98 %.
 */
export function arrival(start: number, duration: number, ease: Ease, level = 1): number {
  const steps = 4000;
  let fallback = duration;
  for (let i = 0; i <= steps; i++) {
    const p = i / steps;
    const v = ease(p);
    if (v >= level - 1e-6) return start + p * duration;
    if (fallback === duration && v >= 0.98) fallback = p * duration;
  }
  return start + fallback;
}

/**
 * Times in [start, end) at which `value(t)` changes (sampled every `step`
 * seconds), e.g. each time a counter's digit turns over.
 */
export function changeTimes(
  value: (t: number) => number,
  start: number,
  end: number,
  step = 0.001,
): number[] {
  const times: number[] = [];
  let last = value(start);
  for (let i = 1; start + i * step < end; i++) {
    const t = start + i * step;
    const v = value(t);
    if (v !== last) times.push(t);
    last = v;
  }
  return times;
}

/** A stateless random number in [0, 1) for sound patterns (same every render). */
export function seeded(name: string, i: number): number {
  return random('sound', name, i);
}

/** Sound `sound` at `at` seconds. */
export function cue(
  at: number,
  sound: Sound,
  extra: Omit<SoundEvent, 'at' | 'sound'> = {},
): SoundEvent {
  return { at, sound, ...extra };
}

/** Cues, in lists nested as deep as is convenient (e.g. one list per repeated moment). */
export type Cues = SoundEvent | readonly Cues[];

function flattenCues(cues: Cues, out: SoundEvent[]): SoundEvent[] {
  if ('sound' in cues) out.push(cues);
  else for (const c of cues) flattenCues(c, out);
  return out;
}

/** Builds a soundtrack from cues with the kit's samples and the theme's room. */
export function soundtrack(cues: readonly Cues[]): Soundtrack {
  return defineSoundtrack({
    samples: Object.fromEntries(Object.entries(SAMPLES).map(([k, v]) => [k, v.url])),
    events: flattenCues(cues, []),
    reverb: tokens.reverb,
  });
}

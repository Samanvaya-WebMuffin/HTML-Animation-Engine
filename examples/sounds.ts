import {
  db,
  type Ease,
  defineSoundtrack,
  hz,
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

import { clamp, tempo, type Soundtrack } from '@html-animation-engine/core';
import { BEAT, BPM, GRID } from '../cowork-beat.js';
import { defineSequence, sceneAt } from '@html-animation-engine/renderers';
import answers from '../cowork-answers/composition.js';
import ask from '../cowork-ask/composition.js';
import criteria from '../cowork-criteria/composition.js';
import intro from '../cowork-intro/composition.js';
import outro from '../cowork-outro/composition.js';
import pain from '../cowork-pain/composition.js';
import work from '../cowork-work/composition.js';
import type { theme } from '../index.js';
import { chord, cue, hat, kick, rim, soundtrack, spiccato, violins } from '../sounds.js';

const SCENES = [pain, criteria, intro, ask, work, answers, outro];
const DURATION = SCENES.reduce((sum, s) => sum + s.duration, 0);
const SYNTH = tempo({ bpm: BPM / 2 });
const db = (x: number) => 10 ** (x / 20);

/** Each scene's chord, matching the pads under it. */
const CHORDS: readonly (keyof typeof theme.sound.chords)[] = [
  'shadow',
  'lift',
  'home',
  'home',
  'lift',
  'home',
  'home',
];
/** Which scene is playing at `t` (a hair later, so a beat on a cut belongs to the new scene). */
const sceneIndex = (t: number) => sceneAt(SCENES, t + 1e-6).index;
const chordAt = (t: number) => CHORDS[sceneIndex(t)] ?? 'home';
const fadeOut = (t: number) => clamp((DURATION - t) / 2);

/**
 * The beat's three patterns (levels against the kit's own). Each builds on
 * the one before, so moving between them never stops the groove.
 */
interface Pattern {
  readonly kick: number;
  readonly rim: number;
  readonly hat: number;
  /** A kick on every beat instead of every other. */
  readonly four: boolean;
  /** The backbeat doubled a hair later and wider. */
  readonly fatRim: boolean;
  /** Sixteenth hats, accented on the off-beat, instead of off-beat eighths. */
  readonly busyHats: boolean;
}
const LOUDER: Pattern = {
  kick: db(5),
  rim: db(4),
  hat: db(2),
  four: false,
  fatRim: false,
  busyHats: false,
};
const PUNCHY: Pattern = { ...LOUDER, rim: db(5), four: true, fatRim: true };
const DRIVING: Pattern = { ...PUNCHY, hat: db(3), busyHats: true };
/** The pattern under each scene: louder, punchy, driving, louder. */
const PATTERNS: readonly Pattern[] = [
  LOUDER, // 1 The pain point
  PUNCHY, // 2 Buying criteria
  PUNCHY, // 3 Product introduction
  PUNCHY, // 4 The ask
  DRIVING, // 5 The work
  DRIVING, // 6 The answers
  LOUDER, // 7 Join the waitlist
];
/** The strings are one part for the whole film: the same sound and level throughout. */
/** The strings' volume, as a share of the level first sampled (60 %, user's call). */
const STRINGS_VOLUME = 0.6;
const STRINGS_LEVEL = { bow: db(-1) * STRINGS_VOLUME, tick: db(-2) * STRINGS_VOLUME } as const;
/** How far into its scene `t` is (0–1): the ostinato grows through each scene. */
const sceneProgress = (t: number) => {
  const { index, local } = sceneAt(SCENES, t + 1e-6);
  return clamp(local / (SCENES[index]?.duration ?? 1));
};

/**
 * Music under the whole film, on the film's beat grid (`cowork-beat.ts`):
 * the beat at 110 bpm changes pattern on each scene's first beat (every cut
 * is on a beat) and never drops out. Over it a synth string section
 * runs unchanged from the first frame to the last, its chord following the
 * scenes: one slow bow every two bars at 55 bpm (violins with vibrato,
 * violas, cellos and basses), each swelling into the next, and a ticking
 * spiccato ostinato on the eighths, alternating the chord's fifth and ninth
 * and growing through each scene.
 */
const music: Soundtrack = soundtrack([
  Array.from({ length: Math.ceil(DURATION / BEAT) }, (_, n) => {
    const t = GRID.beat(n);
    const f = fadeOut(t);
    const p = PATTERNS[sceneIndex(t)] ?? LOUDER;
    const cues = [];
    if (p.busyHats) {
      for (let k = 0; k < 4; k++)
        cues.push(
          cue(t + (k * BEAT) / 4, hat({ gain: p.hat * f * (k === 2 ? 0.9 : 0.45), pan: 0.25 })),
        );
    } else {
      cues.push(cue(t + BEAT / 2, hat({ gain: 0.8 * p.hat * f, pan: 0.25 })));
    }
    if (n % 2 === 0 || p.four) cues.push(cue(t, kick({ gain: p.kick * f })));
    if (n % 2 === 1) {
      cues.push(cue(t, rim({ gain: p.rim * f, pan: -0.15 })));
      if (p.fatRim) cues.push(cue(t + 0.012, rim({ gain: p.rim * 0.7 * f, pan: 0.2 })));
    }
    if (n % 8 === 7) cues.push(cue(t + BEAT / 2, hat({ open: true, gain: 0.6 * p.hat * f })));
    return cues;
  }),
  Array.from({ length: Math.ceil(DURATION / (2 * SYNTH.secondsPerBeat)) }, (_, m) => {
    const bow = 2 * SYNTH.secondsPerBeat;
    const t = m * bow;
    return cue(
      t,
      violins(chordAt(t), bow * 1.08, {
        gain: STRINGS_LEVEL.bow * fadeOut(t),
        pan: m % 2 ? 0.08 : -0.08,
      }),
    );
  }),
  Array.from({ length: Math.ceil(DURATION / (BEAT / 2)) }, (_, k) => {
    const t = GRID.beat(k / 2);
    const notes = chord(chordAt(t), 1);
    const freq = (k % 2 === 0 ? notes[2] : notes[4]) as number;
    const grow = 0.55 + 0.45 * sceneProgress(t);
    return cue(
      t,
      spiccato(freq, {
        gain: STRINGS_LEVEL.tick * grow * (k % 4 === 0 ? 1 : 0.7) * fadeOut(t),
        pan: k % 2 ? 0.3 : -0.3,
      }),
    );
  }),
]);

/**
 * The Cowork film: seven scenes, each a window of one board
 * timeline (the first with the opening's paper wall over it). Every cut is
 * pixel-identical.
 */
export default defineSequence({
  id: 'cowork-film',
  title: 'Cowork: the film (overhaul)',
  scenes: SCENES,
  music: { ...music, events: music.events.filter((e) => e.at < DURATION) },
});

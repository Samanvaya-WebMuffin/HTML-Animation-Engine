import { clamp, tempo, type Soundtrack } from '@html-animation-engine/core';
import { defineSequence, sceneAt } from '@html-animation-engine/renderers';
import bubbles from '../query-bubbles/composition.js';
import cowork from '../query-cowork/composition.js';
import crack from '../query-crack/composition.js';
import criteria from '../query-criteria/composition.js';
import lost from '../query-lost/composition.js';
import ask from '../query-ask/composition.js';
import work from '../query-work/composition.js';
import answers from '../query-answers/composition.js';
import library from '../query-library/composition.js';
import proof from '../query-proof/composition.js';
import week from '../query-week/composition.js';
import outro from '../query-outro/composition.js';
import type { theme } from '../index.js';
import { bass, cue, hat, keys, kick, rim, soundtrack } from '../sounds.js';

const SCENES = [
  bubbles,
  crack,
  lost,
  criteria,
  cowork,
  ask,
  work,
  answers,
  library,
  proof,
  week,
  outro,
];
const DURATION = SCENES.reduce((sum, s) => sum + s.duration, 0);

/** The beat runs at 110 bpm; the synths move at half that, 55 bpm (one chord every two beats). */
const BEAT = tempo({ bpm: 110 });
const SYNTH = tempo({ bpm: 55 });

/** Each scene's chord, matching the pad under it, so music and scenes share a key centre. */
const CHORDS: readonly (keyof typeof theme.sound.chords)[] = [
  'lift',
  'shadow',
  'shadow',
  'lift',
  'home',
  // The product at work.
  'lift',
  'home',
  'lift',
  'home',
  'lift',
  'shadow',
  'home',
];
const chordAt = (t: number) => CHORDS[sceneAt(SCENES, t).index] ?? 'home';

/** The crack's build (from its first crack to the break): the kick drops out, then lands with it. */
const CRACK_START = bubbles.duration;
const BREAK = { from: CRACK_START + 0.55, to: CRACK_START + 1.65 };

/** Everything eases out over the last stretch so the music doesn't stop dead. */
const fadeOut = (t: number) => clamp((DURATION - t) / 2);

/**
 * Light synth music under the whole video: a soft kick on beats 1 and 3,
 * a tiny backbeat on 2 and 4, and hats on the off-beats at 110 bpm; under
 * it, a round bass and mellow keys changing every 55 bpm beat on each
 * scene's chord.
 */
const music: Soundtrack = soundtrack([
  Array.from({ length: Math.ceil(DURATION / BEAT.secondsPerBeat) }, (_, n) => {
    const t = BEAT.beat(n);
    const f = fadeOut(t);
    const inBreak = t >= BREAK.from && t < BREAK.to;
    const cues = [cue(t + BEAT.secondsPerBeat / 2, hat({ gain: 0.8 * f, pan: 0.25 }))];
    if (n % 2 === 0 && !inBreak && t >= BEAT.bar(1)) cues.push(cue(t, kick({ gain: f })));
    if (n % 2 === 1 && t >= BEAT.bar(1)) cues.push(cue(t, rim({ gain: f, pan: -0.15 })));
    if (n % 8 === 7)
      cues.push(cue(t + BEAT.secondsPerBeat / 2, hat({ open: true, gain: 0.6 * f })));
    return cues;
  }),
  Array.from({ length: Math.ceil(DURATION / SYNTH.secondsPerBeat) }, (_, m) => {
    const t = SYNTH.beat(m);
    const length = SYNTH.secondsPerBeat * 0.9;
    const f = fadeOut(t);
    return [
      cue(t, bass(chordAt(t), length, { gain: f })),
      cue(
        t,
        keys(chordAt(t), length, { gain: f * (m % 2 === 0 ? 1 : 0.7), pan: m % 2 ? 0.2 : -0.2 }),
      ),
    ];
  }),
]);

/**
 * The whole queries video, scene after scene: each picks up from the exact
 * frame where the one before ended, with light synth music under it all.
 */
export default defineSequence({
  id: 'query-film',
  title: 'Queries to Cowork: the full video',
  scenes: SCENES,
  music: {
    ...music,
    // Only cues that start inside the video.
    events: music.events.filter((e) => e.at < DURATION),
  },
});

import {
  clamp,
  createCanvasMeasurer,
  lerp,
  progress,
  random,
  type TextMeasurer,
} from '@html-animation-engine/core';
import { defineSceneComposition } from '@html-animation-engine/renderers';
import { phoneDefaults, theme } from '../index.js';
import { wall } from '../query-bubbles/composition.js';
import {
  BOARD,
  CX,
  HEADLINE,
  NOTES,
  STACK_ITEMS,
  STORY_FONTS,
  caption,
  paint,
  type Caption,
  type ItemState,
  type PieceState,
  type Place,
  type StoryState,
} from '../query-story.js';
import {
  arrival,
  bell,
  changeTimes,
  cue,
  pad,
  pluck,
  rustle,
  slap,
  snap,
  soundtrack,
  thump,
  tick,
  whoosh,
} from '../sounds.js';

const { colors, easing } = theme;

/**
 * The pain point. In the empty room the wall left behind, a board goes up
 * and paper notes keep being pinned to it, while files and folders stack up
 * in front. Then it is lost: it all fades to dust and question marks rise.
 * A clock sweeps an hour while the team searches, and the work that needs
 * them drifts away. Notes keep arriving until the board is full (about 3.4 s),
 * each fading soon after it goes up.
 */
const T = {
  board: { start: 0.02, duration: 0.6 },
  /** Note k is pinned at notes.start + notes.span × (k / last)^0.92. */
  notes: { start: 0.3, span: 3.1 },
  /** File or folder k (in landing order) drops at drop.start + drop.span × (k / last)^0.85. */
  drop: { start: 0.12, span: 1.8, fall: 0.42 },
  /** Once the last file lands, the board and its notes fade back. */
  fade: { duration: 0.7, amount: 0.55 },
  lost: { start: 2.05, duration: 0.8 },
  asks: { start: 2.2, each: 0.13 },
  /** The first line leaves; the second arrives. */
  swap: 3.0,
  clock: { start: 3.3, sweep: 3.6, sweepEnd: 6.4 },
  people: { start: 3.5, each: 0.14 },
  work: { start: 5.0, away: 5.45, awayEnd: 6.8 },
  duration: 7,
} as const;

const LINE_A = {
  text: 'Most of the knowledge | your company produces, | is *lost.*',
  at: [0.25, 0.85, 1.7],
};
const LINE_B = {
  text: 'But every *hour* they spend | tracking it down | is an *hour* away | from the work that needs | their _expertise._',
  at: [3.3, 3.85, 4.4, 5.0, 5.6],
};

const noteAt = (i: number) => T.notes.start + T.notes.span * (i / (NOTES.length - 1)) ** 0.92;
/** When a note's pin goes in. */
const pinAt = (i: number) => noteAt(i) + 0.16;
const dropAt = (order: number) =>
  T.drop.start + T.drop.span * (order / (STACK_ITEMS.length - 1)) ** 0.85;
const landAt = (order: number) => dropAt(order) + T.drop.fall;
/** When the last file lands. */
const FILED = landAt(STACK_ITEMS.length - 1);

const ASKS = [
  { x: 108, y: 884, tilt: -10 },
  { x: 262, y: 902, tilt: 8 },
  { x: 438, y: 878, tilt: -4 },
  { x: 610, y: 896, tilt: 12 },
  { x: 352, y: 930, tilt: -12 },
] as const;
const askAt = (k: number) => T.asks.start + k * T.asks.each;

const PEOPLE = [
  { x: 74, y: 1214 },
  { x: 646, y: 1214 },
  { x: CX, y: 1222 },
] as const;
const personAt = (k: number) => T.people.start + k * T.people.each;
/** Where each magnifier searches: the two outer stacks and the board. */
const SEARCH = [
  { x: 190, y: 1070 },
  { x: 540, y: 1076 },
  { x: CX, y: 760 },
] as const;

const DIAL = { x: CX, y: 560, size: 208 } as const;
const WORK = { from: { x: 562, y: 590 }, to: { x: 638, y: 472 } } as const;

const sweep = (t: number) =>
  progress(t, T.clock.sweep, T.clock.sweepEnd - T.clock.sweep, easing.camera);

export interface LostCaptions {
  readonly a: Caption;
  readonly b: Caption;
}

function createCaptions(measurer: TextMeasurer): LostCaptions {
  const common = { font: HEADLINE, y: 150, maxWidth: 600 };
  return {
    a: caption('lost-a', { ...LINE_A, ...common, breaks: [4, 7], accent: colors.alert }, measurer),
    b: caption('lost-b', { ...LINE_B, ...common }, measurer),
  };
}

/**
 * The scene at `t` (also past its end, where things keep their slow motion),
 * with the second line leaving as `exit` goes 0 → 1.
 */
function state(t: number, captions: LostCaptions, exit = 0): StoryState {
  const lostness = progress(t, T.lost.start, T.lost.duration, easing.camera);
  const b = progress(t, T.board.start, T.board.duration, easing.enter);
  const pieces = NOTES.map((note, i): PieceState | null => {
    const p = progress(t, noteAt(i), 0.3, easing.enter);
    if (p <= 0) return null;
    return {
      x: BOARD.x + note.x,
      y: BOARD.y + note.y,
      rot: note.rot,
      scale: lerp(1.12, 1, p),
      opacity: clamp(p * 3),
      dot: 0,
      // Lost with the rest; notes pinned up after that fade soon after they go up.
      ghost: progress(t, Math.max(T.lost.start, noteAt(i) + 0.9), T.lost.duration, easing.camera),
      press: p,
      pin: progress(t, pinAt(i), 0.22, easing.snap),
    };
  });
  const items = STACK_ITEMS.map((item): ItemState | null => {
    const p = progress(t, dropAt(item.order), T.drop.fall, easing.exit);
    if (p <= 0) return null;
    const settle = progress(t, landAt(item.order), 0.35, easing.snap);
    const rock = random('query-lost', 'rock', item.order) > 0.5 ? 4 : -4;
    return {
      x: item.x,
      y: lerp(item.y - 260, item.y, p),
      rot: lerp(item.rot + rock, item.rot, settle),
      scale: 1,
      opacity: clamp(p * 4),
      ghost: lostness,
    };
  });
  const questions = ASKS.map((a, k): Place | null => {
    const q = progress(t, askAt(k), 0.5, easing.snap);
    if (q <= 0) return null;
    const age = t - askAt(k);
    return {
      x: a.x,
      y: a.y + 7 * Math.sin((age / 1.8) * 2 * Math.PI + k),
      scale: q,
      opacity: clamp(q * 3),
      rot: a.tilt,
    };
  });
  const people = PEOPLE.map((p, k): Place | null => {
    const q = progress(t, personAt(k), 0.5, easing.snap);
    return q > 0 ? { x: p.x, y: p.y, scale: q, opacity: clamp(q * 3) } : null;
  });
  const lenses = PEOPLE.map((p, k): Place | null => {
    const q = progress(t, personAt(k) + 0.2, 0.6, easing.enter);
    if (q <= 0) return null;
    const s = SEARCH[k] ?? SEARCH[0];
    const age = t - personAt(k);
    const search = {
      x: s.x + 62 * Math.sin((age / 2.4) * 2 * Math.PI + k * 2),
      y: s.y + 34 * Math.cos((age / 1.9) * 2 * Math.PI + k),
    };
    return {
      x: lerp(p.x, search.x, q),
      y: lerp(p.y - 20, search.y, q),
      scale: lerp(0.4, 1, q),
      opacity: clamp(q * 3),
      rot: 12 * Math.sin((age / 2.4) * 2 * Math.PI + k * 2),
    };
  });
  const c = progress(t, T.clock.start, 0.55, easing.snap);
  const w = progress(t, T.work.start, 0.5, easing.snap);
  const away = progress(t, T.work.away, T.work.awayEnd - T.work.away, easing.camera);
  const out = progress(t, T.swap, 0.3, easing.exit);
  return {
    board:
      b > 0
        ? {
            y: (1 - b) * 26,
            scale: lerp(0.97, 1, b),
            opacity: b,
            veil: T.fade.amount * progress(t, FILED, T.fade.duration, easing.camera),
          }
        : null,
    pieces,
    items,
    questions,
    people,
    lenses,
    work:
      w > 0
        ? {
            x: lerp(WORK.from.x, WORK.to.x, away),
            y: lerp(WORK.from.y, WORK.to.y, away),
            scale: w * lerp(1, 0.55, away),
            opacity: clamp(w * 3) * lerp(1, 0.38, away),
            rot: lerp(0, 8, away),
          }
        : null,
    dial:
      c > 0
        ? {
            ...DIAL,
            radius: DIAL.size / 2,
            scale: c,
            dark: 0,
            face: 1,
            sweep: sweep(t),
            mark: 0,
            markScale: 1,
            sheen: 0,
          }
        : null,
    links: null,
    reach: null,
    field: null,
    tasks: [],
    captions: [captions.a(t, out), captions.b(t, exit)],
  };
}

/** This scene, for the next to pick up from its exact last frame. */
export const lost = { duration: T.duration, createCaptions, state };

/**
 * Files and folders landing in a patter of soft slaps; the faintest rustle
 * of paper as each note goes up; a hollow drop as it all
 * turns to dust; low plucks for the question marks; the clock ticking through
 * the hour; the work drifting off on a breath of air.
 */
const audio = soundtrack([
  cue(0.1, pad(T.duration - 0.6, { chord: 'shadow', attack: 0.5, release: 1, gain: 0.9 })),
  STACK_ITEMS.map((item) =>
    cue(
      landAt(item.order),
      slap({
        gain: lerp(0.9, 0.5, item.order / STACK_ITEMS.length),
        pan: clamp((item.x - CX) / CX, -1, 1) * 0.6,
      }),
    ),
  ),
  NOTES.map((note, i) => cue(noteAt(i), rustle({ take: i, pan: clamp(note.x / CX, -1, 1) * 0.6 }))),
  cue(T.lost.start, whoosh(0.9, { from: 1800, to: 160, peak: 0.15, gain: 0.8 })),
  cue(T.lost.start, thump({ gain: 0.5 })),
  cue(T.lost.start, pluck({ degree: 0, octave: 0, gain: 0.7 })),
  ASKS.map((a, k) =>
    cue(
      arrival(askAt(k), 0.5, easing.snap),
      pluck({ degree: [7, 5, 4, 2, 0][k] ?? 0, octave: 1, gain: 0.55, pan: (a.x - CX) / CX }),
    ),
  ),
  cue(arrival(T.clock.start, 0.55, easing.snap), snap({ degree: 2, gain: 0.8 })),
  changeTimes((t) => Math.floor(sweep(t) * 12), T.clock.sweep, T.clock.sweepEnd + 0.01).map(
    (t, k) => cue(t, tick({ degree: 4, take: k, gain: 0.55, pan: k % 2 ? 0.2 : -0.2 })),
  ),
  PEOPLE.map((p, k) =>
    cue(
      arrival(personAt(k), 0.5, easing.snap),
      pluck({ degree: [2, 4, 7][k] ?? 0, octave: 1, gain: 0.5, pan: (p.x - CX) / CX }),
    ),
  ),
  cue(arrival(T.work.start, 0.5, easing.snap), bell({ degree: 7, gain: 0.5, pan: 0.4 })),
  cue(
    T.work.away,
    whoosh(T.work.awayEnd - T.work.away, { from: 900, to: 280, peak: 0.3, gain: 0.6, pan: 0.4 }),
  ),
  cue(T.clock.sweepEnd, bell({ degree: 0, gain: 0.45 })),
]);

export default defineSceneComposition({
  ...phoneDefaults,
  fonts: [...phoneDefaults.fonts, ...STORY_FONTS],
  id: 'query-lost',
  seed: 'query-lost',
  audio,
  title: 'Knowledge gets lost',
  duration: T.duration,
  background: colors.paper,
  renderer: 'svg',
  setup: () => createCaptions(createCanvasMeasurer()),
  scene: (t, _ctx, captions) => ({
    camera: wall.camera(wall.end),
    world: [wall.room, ...paint(state(t, captions))],
  }),
});

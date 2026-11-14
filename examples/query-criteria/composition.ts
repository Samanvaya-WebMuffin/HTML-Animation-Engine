import {
  clamp,
  createCanvasMeasurer,
  lerp,
  progress,
  type TextMeasurer,
} from '@html-animation-engine/core';
import { defineSceneComposition } from '@html-animation-engine/renderers';
import { phoneDefaults, theme } from '../index.js';
import { wall } from '../query-bubbles/composition.js';
import { lost, type LostCaptions } from '../query-lost/composition.js';
import {
  CX,
  HEADLINE,
  HUB,
  LINKS,
  PIECES,
  SPOKES,
  STACK_ITEMS,
  STORY_FONTS,
  TASKS,
  blendPlace,
  caption,
  paint,
  type Caption,
  type Place,
  type StoryState,
} from '../query-story.js';
import {
  arrival,
  bell,
  clap,
  cue,
  pad,
  pluck,
  seeded,
  snap,
  soundtrack,
  tick,
  whoosh,
} from '../sounds.js';

const { colors, easing } = theme;

/**
 * The buying criteria, as a diagram. The lost notes peel off the board (the
 * files and the board drop away) and the clock becomes a hub: the pieces turn into a network around it, linked
 * to each other and to the hub (seeing the bigger picture). Then a dashed
 * circle marks what the team could reach, and a field grows past it,
 * lighting up work outside it (work they couldn't take on before).
 */
const T = {
  /** The previous line leaves. */
  exit: 0.35,
  /** Piece k starts moving at gather.start + gather.span × k / last. */
  gather: { start: 0.08, span: 0.55, move: 0.8 },
  /** The emptied board drops away. */
  board: { start: 0.7, duration: 0.75 },
  /** The clock shrinks and darkens into the hub. */
  dial: { start: 0.05, duration: 0.85 },
  /** The whole network settles from slightly close to its full size: the bigger picture. */
  pull: { start: 0.5, duration: 1.9 },
  spokes: { start: 0.8, each: 0.07 },
  links: { start: 1.0, span: 1.05, draw: 0.35 },
  reach: { start: 2.35, duration: 0.5 },
  tasks: { start: 2.45, each: 0.05 },
  field: { start: 2.95, duration: 1.05 },
  duration: 5,
} as const;

const LINE = {
  text: "Enterprise AI should help teams | see the *bigger* *picture,* | and take on work | they _couldn't_ _before._",
  at: [0.45, 1.05, 2.5, 3.0],
};

const REACH = 100;
const FIELD = 340;
/** The team, inside its old reach. */
const TEAM = [-150, -30, 90].map((deg) => ({
  x: HUB.x + 68 * Math.cos((deg * Math.PI) / 180),
  y: HUB.y + 68 * Math.sin((deg * Math.PI) / 180),
}));

const pieceAt = (i: number) => T.gather.start + (T.gather.span * i) / (PIECES.length - 1);
const spokeAt = (k: number) => T.spokes.start + k * T.spokes.each;
const linkAt = (k: number) => T.links.start + (T.links.span * k) / Math.max(LINKS.length - 1, 1);
const taskAt = (k: number) => T.tasks.start + k * T.tasks.each;
const fieldR = (t: number) =>
  lerp(REACH, FIELD, progress(t, T.field.start, T.field.duration, easing.enter));
/** When the growing field reaches a task tile (its inner edge). */
const litAt = (k: number) =>
  arrival(
    T.field.start,
    T.field.duration,
    easing.enter,
    clamp(((TASKS[k]?.r ?? FIELD) - 25 - REACH) / (FIELD - REACH)),
  );

export interface CriteriaCaptions {
  readonly lost: LostCaptions;
  readonly line: Caption;
}

function createCaptions(measurer: TextMeasurer): CriteriaCaptions {
  return {
    lost: lost.createCaptions(measurer),
    line: caption('criteria', { ...LINE, font: HEADLINE, y: 150, maxWidth: 600 }, measurer),
  };
}

function state(t: number, captions: CriteriaCaptions, exit = 0): StoryState {
  const out = progress(t, 0, T.exit, easing.exit);
  // Scene 1 of the story, still moving, as it was at its end.
  const from = lost.state(lost.duration + t, captions.lost, out);
  const zoom = lerp(1.18, 1, progress(t, T.pull.start, T.pull.duration, easing.camera));
  const pieces = PIECES.map((piece, i) => {
    const a = from.pieces[i];
    if (!a) return null;
    const p = progress(t, pieceAt(i), T.gather.move, easing.camera);
    return {
      x: lerp(a.x, HUB.x + (piece.net.x - HUB.x) * zoom, p),
      y: lerp(a.y, HUB.y + (piece.net.y - HUB.y) * zoom, p),
      rot: lerp(a.rot, 0, p),
      scale: a.scale,
      opacity: a.opacity,
      // Peeling off the board (its pin popping out) brings its colour back as it shrinks to a dot.
      dot: p,
      ghost: lerp(a.ghost, 0, clamp(p * 1.6)),
      press: lerp(a.press, 0, clamp(p * 3)),
      pin: lerp(a.pin, 0, clamp(p * 4)),
    };
  });
  // The files and folders drop away, stack by stack; the bare board follows once the notes have gone.
  const items = from.items.map((s, k) => {
    const item = STACK_ITEMS[k];
    if (!s || !item) return null;
    const e = progress(t, 0.04 * item.stack + 0.012 * item.level, 0.6, easing.exit);
    return { ...s, y: s.y + 560 * e, opacity: s.opacity * (1 - e) };
  });
  const away = progress(t, T.board.start, T.board.duration, easing.exit);
  const fade = (s: Place | null, start: number, duration: number): Place | null => {
    if (!s) return null;
    const e = progress(t, start, duration, easing.exit);
    return { ...s, scale: s.scale * (1 - e), opacity: s.opacity * (1 - e) };
  };
  const people = from.people.map((s, k) => {
    const to = TEAM[k];
    if (!s || !to) return s;
    const p = progress(t, 0.25 + k * 0.08, 0.85, easing.camera);
    return blendPlace(s, { ...to, scale: 0.56, opacity: 1 }, p);
  });
  const d = from.dial;
  const g = progress(t, T.dial.start, T.dial.duration, easing.camera);
  const size = d ? lerp(d.size, 88, g) : 88;
  const reach = progress(t, T.reach.start, T.reach.duration, easing.enter);
  const field = progress(t, T.field.start, 0.2);
  return {
    board: from.board
      ? {
          ...from.board,
          y: from.board.y + 900 * away,
          opacity: from.board.opacity * (1 - away),
          // The knowledge comes back: the board clears as the notes let go of it.
          veil: from.board.veil * (1 - progress(t, 0, 0.6, easing.camera)),
        }
      : null,
    pieces,
    items,
    questions: from.questions.map((s) => fade(s, 0, 0.35)),
    lenses: from.lenses.map((s) => fade(s, 0, 0.3)),
    people,
    work: from.work
      ? blendPlace(
          from.work,
          { ...from.work, x: from.work.x + 30, y: from.work.y - 40, scale: 0, opacity: 0 },
          progress(t, 0, 0.5, easing.exit),
        )
      : null,
    dial: d
      ? {
          ...d,
          y: lerp(d.y, HUB.y, g),
          size,
          radius: size / 2,
          // Darkens once it is small, so it never sits as a big grey disc.
          dark: clamp((g - 0.55) / 0.45),
          face: d.face * (1 - progress(t, T.dial.start, 0.35)),
          mark: progress(t, T.dial.start + 0.5, 0.45, easing.enter),
        }
      : null,
    links: {
      drawn: [
        ...LINKS.map((_, k) => progress(t, linkAt(k), T.links.draw, easing.enter)),
        ...SPOKES.map((_, k) => progress(t, spokeAt(k), T.links.draw, easing.enter)),
      ],
      opacity: 1,
    },
    reach: reach > 0 ? { r: lerp(REACH * 0.8, REACH, reach), opacity: reach } : null,
    field: field > 0 ? { r: fieldR(t), opacity: field } : null,
    tasks: TASKS.map((task, k) => {
      const q = progress(t, taskAt(k), 0.45, easing.snap);
      if (q <= 0) return null;
      return {
        x: task.x,
        y: task.y,
        scale: q,
        opacity: clamp(q * 3),
        lit: progress(t, litAt(k), 0.3, easing.enter),
      };
    }),
    captions: [...from.captions, captions.line(t, exit)],
  };
}

/** This scene, for the next to pick up from its exact last frame. */
export const criteria = { duration: T.duration, createCaptions, state };

/**
 * Air gathering as the pieces lift; a pluck for each link as the network
 * grows from the hub; a tick for the old reach; a rising swell as the field
 * spreads, each task lighting with a snap up the scale; a clap and bell as
 * the last one lights.
 */
const lastLit = Math.max(...TASKS.map((_, k) => litAt(k)));
const audio = soundtrack([
  cue(0.05, pad(T.duration - 0.5, { chord: 'lift', attack: 0.4, release: 1.1, gain: 0.9 })),
  cue(0.02, whoosh(0.95, { from: 280, to: 2600, peak: 0.7, gain: 0.9 })),
  cue(T.dial.start + T.dial.duration, snap({ degree: 0, gain: 0.7 })),
  SPOKES.map((i, k) => {
    const p = PIECES[i]?.net ?? HUB;
    return cue(
      spokeAt(k),
      pluck({ degree: [0, 2, 4, 7, 9, 7, 4][k] ?? 0, octave: 2, gain: 0.45, pan: (p.x - CX) / CX }),
    );
  }),
  LINKS.filter((_, k) => k % 4 === 0).map((link, k) =>
    cue(
      linkAt(LINKS.indexOf(link)),
      tick({ degree: 5 + (k % 5), gain: 0.4, pan: (seeded('link-pan', k) - 0.5) * 1.2 }),
    ),
  ),
  cue(T.reach.start, tick({ degree: 0, gain: 0.7 })),
  cue(T.field.start, whoosh(T.field.duration, { from: 250, to: 3200, peak: 0.85, gain: 1.1 })),
  TASKS.map((task, k) =>
    cue(
      litAt(k),
      snap({ degree: k + 2, take: k, gain: 0.55, pan: clamp((task.x - CX) / CX, -1, 1) * 0.7 }),
    ),
  ),
  cue(lastLit + 0.05, clap({ chord: 'lift', gain: 0.8 })),
  cue(lastLit + 0.1, bell({ degree: 4, gain: 0.55 })),
]);

export default defineSceneComposition({
  ...phoneDefaults,
  fonts: [...phoneDefaults.fonts, ...STORY_FONTS],
  id: 'query-criteria',
  seed: 'query-criteria',
  audio,
  title: 'What AI should do',
  duration: T.duration,
  background: colors.paper,
  renderer: 'svg',
  setup: () => createCaptions(createCanvasMeasurer()),
  scene: (t, _ctx, captions) => ({
    camera: wall.camera(wall.end),
    world: [wall.room, ...paint(state(t, captions))],
  }),
});

import {
  createCanvasMeasurer,
  lerp,
  progress,
  type TextMeasurer,
} from '@html-animation-engine/core';
import { defineSceneComposition } from '@html-animation-engine/renderers';
import { phoneDefaults, theme } from '../index.js';
import { wall } from '../query-bubbles/composition.js';
import { criteria, type CriteriaCaptions } from '../query-criteria/composition.js';
import {
  STORY_FONTS,
  TAGLINE,
  WORDMARK,
  caption,
  paint,
  type Caption,
  type Place,
  type StoryState,
} from '../query-story.js';
import { arrival, bell, clap, cue, pad, pluck, soundtrack, thump, whoosh } from '../sounds.js';

const { colors, easing } = theme;

/**
 * The product. Everything in the network (pieces, tasks, the team) is drawn
 * into the hub, which rises and opens into the Cowork tile, its four-square
 * mark the pieces brought together. The name lands under it, then the
 * tagline.
 */
const T = {
  /** The previous line leaves. */
  exit: 0.35,
  /** Item k starts moving in at converge.start + converge.span × k / last. */
  converge: { start: 0.08, span: 0.4, move: 0.55 },
  rise: { start: 0.2, duration: 0.85 },
  grow: { start: 0.55, duration: 0.7 },
  sheen: { start: 1.5, duration: 1.0 },
  name: 1.05,
  tagline: 1.45,
  duration: 4.5,
} as const;

export const TILE = { y: 512, size: 200, radius: 50 } as const;

export interface CoworkCaptions {
  readonly criteria: CriteriaCaptions;
  readonly name: Caption;
  readonly tagline: Caption;
}

function createCaptions(measurer: TextMeasurer): CoworkCaptions {
  return {
    criteria: criteria.createCaptions(measurer),
    name: caption(
      'cowork-name',
      { text: 'Cowork.', at: [T.name], font: WORDMARK, y: 652, maxWidth: 680 },
      measurer,
    ),
    tagline: caption(
      'cowork-tagline',
      {
        text: 'Know what your company *knows*',
        at: [T.tagline],
        font: TAGLINE,
        y: 792,
        maxWidth: 660,
        stagger: 0.07,
      },
      measurer,
    ),
  };
}

function state(t: number, captions: CoworkCaptions, exit = 0): StoryState {
  const out = progress(t, 0, T.exit, easing.exit);
  const from = criteria.state(criteria.duration, captions.criteria, out);
  const d = from.dial;
  const rise = progress(t, T.rise.start, T.rise.duration, easing.camera);
  const grow = progress(t, T.grow.start, T.grow.duration, easing.snap);
  const hub = d ? { x: d.x, y: lerp(d.y, TILE.y, rise) } : { x: 0, y: 0 };
  // Everything is drawn into the hub, in turn.
  let order = 0;
  const total = from.pieces.length + from.tasks.length + from.people.length;
  const inward = <S extends Place>(s: S | null): S | null => {
    const k = order++;
    if (!s) return null;
    const p = progress(
      t,
      T.converge.start + (T.converge.span * k) / (total - 1),
      T.converge.move,
      easing.exit,
    );
    return {
      ...s,
      x: lerp(s.x, hub.x, p),
      y: lerp(s.y, hub.y, p),
      scale: s.scale * lerp(1, 0.25, p),
      opacity:
        s.opacity *
        (1 -
          progress(
            t,
            T.converge.start + (T.converge.span * k) / (total - 1) + T.converge.move * 0.6,
            T.converge.move * 0.4,
          )),
    };
  };
  const pieces = from.pieces.map(inward);
  const tasks = from.tasks.map(inward);
  const people = from.people.map(inward);
  const shrink = progress(t, 0.05, 0.6, easing.exit);
  return {
    ...from,
    pieces,
    tasks,
    people,
    links: from.links
      ? { ...from.links, opacity: from.links.opacity * (1 - progress(t, 0, 0.35)) }
      : null,
    reach: from.reach
      ? { r: from.reach.r * (1 - shrink), opacity: from.reach.opacity * (1 - shrink) }
      : null,
    field: from.field
      ? { r: lerp(from.field.r, 40, shrink), opacity: from.field.opacity * (1 - shrink) }
      : null,
    dial: d
      ? {
          ...d,
          y: hub.y,
          size: lerp(d.size, TILE.size, grow),
          radius: lerp(d.radius, TILE.radius, grow),
          sheen: progress(t, T.sheen.start, T.sheen.duration, easing.camera),
        }
      : null,
    captions: [...from.captions, captions.name(t, exit), captions.tagline(t, exit)],
  };
}

/** This scene, for the next to pick up from its exact last frame. */
export const cowork = { duration: T.duration, createCaptions, state };

/**
 * A rising rush as everything is drawn in; the tile lands on a big clap on
 * the home chord; a bell for the name; a rising pluck for each word of the tagline; and a
 * warm home pad to the end.
 */
const landed = arrival(T.grow.start, T.grow.duration, easing.snap);
const audio = soundtrack([
  cue(0.02, whoosh(landed - 0.02, { from: 220, to: 4000, peak: 0.88, gain: 1.2 })),
  cue(landed, clap({ big: true, chord: 'home' })),
  cue(landed, thump({ gain: 0.6 })),
  cue(landed + 0.05, pad(T.duration - landed - 0.6, { chord: 'home', attack: 0.3, release: 1.5 })),
  cue(T.name + 0.05, bell({ degree: 4, gain: 0.7 })),
  cue(T.sheen.start + 0.3, bell({ degree: 9, gain: 0.3, pan: 0.3 })),
  [0, 2, 4, 7, 9].map((degree, k) =>
    cue(T.tagline + k * 0.07, pluck({ degree, octave: 2, gain: 0.3, pan: (k - 2) * 0.15 })),
  ),
]);

export default defineSceneComposition({
  ...phoneDefaults,
  fonts: [...phoneDefaults.fonts, ...STORY_FONTS],
  id: 'query-cowork',
  seed: 'query-cowork',
  audio,
  title: 'Introducing Cowork',
  duration: T.duration,
  background: colors.paper,
  renderer: 'svg',
  setup: () => createCaptions(createCanvasMeasurer()),
  scene: (t, _ctx, captions) => ({
    camera: wall.camera(wall.end),
    world: [wall.room, ...paint(state(t, captions))],
  }),
});

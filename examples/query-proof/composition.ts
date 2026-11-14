import {
  clamp,
  createCanvasMeasurer,
  groupNode,
  layoutText,
  lerp,
  progress,
  textNode,
  withAlpha,
  type FontSpec,
  type SceneNode,
  type TextMeasurer,
} from '@html-animation-engine/core';
import { defineSceneComposition, elevationShadows } from '@html-animation-engine/renderers';
import {
  APPS_FONTS,
  DESK,
  MID,
  OFF_CAMERA,
  WIN,
  SCENES,
  appsWorld,
  createApps,
  cuesBetween,
  type Apps,
} from '../cowork-apps.js';
import { box, createUi, UI } from '../cowork-ui.js';
import { font, lighting, phoneDefaults, theme } from '../index.js';
import { wall } from '../query-bubbles/composition.js';
import { CX } from '../query-story.js';
import { cue, key, pad, pluck, pop, soundtrack, thump, tick } from '../sounds.js';

const { colors, easing } = theme;

/**
 * Social proof: a fast montage of the product at work, cut clip to clip at
 * full frame, with two text cards that each span two clips. The camera
 * pushes into the COO's library (the exact last frame of `query-library`)
 * and the montage cuts in.
 *
 * The script asks for real screen recordings here. Until those exist, each
 * clip replays a stretch of the application timeline full-frame:
 * a Level 1 answer streaming in with its sources (one opened), researchers
 * at work against the clock, the report opening on its bottom line and
 * chart, and the Reports library.
 */
const LIB_END = SCENES.library.end;
const T = { push: 0.55, clip: 1.25 } as const;

const CLIPS = [
  { desk: DESK.c, from: OFF_CAMERA.stream - 0.15 },
  { desk: DESK.a, from: 13.65 },
  { desk: DESK.a, from: 22.7 },
  { desk: DESK.a, from: 25.95 },
] as const;
const clipAt = (k: number) => T.push + k * T.clip;
const DURATION = clipAt(CLIPS.length);

/**
 * Full frame, like a screen recording: the window spans the frame's width
 * with its top on the frame's top edge, drifting up a little during each clip.
 */
const ZOOM = 720 / WIN.w;
const FULL = { zoom: ZOOM, y: WIN.top + MID / ZOOM } as const;

const CARD: FontSpec = { ...font('display', 34), lineHeight: 1.15, letterSpacing: -0.6 };
const CARDS = [
  { text: 'Sparing hours of searching,', at: clipAt(0) + 0.1, out: clipAt(2) - 0.12 },
  { text: 'so teams can do\nthe work that matters.', at: clipAt(2) + 0.05, out: Infinity },
] as const;
/** Below the recording, on the room. */
const CARD_Y = 1040;

type Card = (t: number, exit?: number) => SceneNode | null;

/** A text card: light type on a dark rounded plate near the bottom, rising in. */
function createCard(
  id: string,
  text: string,
  at: number,
  out: number,
  measurer: TextMeasurer,
): Card {
  const layout = layoutText(text, CARD, { measurer, maxWidth: 640, align: 'center' });
  const w = layout.width + 56;
  const h = layout.height + 34;
  return (t, exit = 0) => {
    const p = progress(t, at, 0.45, easing.enter);
    const o = Math.max(exit, progress(t, out, 0.25, easing.exit));
    if (p <= 0 || o >= 1) return null;
    return groupNode(
      id,
      [
        box(`${id}-plate`, CX - w / 2, CARD_Y, w, h, 22, {
          fill: withAlpha(UI.ink, 0.92),
          shadow: elevationShadows(lighting, 'mid', { strength: 0.6 }),
        }),
        ...layout.lines.map((line) =>
          textNode(`${id}-l${line.index}`, {
            text: line.text,
            font: CARD,
            fill: colors.light,
            align: 'center',
            transform: { x: CX, y: CARD_Y + 17 + line.y },
          }),
        ),
      ],
      { opacity: clamp(p * 1.6) * (1 - o), transform: { y: 18 * (1 - p) + 10 * o } },
    );
  };
}

interface State {
  readonly apps: Apps;
  readonly cards: readonly Card[];
}

function createState(measurer: TextMeasurer): State {
  return {
    apps: createApps(createUi(measurer)),
    cards: CARDS.map((c, k) => createCard(`proof-card${k}`, c.text, c.at, c.out, measurer)),
  };
}

/** The scene at `t` (and past its end, for the next scene); `exit` takes the last card away. */
function world(t: number, state: State, exit = 0): SceneNode[] {
  const nodes: SceneNode[] = [];
  if (t < T.push) {
    // Into the COO's library, from where the last scene ended.
    const p = progress(t, 0, T.push, easing.camera);
    nodes.push(
      ...appsWorld(state.apps, LIB_END + t, {
        camera: { x: DESK.a, y: lerp(MID, FULL.y, p), zoom: lerp(1, FULL.zoom, p) },
        captionExit: progress(t, 0, 0.3, easing.exit),
      }),
    );
  } else {
    const k = Math.min(Math.floor((t - T.push) / T.clip), CLIPS.length - 1);
    const clip = CLIPS[k] ?? CLIPS[0];
    const local = t - clipAt(k);
    nodes.push(
      ...appsWorld(state.apps, clip.from + local, {
        camera: { x: clip.desk, y: FULL.y + 14 * clamp(local / T.clip), zoom: FULL.zoom },
        captions: false,
      }),
    );
  }
  state.cards.forEach((card, k) => {
    const n = card(t, k === state.cards.length - 1 ? exit : 0);
    if (n) nodes.push(n);
  });
  return nodes;
}

/** This scene, for the next to pick up from its exact last frame. */
export const proof = { duration: DURATION, createState, world, fonts: [CARD] };

/**
 * Each clip keeps its own sounds (typing, clicks, plucks); a soft knock on
 * every cut keeps the montage on the beat.
 */
const audio = soundtrack([
  cue(0.05, pad(DURATION - 0.4, { chord: 'lift', attack: 0.4, release: 1, gain: 0.5 })),
  CLIPS.map((clip, k) => [
    cue(clipAt(k), thump({ gain: 0.35 })),
    cue(clipAt(k), tick({ degree: [0, 4, 7, 9][k] ?? 0, gain: 0.45 })),
    cuesBetween(clip.from, clip.from + T.clip, clipAt(k)),
  ]),
  // The montage's first clip: words streaming in, the sources, a click on one.
  cue(clipAt(0) + (OFF_CAMERA.streamEnd - CLIPS[0].from), pop({ degree: 4, gain: 0.4 })),
  cue(clipAt(0) + (OFF_CAMERA.click - CLIPS[0].from), key({ degree: 4, take: 1, gain: 0.5 })),
  CARDS.map((c, k) => cue(c.at + 0.05, pluck({ degree: [4, 7][k] ?? 0, octave: 1, gain: 0.4 }))),
]);

export default defineSceneComposition({
  ...phoneDefaults,
  fonts: [...phoneDefaults.fonts, ...APPS_FONTS, CARD],
  id: 'query-proof',
  seed: 'query-proof',
  audio,
  title: 'In use',
  duration: DURATION,
  background: colors.paper,
  renderer: 'svg',
  setup: () => createState(createCanvasMeasurer()),
  scene: (t, _ctx, state) => ({
    camera: wall.camera(wall.end),
    world: [wall.room, ...world(t, state)],
  }),
});

import {
  clamp,
  createCanvasMeasurer,
  groupNode,
  lerp,
  pathGeometry,
  progress,
  rect,
  shapeNode,
  withAlpha,
  type FontSpec,
  type SceneNode,
  type TextMeasurer,
} from '@html-animation-engine/core';
import {
  defineSceneComposition,
  elevationShadows,
  litFill,
} from '@html-animation-engine/renderers';
import { APPS_FONTS } from '../cowork-apps.js';
import { label } from '../cowork-ui.js';
import { font, lighting, phoneDefaults, theme } from '../index.js';
import { proof } from '../query-proof/composition.js';
import { wall } from '../query-bubbles/composition.js';
import { CX, TAGLINE, WORDMARK, caption, type Caption } from '../query-story.js';
import { week } from '../query-week/composition.js';
import { arrival, bell, clap, cue, pad, pluck, pop, soundtrack, thump, whoosh } from '../sounds.js';

const { colors, easing } = theme;

/**
 * The outro: the finished report folds into the Cowork tile, then the name,
 * the tagline and one call to action, held to the end.
 */
const T = {
  exit: 0.35,
  morph: { start: 0.1, duration: 0.8 },
  sheen: { start: 1.7, duration: 1.0 },
  name: 1.0,
  tagline: 1.4,
  cta: 2.15,
  ctaSheen: { start: 3.1, duration: 0.9 },
  duration: 5,
} as const;

const CTA_FONT: FontSpec = {
  ...font('body', 24),
  weight: 650,
  letterSpacing: -0.2,
  lineHeight: 1.2,
};
const CTA = { y: 884, h: 66 } as const;

interface State {
  readonly measurer: TextMeasurer;
  readonly week: ReturnType<typeof week.createState>;
  readonly name: Caption;
  readonly tagline: Caption;
}

function createState(measurer: TextMeasurer): State {
  return {
    measurer,
    week: week.createState(measurer),
    name: caption(
      'outro-name',
      { text: 'Cowork.', at: [T.name], font: WORDMARK, y: 600, maxWidth: 680 },
      measurer,
    ),
    tagline: caption(
      'outro-tagline',
      {
        text: 'Know what your company *knows*',
        at: [T.tagline],
        font: TAGLINE,
        y: 742,
        maxWidth: 660,
        stagger: 0.07,
      },
      measurer,
    ),
  };
}

/** The call to action: a dark pill that rises in, with a light crossing it once. */
function cta(state: State, t: number): SceneNode | null {
  const p = progress(t, T.cta, 0.55, easing.snap);
  if (p <= 0) return null;
  const text = 'Join the waitlist.';
  const w = state.measurer.measure(text, CTA_FONT) + 96;
  const x0 = CX - w / 2;
  const sheen = progress(t, T.ctaSheen.start, T.ctaSheen.duration, easing.camera);
  const sx = lerp(x0 - 80, x0 + w + 80, sheen);
  const kids: SceneNode[] = [
    shapeNode('cta-bg', {
      geometry: rect(CX, CTA.y, w, CTA.h, CTA.h / 2),
      fill: litFill(lighting, colors.ink, { y: CTA.y, height: CTA.h }),
      shadow: elevationShadows(lighting, 'mid', { strength: 0.7 }),
    }),
    label('cta-text', text, x0 + 34, CTA.y - 15, CTA_FONT, colors.light),
    arrow(x0 + w - 44, CTA.y, t),
  ];
  if (sheen > 0 && sheen < 1) {
    kids.push(
      shapeNode('cta-sheen', {
        geometry: rect(CX, CTA.y, w, CTA.h, CTA.h / 2),
        fill: {
          type: 'linear',
          x1: sx - 60,
          y1: CTA.y - CTA.h / 2,
          x2: sx + 60,
          y2: CTA.y + CTA.h / 2,
          stops: [
            { offset: 0, color: withAlpha(colors.light, 0) },
            { offset: 0.5, color: withAlpha(colors.light, 0.18) },
            { offset: 1, color: withAlpha(colors.light, 0) },
          ],
        },
      }),
    );
  }
  return groupNode('cta', kids, {
    transform: {
      x: CX,
      y: CTA.y + 18 * (1 - clamp(p)),
      scale: lerp(0.92, 1, p),
      originX: CX,
      originY: CTA.y,
    },
    opacity: clamp(p * 2.5),
  });
}

/** The arrow on the call to action, nudging forward once as it arrives. */
function arrow(x: number, y: number, t: number): SceneNode {
  const nudge = 5 * Math.sin(Math.PI * progress(t, T.cta + 0.35, 0.5, easing.camera));
  return shapeNode('cta-arrow', {
    geometry: pathGeometry('M-9 0H9M2 -7L9 0L2 7'),
    stroke: { color: colors.light, width: 3, cap: 'round', join: 'round' },
    transform: { x: x + nudge, y },
  });
}

function world(t: number, state: State): SceneNode[] {
  return [
    ...week.world(week.duration, state.week, {
      exit: progress(t, 0, T.exit, easing.exit),
      morph: progress(t, T.morph.start, T.morph.duration),
      sheen: progress(t, T.sheen.start, T.sheen.duration, easing.camera),
    }),
    state.name(t),
    state.tagline(t),
    ...[cta(state, t)].filter((n): n is SceneNode => n !== null),
  ];
}

/**
 * A rush as the report folds into the tile, which lands on a big clap on the
 * home chord; a bell for the name; plucks up the scale for the tagline; a
 * pop and a soft bell for the call to action; a warm pad to the end.
 */
const landed = arrival(T.morph.start, T.morph.duration, easing.camera);
const audio = soundtrack([
  cue(0.05, whoosh(landed - 0.05, { from: 300, to: 3200, peak: 0.85, gain: 0.9 })),
  cue(landed, clap({ big: true, chord: 'home' })),
  cue(landed, thump({ gain: 0.55 })),
  cue(landed + 0.05, pad(T.duration - landed - 0.4, { chord: 'home', attack: 0.3, release: 1.5 })),
  cue(T.name + 0.05, bell({ degree: 4, gain: 0.65 })),
  [0, 2, 4, 7, 9].map((degree, k) =>
    cue(T.tagline + k * 0.07, pluck({ degree, octave: 2, gain: 0.3, pan: (k - 2) * 0.15 })),
  ),
  cue(arrival(T.cta, 0.55, easing.snap), pop({ degree: 7, gain: 0.5 })),
  cue(T.ctaSheen.start + 0.3, bell({ degree: 9, gain: 0.3, pan: 0.3 })),
]);

export default defineSceneComposition({
  ...phoneDefaults,
  fonts: [...phoneDefaults.fonts, ...APPS_FONTS, ...proof.fonts, ...week.fonts, CTA_FONT],
  id: 'query-outro',
  seed: 'query-outro',
  audio,
  title: 'Join the waitlist',
  duration: T.duration,
  background: colors.paper,
  renderer: 'svg',
  setup: () => createState(createCanvasMeasurer()),
  scene: (t, _ctx, state) => ({
    camera: wall.camera(wall.end),
    world: [wall.room, ...world(t, state)],
  }),
});

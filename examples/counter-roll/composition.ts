import {
  createCanvasMeasurer,
  progress,
  rect,
  shapeNode,
  textNode,
  withAlpha,
} from '@html-animation-engine/core';
import {
  backdrop,
  counterRoll,
  defineSceneComposition,
  elevationShadows,
  glowShadows,
  lightSweep,
  litFill,
} from '@html-animation-engine/renderers';
import { exampleDefaults, font, lighting, theme } from '../index.js';
import { bell, changeTimes, clap, cue, pad, soundtrack, tick, whoosh } from '../sounds.js';

const { colors, easing, durations } = theme;
const digits = font('display', 140);
const label = font('body', 30);
const W = exampleDefaults.width;
const H = exampleDefaults.height;

// The stat sits on a lit card.
const card = { x: 640, y: 335, width: 900, height: 380 };
const cardShape = rect(card.x, card.y, card.width, card.height, 36);
const COUNT_END = 0.3 + 1.8;

/** The displayed value (as the counter computes it), for its digit turnovers. */
const value = (t: number) => Math.round(1284930 * progress(t, 0.3, 1.8, easing.enter));
/** Digit ticks that slow down like a slot machine: the 100k digit, then each lower digit as it settles. */
const ticks = [
  ...changeTimes((t) => Math.floor(value(t) / 1e5), 0.3, 1.1),
  ...changeTimes((t) => Math.floor(value(t) / 1e4), 1.1, 1.6),
  ...changeTimes((t) => Math.floor(value(t) / 1e3), 1.6, 1.85),
  ...changeTimes((t) => Math.floor(value(t) / 1e2), 1.85, COUNT_END - 0.05),
];

/** A riser and slowing ticks build to the clap when the count lands. */
const audio = soundtrack([
  cue(0, pad(2.4, { chord: 'lift', attack: 0.5, release: 0.9 })),
  cue(0.3, whoosh(1.75, { from: 300, to: 6500, peak: 0.97, gain: 0.8 })),
  ticks.map((t, i) => cue(t, tick({ degree: i % 5, gain: 0.8 }))),
  // The value lands (every digit stops) at the end of the count.
  cue(COUNT_END, clap({ big: true })),
  cue(COUNT_END - 0.1 + 0.7, bell({ degree: 9, gain: 0.55 })),
]);

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'counter-roll',
  audio,
  title: 'Counter roll-up',
  duration: 3.5,
  background: colors.ink,
  renderer: 'dom',
  setup() {
    return counterRoll({
      id: 'counter',
      from: 0,
      to: 1284930,
      start: 0.3,
      duration: 1.8,
      ease: easing.enter,
      font: digits,
      fill: colors.lime,
      shadow: glowShadows(lighting, colors.lime, { radius: 28, strength: 0.6 }),
      clipPad: 24,
      x: 640,
      y: 220,
      align: 'center',
      separator: ',',
      measurer: createCanvasMeasurer(),
    });
  },
  scene(t, _ctx, counter) {
    // The lime light on the backdrop grows as the count climbs.
    const climb = progress(t, 0.3, 1.8, easing.enter);
    const glint = lightSweep(
      'card-glint',
      cardShape,
      card,
      progress(t, COUNT_END - 0.1, durations.camera, easing.camera),
      { color: colors.light, width: 160, angle: 20, strength: 0.1 },
    );
    return {
      world: [
        backdrop('backdrop', lighting, {
          width: W,
          height: H,
          focus: { x: 640, y: 300 },
          lights: [
            { x: 640, y: 300, radius: 620, color: colors.lime, alpha: 0.03 + 0.05 * climb },
            { x: 1180, y: 680, radius: 520, color: colors.violet, alpha: 0.1 },
          ],
        }),
        shapeNode('card', {
          geometry: cardShape,
          fill: litFill(lighting, colors.surface, card, { sheen: 0.06, shade: 0.25 }),
          stroke: { color: withAlpha(colors.light, 0.06), width: 1 },
          shadow: elevationShadows(lighting, 'high'),
        }),
        ...(glint ? [glint] : []),
        counter(t),
        textNode('label', {
          text: 'frames rendered this year',
          font: label,
          fill: colors.muted,
          align: 'center',
          transform: { x: 640, y: 420 },
        }),
      ],
    };
  },
});

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

const { colors, easing, durations } = theme;
const digits = font('display', 140);
const label = font('body', 30);
const W = exampleDefaults.width;
const H = exampleDefaults.height;

// The stat sits on a lit card.
const card = { x: 640, y: 335, width: 900, height: 380 };
const cardShape = rect(card.x, card.y, card.width, card.height, 36);
const COUNT_END = 0.3 + 1.8;

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'counter-roll',
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

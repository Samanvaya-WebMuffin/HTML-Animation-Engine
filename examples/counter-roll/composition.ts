import { createCanvasMeasurer, textNode } from '@html-animation-engine/core';
import { counterRoll, defineSceneComposition } from '@html-animation-engine/renderers';
import { exampleDefaults, font, theme } from '../index.js';

const { colors, easing } = theme;
const digits = font('display', 140);
const label = font('body', 30);

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
      x: 640,
      y: 220,
      align: 'center',
      separator: ',',
      measurer: createCanvasMeasurer(),
    });
  },
  scene(t, _ctx, counter) {
    return {
      world: [
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

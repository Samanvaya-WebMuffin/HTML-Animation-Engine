import { rect, shapeNode, textNode } from '@html-animation-engine/core';
import { circleReveal, defineSceneComposition, maskReveal } from '@html-animation-engine/renderers';
import { exampleDefaults, font, theme } from '../index.js';

const { colors, easing, durations } = theme;
const headline = font('display', 96);
const caption = font('body', 28);

const wipe = maskReveal({
  id: 'headline-mask',
  x: 640,
  y: 250,
  width: 1100,
  height: 140,
  from: 'left',
  start: 0.3,
  duration: durations.slow,
  ease: easing.wipe,
});
const iris = circleReveal({
  id: 'panel-iris',
  x: 640,
  y: 480,
  radius: Math.hypot(400, 110),
  start: 1.2,
  duration: durations.slow,
  ease: easing.enter,
});

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'mask-reveal',
  title: 'Mask and circle reveal',
  duration: 3.2,
  background: colors.ink,
  renderer: 'svg',
  scene(t) {
    return {
      world: [
        wipe(t, [
          textNode('headline', {
            text: 'Revealed by a mask',
            font: headline,
            fill: colors.paper,
            align: 'center',
            transform: { x: 640, y: 190 },
          }),
        ]),
        iris(t, [
          shapeNode('panel', { geometry: rect(640, 480, 800, 220, 28), fill: colors.blue }),
          textNode('caption', {
            text: 'and a circle iris',
            font: caption,
            fill: colors.paper,
            align: 'center',
            transform: { x: 640, y: 463 },
          }),
        ]),
      ],
    };
  },
});

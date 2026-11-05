import { circle, pathGeometry, pill, rect } from '@html-animation-engine/core';
import { defineSceneComposition, shapeMorph } from '@html-animation-engine/renderers';
import { exampleDefaults, theme } from '../index.js';

const { colors, easing } = theme;
const STAR = 'M0 -150 L35 -48 L143 -46 L57 19 L88 121 L0 60 L-88 121 L-57 19 L-143 -46 L-35 -48 Z';

const shape = shapeMorph({
  id: 'shifter',
  x: 640,
  y: 360,
  keys: [
    { at: 0.3, shape: rect(0, 0, 220, 220, 0), fill: colors.lime },
    { at: 1.0, shape: pill(0, 0, 460, 120), fill: colors.pink, ease: easing.snap },
    { at: 2.0, shape: circle(0, 0, 120), fill: colors.blue, ease: easing.snap },
    { at: 3.0, shape: pathGeometry(STAR), fill: colors.orange, rotation: 0, ease: easing.enter },
    {
      at: 4.0,
      shape: rect(0, 0, 260, 260, 48),
      fill: colors.violet,
      rotation: 90,
      ease: easing.snap,
    },
  ],
});

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'shape-morph',
  title: 'Shape morph',
  duration: 5.5,
  background: colors.ink,
  renderer: 'svg',
  scene(t) {
    return { world: [shape(t)] };
  },
});

import { defineSceneComposition, pathDraw } from '@html-animation-engine/renderers';
import { exampleDefaults, theme } from '../index.js';

const { colors, easing } = theme;

const swoosh = pathDraw({
  id: 'swoosh',
  d: 'M-420 60 C-300 -120 -160 160 -40 0 S180 -150 260 20 Q330 140 420 -40',
  x: 640,
  y: 320,
  color: colors.lime,
  width: 14,
  start: 0.3,
  duration: 1.4,
  ease: easing.camera,
});
const underline = pathDraw({
  id: 'underline',
  d: 'M-300 0 H300',
  x: 640,
  y: 470,
  color: colors.pink,
  width: 8,
  start: 1.4,
  duration: 0.6,
  ease: easing.enter,
});
const ring = pathDraw({
  id: 'ring',
  d: 'M0 -60 A60 60 0 1 1 -0.01 -60',
  x: 1080,
  y: 540,
  color: colors.blue,
  width: 10,
  start: 0.8,
  duration: 1.2,
  ease: easing.enter,
});

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'path-draw',
  title: 'Path draw',
  duration: 3.5,
  background: colors.ink,
  renderer: 'svg',
  scene(t) {
    return { world: [swoosh(t), underline(t), ring(t)] };
  },
});

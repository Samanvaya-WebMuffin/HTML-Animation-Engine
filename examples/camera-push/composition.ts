import { circle, rect, shapeNode, textNode } from '@html-animation-engine/core';
import { cameraPath, defineSceneComposition } from '@html-animation-engine/renderers';
import { exampleDefaults, font, theme } from '../index.js';

const { colors, easing } = theme;
const W = 1280;
const H = 720;

const wide = { x: W / 2, y: H / 2, zoom: 1, rotation: 0 };
const close = { x: 900, y: 260, zoom: 3, rotation: -4 };
const camera = cameraPath([
  { at: 0.4, value: wide },
  { at: 1.8, value: close, ease: easing.camera }, // push in
  { at: 3.4, value: close }, // hold
  { at: 4.8, value: wide, ease: easing.camera }, // pull back
]);

const world = [
  shapeNode('floor', { geometry: rect(640, 360, 1180, 620, 32), fill: colors.surface }),
  shapeNode('a', { geometry: rect(320, 470, 300, 180, 24), fill: colors.blue }),
  shapeNode('b', { geometry: circle(620, 300, 90), fill: colors.pink }),
  shapeNode('target', { geometry: rect(900, 260, 180, 110, 20), fill: colors.lime }),
  textNode('target-label', {
    text: 'detail',
    font: font('display', 30),
    fill: colors.ink,
    align: 'center',
    transform: { x: 900, y: 240 },
  }),
  shapeNode('c', { geometry: rect(1000, 520, 240, 120, 60), fill: colors.orange }),
];

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'camera-push',
  title: 'Camera push-in and pull-back',
  duration: 5.5,
  background: colors.ink,
  renderer: 'canvas',
  scene(t) {
    return {
      camera: camera(t),
      world,
      // Screen-pinned: stays put while the camera moves.
      screen: [
        textNode('title', {
          text: 'Camera: push in, hold, pull back',
          font: font('body', 26),
          fill: colors.paper,
          transform: { x: 48, y: 36 },
        }),
      ],
    };
  },
});

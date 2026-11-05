import { mixColors, vec3, type OrbitOptions } from '@html-animation-engine/core';
import { defineSceneComposition, slab3d } from '@html-animation-engine/renderers';
import { exampleDefaults, theme } from '../index.js';

const { colors, easing } = theme;
const target = vec3(0, 0, 0);
const orbit = (distance: number, azimuth = 0, elevation = 14): OrbitOptions => ({
  target,
  distance,
  azimuth,
  elevation,
  fov: 40,
});

const slab = slab3d({
  id: 'slab',
  viewport: { width: 1280, height: 720 },
  width: 420,
  height: 260,
  depth: 36,
  face: colors.lime,
  back: colors.pink,
  // Edges a darker lime, so the slab's thickness reads against the dark background.
  edge: mixColors(colors.lime, colors.ink, 0.45),
  plate: { color: colors.paper, inset: 44 },
  rotation: [
    { at: 0, value: { rotateX: -14, rotateY: -28, rotateZ: 0 } },
    { at: 0.6, value: { rotateX: -14, rotateY: -28, rotateZ: 0 } }, // hold the front first
    { at: 1.6, value: { rotateX: 8, rotateY: 200, rotateZ: 0 }, ease: easing.snap }, // spin to the back
    { at: 2.8, value: { rotateX: 8, rotateY: 200, rotateZ: 0 } }, // hold
    { at: 4.0, value: { rotateX: -18, rotateY: 330, rotateZ: -6 }, ease: easing.snap }, // spin round
    { at: 5.6, value: { rotateX: -10, rotateY: 338, rotateZ: 0 }, ease: easing.camera }, // settle
  ],
  camera: [
    { at: 0, value: orbit(1500) },
    { at: 1.6, value: orbit(780, 10, 10), ease: easing.camera }, // zoom in
    { at: 2.8, value: orbit(740, 12, 10) },
    { at: 4.2, value: orbit(1750, -8, 24), ease: easing.camera }, // zoom out
    { at: 5.6, value: orbit(1150, 0, 16), ease: easing.camera }, // settle
  ],
});

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'slab-rotate',
  title: '3D slab rotating with zooms',
  duration: 6.5,
  background: colors.ink,
  renderer: 'svg',
  scene(t) {
    return { world: [slab(t)] };
  },
});

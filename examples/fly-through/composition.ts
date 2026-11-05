import { defineSceneComposition, flyThrough } from '@html-animation-engine/renderers';
import { exampleDefaults, theme } from '../index.js';

const { colors } = theme;

const flight = flyThrough({
  id: 'flight',
  viewport: { width: 1280, height: 720 },
  seed: 'flight',
  count: 70,
  field: { width: 1600, height: 1000, length: 3200 },
  clearance: 170,
  size: [60, 160],
  palette: [colors.lime, colors.pink, colors.blue, colors.orange, colors.violet],
  loopDuration: 6,
  fog: { color: colors.ink, near: 600, far: 3000 },
  fov: 62,
});

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'fly-through',
  title: 'Flying past 3D objects',
  duration: 6,
  background: colors.ink,
  renderer: 'canvas',
  scene(t) {
    return { world: [flight(t)] };
  },
});

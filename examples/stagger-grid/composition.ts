import { defineSceneComposition, staggerGrid } from '@html-animation-engine/renderers';
import { exampleDefaults, theme } from '../index.js';

const { colors, easing } = theme;

const grid = staggerGrid({
  id: 'tiles',
  x: 640,
  y: 360,
  cols: 9,
  rows: 5,
  cell: 96,
  gap: 16,
  radius: 18,
  colors: [colors.lime, colors.pink, colors.blue, colors.orange, colors.violet],
  start: 0.2,
  each: 0.12,
  duration: 0.5,
  ease: easing.snap,
  from: 'center',
});

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'stagger-grid',
  title: 'Stagger grid',
  duration: 2.8,
  background: colors.ink,
  renderer: 'dom',
  scene(t) {
    return { world: [grid(t)] };
  },
});

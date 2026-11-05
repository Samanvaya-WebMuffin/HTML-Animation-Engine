import { defineSceneComposition, dotGrid } from '@html-animation-engine/renderers';
import { exampleDefaults, theme } from '../index.js';

const { colors } = theme;

const grid = dotGrid({
  id: 'dots',
  x: 640,
  y: 360,
  cols: 25,
  rows: 14,
  spacing: 48,
  radius: 4,
  color: colors.surface,
  accent: colors.lime,
  origin: { x: 640, y: 360 },
  wavelength: 420,
  amplitude: 1.1,
  period: 2,
});

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'dot-grid',
  title: 'Dot grid ripple',
  duration: 4,
  background: colors.ink,
  renderer: 'canvas',
  scene(t) {
    return { world: [grid(t)] };
  },
});

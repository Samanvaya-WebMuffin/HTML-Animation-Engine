import { mod } from '@html-animation-engine/core';
import { backdrop, defineSceneComposition, dotGrid } from '@html-animation-engine/renderers';
import { exampleDefaults, lighting, theme } from '../index.js';

const { colors } = theme;
const W = exampleDefaults.width;
const H = exampleDefaults.height;
const PERIOD = 2;
const ORIGIN = { x: 640, y: 360 };

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
  origin: ORIGIN,
  wavelength: 420,
  amplitude: 1.1,
  period: PERIOD,
  glow: 9,
});

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'dot-grid',
  title: 'Dot grid ripple',
  duration: 4,
  background: colors.ink,
  renderer: 'canvas',
  scene(t) {
    // A soft lime pool at the source breathes with the wave: brightest as a
    // crest leaves the centre, and looping exactly with it.
    const phase = mod(t, PERIOD) / PERIOD;
    const pulse = (0.5 + 0.5 * Math.cos(2 * Math.PI * phase)) ** 2;
    const sky = backdrop('backdrop', lighting, {
      width: W,
      height: H,
      focus: ORIGIN,
      lights: [
        { x: ORIGIN.x, y: ORIGIN.y, radius: 520, color: colors.lime, alpha: 0.05 + 0.06 * pulse },
      ],
    });
    return { world: [sky, grid(t)] };
  },
});

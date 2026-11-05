import { clamp, lerp, progress, rect } from '@html-animation-engine/core';
import {
  backdrop,
  defineSceneComposition,
  elevationShadows,
  lightSweep,
  litFill,
  staggerGrid,
} from '@html-animation-engine/renderers';
import { exampleDefaults, lighting, theme } from '../index.js';

const { colors, easing } = theme;
const W = exampleDefaults.width;
const H = exampleDefaults.height;
const CELL = 96;
const RADIUS = 18;
const GRID_LEFT = 640 - 4 * (CELL + 16);
const GRID_WIDTH = 8 * (CELL + 16);
const tile = rect(0, 0, CELL, CELL, RADIUS);
const tileBox = { x: 0, y: 0, width: CELL, height: CELL };

const grid = staggerGrid({
  id: 'tiles',
  x: 640,
  y: 360,
  cols: 9,
  rows: 5,
  cell: CELL,
  gap: 16,
  radius: RADIUS,
  colors: [colors.lime, colors.pink, colors.blue, colors.orange, colors.violet],
  start: 0.2,
  each: 0.12,
  duration: 0.5,
  ease: easing.snap,
  from: 'center',
  paint: (color) => litFill(lighting, color, tileBox),
  // Tiles pop up from the page: a high, soft shadow that tightens as they land.
  shadow: (p) => elevationShadows(lighting, 'low', { lift: lerp(3, 1, clamp(p)) }),
  // Once every tile has landed, one band of light crosses the whole grid.
  overlay: (i, t, { x }) =>
    lightSweep(
      `sweep-${i}`,
      tile,
      tileBox,
      progress(t, 1.45 + ((x - GRID_LEFT) / GRID_WIDTH) * 0.45, 0.4, easing.linear),
      { color: colors.light, width: 64, angle: 20, strength: 0.32 },
    ),
});

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'stagger-grid',
  title: 'Stagger grid',
  duration: 2.8,
  background: colors.ink,
  renderer: 'dom',
  scene(t) {
    // Two coloured pools drift slowly behind the grid.
    const drift = t / 2.8;
    return {
      world: [
        backdrop('backdrop', lighting, {
          width: W,
          height: H,
          lights: [
            { x: lerp(260, 380, drift), y: 200, radius: 520, color: colors.violet, alpha: 0.16 },
            { x: lerp(1040, 920, drift), y: 560, radius: 520, color: colors.blue, alpha: 0.12 },
          ],
        }),
        grid(t),
      ],
    };
  },
});

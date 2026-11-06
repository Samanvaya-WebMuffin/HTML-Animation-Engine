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
import { arrival, clap, cue, pad, pluck, snap, soundtrack, whoosh } from '../sounds.js';

const { colors, easing } = theme;
const W = exampleDefaults.width;
const H = exampleDefaults.height;
const CELL = 96;
const RADIUS = 18;
const GRID_LEFT = 640 - 4 * (CELL + 16);
const GRID_WIDTH = 8 * (CELL + 16);
const tile = rect(0, 0, CELL, CELL, RADIUS);
const tileBox = { x: 0, y: 0, width: CELL, height: CELL };

/** Grid layout and timing, shared with the soundtrack. */
const GRID = { cols: 9, rows: 5, start: 0.2, each: 0.12, duration: 0.5 } as const;

const grid = staggerGrid({
  id: 'tiles',
  x: 640,
  y: 360,
  cols: GRID.cols,
  rows: GRID.rows,
  cell: CELL,
  gap: 16,
  radius: RADIUS,
  colors: [colors.lime, colors.pink, colors.blue, colors.orange, colors.violet],
  start: GRID.start,
  each: GRID.each,
  duration: GRID.duration,
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

/** Tiles land in rings, centre outwards (distance from the centre cell, as the grid computes it). */
const RINGS = [
  ...new Set(
    Array.from({ length: GRID.cols * GRID.rows }, (_, i) =>
      Math.hypot(
        (i % GRID.cols) - (GRID.cols - 1) / 2,
        Math.floor(i / GRID.cols) - (GRID.rows - 1) / 2,
      ),
    ),
  ),
].sort((a, b) => a - b);

/** A rising pentatonic run, one note per ring (snaps on every other), a clap for the corners, then the sweep. */
const audio = soundtrack([
  cue(0, pad(1.6, { chord: 'lift', attack: 0.3, release: 1 })),
  RINGS.map((d, i) => {
    const land = arrival(GRID.start + d * GRID.each, GRID.duration, easing.snap);
    if (i === RINGS.length - 1) return cue(land, clap({ chord: 'lift' }));
    return [
      cue(land, pluck({ degree: i, octave: 1, gain: 0.4, decay: 0.4 })),
      ...(i % 2 === 0 ? [cue(land, snap({ degree: i, take: i / 2, gain: 0.5 }))] : []),
    ];
  }),
  cue(1.45, whoosh(0.85, { from: 1500, to: 6500, peak: 0.5, gain: 0.8 })),
]);

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'stagger-grid',
  audio,
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

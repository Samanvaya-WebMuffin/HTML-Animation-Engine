import { clamp, progress } from '@html-animation-engine/core';
import {
  backdrop,
  confetti,
  defineSceneComposition,
  particleBurst,
} from '@html-animation-engine/renderers';
import { exampleDefaults, lighting, theme } from '../index.js';

const { colors, easing } = theme;
const palette = [colors.lime, colors.pink, colors.blue, colors.orange, colors.violet];
const W = exampleDefaults.width;
const H = exampleDefaults.height;
const BURST = { x: 640, y: 330, start: 0.3 };

const burst = particleBurst({
  id: 'burst',
  seed: 'burst',
  x: BURST.x,
  y: BURST.y,
  start: BURST.start,
  count: 90,
  colors: palette,
  speed: [250, 900],
  gravity: 500,
  drag: 2.2,
  life: [0.9, 1.5],
  size: [6, 14],
  light: { core: colors.light },
});
const paper = { core: colors.light, shade: colors.shade };
const left = confetti({
  id: 'confetti-left',
  seed: 'left',
  x: 80,
  y: 720,
  start: 1.1,
  count: 70,
  colors: palette,
  speed: [900, 1500],
  direction: -60,
  spread: 40,
  size: [10, 18],
  stagger: 0.15,
  light: paper,
});
const right = confetti({
  id: 'confetti-right',
  seed: 'right',
  x: 1200,
  y: 720,
  start: 1.1,
  count: 70,
  colors: palette,
  speed: [900, 1500],
  direction: -120,
  spread: 40,
  size: [10, 18],
  stagger: 0.15,
  light: paper,
});

/** The burst's light on the backdrop: a quick swell, then a slow fade (no hard flash). */
function bloom(t: number): number {
  const swell = progress(t, BURST.start, 0.18, easing.enter);
  const fade = progress(t, BURST.start + 0.18, 1.4, easing.enter);
  return clamp(swell * (1 - fade));
}

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'particle-burst',
  title: 'Particle burst and confetti',
  duration: 4,
  background: colors.ink,
  renderer: 'canvas',
  scene(t) {
    const glow = bloom(t);
    const sky = backdrop('backdrop', lighting, {
      width: W,
      height: H,
      focus: { x: BURST.x, y: BURST.y },
      lights: [
        { x: BURST.x, y: BURST.y, radius: 460, color: colors.violet, alpha: 0.24 * glow },
        { x: BURST.x, y: BURST.y, radius: 180, color: colors.paper, alpha: 0.1 * glow },
        // The confetti cannons light the lower corners as they fire.
        ...[80, 1200].map((x) => ({
          x,
          y: H,
          radius: 380,
          color: x < W / 2 ? colors.violet : colors.pink,
          alpha: 0.11 * progress(t, 1.05, 0.5, easing.enter),
        })),
      ],
    });
    return { world: [sky, burst(t), left(t), right(t)] };
  },
});

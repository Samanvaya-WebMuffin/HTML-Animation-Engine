import { confetti, defineSceneComposition, particleBurst } from '@html-animation-engine/renderers';
import { exampleDefaults, theme } from '../index.js';

const { colors } = theme;
const palette = [colors.lime, colors.pink, colors.blue, colors.orange, colors.violet];

const burst = particleBurst({
  id: 'burst',
  seed: 'burst',
  x: 640,
  y: 330,
  start: 0.3,
  count: 90,
  colors: palette,
  speed: [250, 900],
  gravity: 500,
  drag: 2.2,
  life: [0.9, 1.5],
  size: [6, 14],
});
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
});

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'particle-burst',
  title: 'Particle burst and confetti',
  duration: 4,
  background: colors.ink,
  renderer: 'canvas',
  scene(t) {
    return { world: [burst(t), left(t), right(t)] };
  },
});

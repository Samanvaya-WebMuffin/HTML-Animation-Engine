import { progress, rect, textNode } from '@html-animation-engine/core';
import {
  backdrop,
  defineSceneComposition,
  elevationShadows,
  landingShadow,
  lightSweep,
  litFill,
} from '@html-animation-engine/renderers';
import { exampleDefaults, font, lighting, theme } from '../index.js';

const { colors, easing, durations } = theme;
const label = font('display', 40);
const W = exampleDefaults.width;
const H = exampleDefaults.height;
const card = rect(0, 0, 240, 300, 20);
const bounds = { x: 0, y: 0, width: 240, height: 300 };

const specs = [
  { word: 'Snap', fill: colors.lime, x: 340 },
  { word: 'Settle', fill: colors.pink, x: 640 },
  { word: 'Hold', fill: colors.blue, x: 940 },
].map((spec, i) => ({ ...spec, start: 0.3 + i * durations.stagger * 3 }));

const cards = specs.map((spec, i) =>
  landingShadow({
    id: `card-${i}`,
    geometry: card,
    fill: litFill(lighting, spec.fill, bounds),
    shadowColor: colors.paper,
    x: spec.x,
    y: 360,
    shadow: { x: 14, y: 14 },
    // Lifted, the card casts a wide soft shadow; landed, a tight one.
    ambient: (height) => elevationShadows(lighting, 'mid', { lift: 0.6 + height * 1.4 }),
    start: spec.start,
    duration: 0.6,
    ease: easing.snap,
    content: (t) => {
      // A glint crosses the card just after it lands.
      const glint = lightSweep(
        `card-${i}-glint`,
        card,
        bounds,
        progress(t, spec.start + 0.45, durations.slow, easing.camera),
        { color: colors.light, width: 90, angle: 25, strength: 0.4 },
      );
      return [
        ...(glint ? [glint] : []),
        textNode(`card-${i}-label`, {
          text: spec.word,
          font: label,
          fill: colors.ink,
          align: 'center',
          transform: { x: 0, y: -24 },
        }),
      ];
    },
  }),
);

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'landing-shadow',
  title: 'Landing with a hard shadow',
  duration: 3,
  background: colors.ink,
  renderer: 'dom',
  scene(t) {
    // Each card throws a faint pool of its own colour onto the backdrop once it lands.
    const lights = specs.map((spec) => ({
      x: spec.x,
      y: 380,
      radius: 260,
      color: spec.fill,
      alpha: 0.22 * progress(t, spec.start + 0.2, durations.slow, easing.enter),
    }));
    return {
      world: [
        backdrop('backdrop', lighting, { width: W, height: H, lights }),
        ...cards.map((c) => c(t)),
      ],
    };
  },
});

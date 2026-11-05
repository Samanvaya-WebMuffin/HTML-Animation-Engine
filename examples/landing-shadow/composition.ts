import { rect, textNode } from '@html-animation-engine/core';
import { defineSceneComposition, landingShadow } from '@html-animation-engine/renderers';
import { exampleDefaults, font, theme } from '../index.js';

const { colors, easing, durations } = theme;
const label = font('display', 40);

const cards = [
  { word: 'Snap', fill: colors.lime, x: 340 },
  { word: 'Settle', fill: colors.pink, x: 640 },
  { word: 'Hold', fill: colors.blue, x: 940 },
].map((card, i) =>
  landingShadow({
    id: `card-${i}`,
    geometry: rect(0, 0, 240, 300, 20),
    fill: card.fill,
    shadowColor: colors.paper,
    x: card.x,
    y: 360,
    shadow: { x: 14, y: 14 },
    start: 0.3 + i * durations.stagger * 3,
    duration: 0.6,
    ease: easing.snap,
    content: [
      textNode(`card-${i}-label`, {
        text: card.word,
        font: label,
        fill: colors.ink,
        align: 'center',
        transform: { x: 0, y: -24 },
      }),
    ],
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
    return { world: cards.map((card) => card(t)) };
  },
});

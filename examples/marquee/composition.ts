import { createCanvasMeasurer } from '@html-animation-engine/core';
import { defineSceneComposition, marquee } from '@html-animation-engine/renderers';
import { exampleDefaults, font, theme } from '../index.js';

const { colors } = theme;
const big = font('display', 96);
const small = font('body', 36);

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'marquee',
  title: 'Marquee',
  duration: 4,
  background: colors.ink,
  renderer: 'dom',
  setup() {
    const measurer = createCanvasMeasurer();
    return {
      top: marquee({
        id: 'top',
        text: 'SNAP • SETTLE • HOLD •',
        font: big,
        fill: colors.lime,
        y: 220,
        width: 1280,
        gap: measurer.measure(' ', big), // repeats sit one space apart
        speed: 220,
        loopDuration: 4,
        measurer,
      }),
      bottom: marquee({
        id: 'bottom',
        text: 'pure function of time — seeded — repeatable —',
        font: small,
        fill: colors.muted,
        y: 400,
        width: 1280,
        gap: measurer.measure(' ', small),
        speed: 120,
        loopDuration: 4,
        direction: 'right',
        measurer,
      }),
    };
  },
  scene(t, _ctx, { top, bottom }) {
    return { world: [top(t), bottom(t)] };
  },
});

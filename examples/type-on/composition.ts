import { createCanvasMeasurer, layoutText } from '@html-animation-engine/core';
import { defineSceneComposition, typeOn } from '@html-animation-engine/renderers';
import { exampleDefaults, font, theme } from '../index.js';

const { colors } = theme;
const type = font('display', 56);
const TEXT = 'Every frame is a function of time.';

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'type-on',
  title: 'Type-on with caret',
  duration: 4.5,
  background: colors.ink,
  renderer: 'canvas',
  setup() {
    const measurer = createCanvasMeasurer();
    const width = layoutText(TEXT, type, { measurer }).width;
    return typeOn({
      id: 'typed',
      text: TEXT,
      font: type,
      fill: colors.paper,
      x: 640 - width / 2,
      y: 326,
      start: 0.4,
      charsPerSecond: 22,
      seed: 7,
      caret: { color: colors.lime, blinkRate: 1 },
      measurer,
    });
  },
  scene(t, _ctx, typed) {
    return { world: [typed(t)] };
  },
});

import { createCanvasMeasurer, layoutText, textNode } from '@html-animation-engine/core';
import { defineSceneComposition, highlighterWipe } from '@html-animation-engine/renderers';
import { exampleDefaults, font, theme } from '../index.js';

const { colors, easing, durations } = theme;
const title = font('display', 88);
const LINE = 'Make the key word';
const WORD = 'pop';

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'highlighter-wipe',
  title: 'Highlighter wipe',
  duration: 3,
  background: colors.paper,
  renderer: 'dom',
  setup() {
    const measurer = createCanvasMeasurer();
    const lead = layoutText(LINE, title, { measurer, align: 'center' });
    const word = layoutText(WORD, title, { measurer, align: 'center' });
    const lineHeight = lead.lineHeight;
    const wordY = 360;
    return {
      lead,
      wordY,
      highlight: highlighterWipe({
        id: 'highlight',
        x: 640,
        y: wordY + lineHeight * 0.55,
        width: word.width + 48,
        height: lineHeight * 0.62,
        color: colors.lime,
        start: 0.5,
        duration: durations.base,
        ease: easing.wipe,
      }),
    };
  },
  scene(t, _ctx, { lead, wordY, highlight }) {
    return {
      world: [
        textNode('lead', {
          text: LINE,
          font: title,
          fill: colors.ink,
          align: 'center',
          transform: { x: 640, y: wordY - lead.height - 8 },
        }),
        highlight(t),
        textNode('word', {
          text: WORD,
          font: title,
          fill: colors.ink,
          align: 'center',
          transform: { x: 640, y: wordY },
        }),
      ],
    };
  },
});

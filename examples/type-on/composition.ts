import {
  createCanvasMeasurer,
  layoutText,
  linearGradient,
  rect,
  shapeNode,
  withAlpha,
  type RectGeometry,
} from '@html-animation-engine/core';
import {
  backdrop,
  defineSceneComposition,
  elevationShadows,
  glowShadows,
  typeOn,
} from '@html-animation-engine/renderers';
import { exampleDefaults, font, lighting, theme } from '../index.js';

const { colors } = theme;
const type = font('display', 56);
const TEXT = 'Every frame is a function of time.';
const W = exampleDefaults.width;
const H = exampleDefaults.height;

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
      shadow: elevationShadows(lighting, 'low', { strength: 1.4 }),
      x: 640 - width / 2,
      y: 326,
      start: 0.4,
      charsPerSecond: 22,
      seed: 7,
      caret: {
        color: colors.lime,
        blinkRate: 1,
        glow: glowShadows(lighting, colors.lime, { radius: 26, strength: 1.4 }),
      },
      measurer,
    });
  },
  scene(t, _ctx, typed) {
    const line = typed(t);
    // A faint lime light rides along with the caret.
    const caret = line.children.find((node) => node.id === 'typed-caret');
    const caretX = caret?.type === 'shape' ? (caret.geometry as RectGeometry).x : W / 2;
    return {
      world: [
        backdrop('backdrop', lighting, {
          width: W,
          height: H,
          focus: { x: W / 2, y: 340 },
          lights: [
            { x: caretX, y: 356, radius: 340, color: colors.lime, alpha: 0.09 },
            { x: 160, y: 40, radius: 560, color: colors.blue, alpha: 0.08 },
          ],
        }),
        // A hairline under the text that fades out at both ends.
        shapeNode('rule', {
          geometry: rect(W / 2, 432, 900, 1),
          fill: linearGradient(W / 2 - 450, 0, W / 2 + 450, 0, [
            withAlpha(colors.light, 0),
            withAlpha(colors.light, 0.18),
            withAlpha(colors.light, 0),
          ]),
        }),
        line,
      ],
    };
  },
});

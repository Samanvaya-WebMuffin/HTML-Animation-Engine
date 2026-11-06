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
  typeOnTimes,
} from '@html-animation-engine/renderers';
import { exampleDefaults, font, lighting, theme } from '../index.js';
import { cue, key, pad, pluck, snap, soundtrack } from '../sounds.js';

const { colors } = theme;
const type = font('display', 56);
const TEXT = 'Every frame is a function of time.';
const W = exampleDefaults.width;
const H = exampleDefaults.height;
/** What is typed and when (shared with the soundtrack's key clicks). */
const TYPING = { id: 'typed', text: TEXT, start: 0.4, charsPerSecond: 22, seed: 7 } as const;

/** One key click per character (softer for spaces); the full stop lands with a snap. */
const KEYS = typeOnTimes(TYPING);
const audio = soundtrack([
  cue(0, pad(3.2, { attack: 0.6, release: 1.2, gain: 0.85 })),
  KEYS.slice(0, -1).map((t, i) =>
    cue(
      t,
      key({
        degree: i % 3,
        take: i,
        gain: TEXT[i] === ' ' ? 0.45 : 1,
        pan: (i / KEYS.length - 0.5) * 0.6,
      }),
    ),
  ),
  cue(KEYS.at(-1) ?? 0, snap({ degree: 4, pan: 0.3 })),
  cue(KEYS.at(-1) ?? 0, pluck({ degree: 7, octave: 1, gain: 0.7, pan: 0.3 })),
]);

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'type-on',
  audio,
  title: 'Type-on with caret',
  duration: 4.5,
  background: colors.ink,
  renderer: 'canvas',
  setup() {
    const measurer = createCanvasMeasurer();
    const width = layoutText(TEXT, type, { measurer }).width;
    return typeOn({
      ...TYPING,
      font: type,
      fill: colors.paper,
      shadow: elevationShadows(lighting, 'low', { strength: 1.4 }),
      x: 640 - width / 2,
      y: 326,
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

import {
  createCanvasMeasurer,
  groupNode,
  layoutText,
  linearGradient,
  mixColors,
  progress,
  rect,
  textNode,
} from '@html-animation-engine/core';
import {
  backdrop,
  defineSceneComposition,
  elevationShadows,
  glowShadows,
  highlighterWipe,
  lightSweep,
} from '@html-animation-engine/renderers';
import { exampleDefaults, font, lighting, theme } from '../index.js';
import { arrival, bell, cue, pad, snap, soundtrack, whoosh } from '../sounds.js';

const { colors, easing, durations } = theme;
const title = font('display', 88);
const LINE = 'Make the key word';
const WORD = 'pop';
const W = exampleDefaults.width;
const H = exampleDefaults.height;
const TILT = -1.5;
const WIPE_START = 0.5;

// Paper lit from above: a brighter centre that falls off to a warm grey edge.
const paperLight = mixColors(colors.paper, colors.light, 0.55);
const paperEdge = mixColors(colors.paper, colors.ink, 0.14);
// Shadows on paper are faint and warm-grey rather than black.
const inkLift = elevationShadows(lighting, 'low', { strength: 0.35 });

/** The marker drawn across with a swish; the word pops with a snap; a bell on the sheen. */
const audio = soundtrack([
  cue(0, pad(1.9, { chord: 'lift', attack: 0.4, release: 1 })),
  cue(WIPE_START, whoosh(durations.base, { from: 1400, to: 5200, peak: 0.55 })),
  cue(arrival(WIPE_START, durations.base, easing.wipe, 0.99), snap({ degree: 4 })),
  cue(WIPE_START + durations.base + 0.1 + durations.slow / 2, bell({ degree: 9, gain: 0.6 })),
]);

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'highlighter-wipe',
  audio,
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
    const box = {
      x: 640,
      y: wordY + lineHeight * 0.55,
      width: word.width + 48,
      height: lineHeight * 0.62,
    };
    // Marker ink: denser along the bottom edge, as a real highlighter pools.
    const ink = linearGradient(0, -box.height / 2, 0, box.height / 2, [
      mixColors(colors.lime, colors.light, 0.25),
      colors.lime,
      mixColors(colors.lime, colors.ink, 0.08),
    ]);
    return {
      lead,
      wordY,
      box,
      highlight: highlighterWipe({
        id: 'highlight',
        ...box,
        color: colors.lime,
        fill: ink,
        shadow: glowShadows(lighting, colors.lime, { radius: 26, strength: 0.6 }),
        tilt: TILT,
        start: WIPE_START,
        duration: durations.base,
        ease: easing.wipe,
      }),
    };
  },
  scene(t, _ctx, { lead, wordY, box, highlight }) {
    // Once the stroke is down, a soft sheen runs along it.
    const stroke = rect(0, 0, box.width, box.height, 4);
    const sheen = lightSweep(
      'highlight-sheen',
      stroke,
      { x: 0, y: 0, width: box.width, height: box.height },
      progress(t, WIPE_START + durations.base + 0.1, durations.slow, easing.camera),
      { color: colors.light, width: 70, angle: 15, strength: 0.55 },
    );
    return {
      world: [
        backdrop('backdrop', lighting, {
          width: W,
          height: H,
          centre: paperLight,
          edge: paperEdge,
          focus: { x: W / 2, y: 300 },
        }),
        textNode('lead', {
          text: LINE,
          font: title,
          fill: colors.ink,
          align: 'center',
          shadow: inkLift,
          transform: { x: 640, y: wordY - lead.height - 8 },
        }),
        highlight(t),
        ...(sheen
          ? [groupNode('sheen', [sheen], { transform: { x: box.x, y: box.y, rotation: TILT } })]
          : []),
        textNode('word', {
          text: WORD,
          font: title,
          fill: colors.ink,
          align: 'center',
          shadow: inkLift,
          transform: { x: 640, y: wordY },
        }),
      ],
    };
  },
});

import {
  createCanvasMeasurer,
  linearGradient,
  mod,
  rect,
  shapeNode,
  withAlpha,
} from '@html-animation-engine/core';
import {
  backdrop,
  defineSceneComposition,
  elevationShadows,
  glowShadows,
  litFill,
  marquee,
} from '@html-animation-engine/renderers';
import { exampleDefaults, font, lighting, theme } from '../index.js';
import { clap, cue, pad, snap, soundtrack, thump, tick } from '../sounds.js';

const { colors } = theme;
const big = font('display', 96);
const small = font('body', 36);
const W = exampleDefaults.width;
const H = exampleDefaults.height;
const LOOP = 4;

// The top line runs on a lit band, like a ticker tape.
const bigLine = big.size * (big.lineHeight ?? 1.2);
const band = { x: W / 2, y: 220 + bigLine / 2, width: W + 40, height: bigLine + 56 };

/** Fades the frame edges into the backdrop, so text slides in and out of darkness. */
function edgeFade(id: string, side: 'left' | 'right') {
  const x = side === 'left' ? 0 : W;
  const inner = side === 'left' ? 220 : W - 220;
  return shapeNode(id, {
    geometry: rect((x + inner) / 2, H / 2, 220, H),
    fill: linearGradient(x, 0, inner, 0, [
      lighting.backdrop.edge,
      withAlpha(lighting.backdrop.edge, 0),
    ]),
  });
}

/** A steady 120 BPM groove that loops with the ticker: kick on the beat, snaps on the backbeat, a clap to turn over. */
const BEAT = 0.5;
const audio = soundtrack([
  cue(0, pad(LOOP - 1, { chord: 'lift', attack: 0.3, release: 1 })),
  Array.from({ length: LOOP / BEAT }, (_, i) => {
    const t = i * BEAT;
    if (i % 2 === 0) return cue(t, thump({ gain: 0.7 }));
    return cue(
      t,
      i === LOOP / BEAT - 1
        ? clap({ chord: 'home' })
        : snap({ degree: [2, 4, 1][(i - 1) / 2] ?? 0, take: i, gain: 0.8 }),
    );
  }),
  Array.from({ length: LOOP / BEAT }, (_, i) =>
    cue(i * BEAT + BEAT / 2, tick({ degree: 4, gain: 0.5 })),
  ),
]);

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'marquee',
  audio,
  title: 'Marquee',
  duration: LOOP,
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
        shadow: glowShadows(lighting, colors.lime, { radius: 30, strength: 0.7 }),
        y: 220,
        width: 1280,
        gap: measurer.measure(' ', big), // repeats sit one space apart
        speed: 220,
        loopDuration: LOOP,
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
        loopDuration: LOOP,
        direction: 'right',
        measurer,
      }),
    };
  },
  scene(t, _ctx, { top, bottom }) {
    // Light pools drift once around a circle per loop, so the loop stays seamless.
    const a = (mod(t, LOOP) / LOOP) * Math.PI * 2;
    return {
      world: [
        backdrop('backdrop', lighting, {
          width: W,
          height: H,
          focus: { x: W / 2, y: 300 },
          lights: [
            {
              x: 420 + Math.cos(a) * 80,
              y: 280 + Math.sin(a) * 30,
              radius: 520,
              color: colors.lime,
              alpha: 0.08,
            },
            {
              x: 980 - Math.cos(a) * 80,
              y: 520 - Math.sin(a) * 30,
              radius: 520,
              color: colors.violet,
              alpha: 0.12,
            },
          ],
        }),
        shapeNode('band', {
          geometry: rect(band.x, band.y, band.width, band.height),
          fill: litFill(lighting, colors.surface, band, { sheen: 0.08, shade: 0.3 }),
          stroke: { color: withAlpha(colors.light, 0.05), width: 1 },
          shadow: elevationShadows(lighting, 'mid'),
        }),
        top(t),
        bottom(t),
        edgeFade('fade-left', 'left'),
        edgeFade('fade-right', 'right'),
      ],
    };
  },
});

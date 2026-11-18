import { createThreeLayer, type ThreeLayer } from '@html-animation-engine/adapters/three';
import {
  clamp,
  defineComposition,
  lerp,
  progress,
  radialGradient,
  rect,
  shapeNode,
  withAlpha,
  type SceneNode,
} from '@html-animation-engine/core';
import { createRenderer, gridBackdrop, type Renderer } from '@html-animation-engine/renderers';
import { bounce, createBallRig, type BallPose, type BallRig, type Drop } from '../cowork-ball.js';
import { C, look } from '../cowork-look.js';
import { lighting, phoneDefaults } from '../index.js';
import { cue, pluck, soundtrack, thump, whoosh } from '../sounds.js';

const { easing } = look;
const W = phoneDefaults.width;
const H = phoneDefaults.height;

/** Where the drops start (a word's letters), where they meet, the ball's size, the floor. */
const LETTERS = [-200, -125, -45, 40, 120, 200].map((dx) => ({ x: W / 2 + dx, y: 560 }));
const R = 72;
const FLOOR = 840;
/** The timeline (s). */
const T = {
  merge: { start: 0.2, duration: 0.8 },
  drop: 1.0,
  fly: { start: 2.4, duration: 0.9 },
  spread: { start: 3.35, duration: 0.55 },
} as const;
const CARD = { w: 460, h: 620 } as const;
/** How fast the studio turns round the ball (degrees a second): the shines glide. */
const SPIN = 70;

/** The six drops at `t`: growing out of the letters, then running together. */
function drops(t: number): Drop[] {
  const grow = progress(t, T.merge.start, 0.3, easing.enter);
  const m = progress(t, T.merge.start + 0.15, T.merge.duration - 0.15, easing.camera);
  const target = { x: W / 2, y: 560 };
  return LETTERS.map((l) => ({
    x: lerp(l.x, target.x, m),
    y: lerp(l.y, target.y, m),
    r: (R / Math.sqrt(LETTERS.length)) * grow * (1 + 0.15 * Math.sin(Math.PI * m)),
  }));
}

/** The ball at `t`, or its drops, or nothing. */
function pose(t: number): BallPose | null {
  if (t < T.merge.start) return null;
  if (t < T.drop) return { x: W / 2, y: 560, r: R, drops: drops(t), spin: SPIN * t };
  const restY = FLOOR - R;
  const b = bounce(t - T.drop, restY - 560);
  const fly = progress(t, T.fly.start, T.fly.duration, easing.camera);
  const speed = Math.sin(Math.PI * fly);
  const spread = progress(t, T.spread.start, T.spread.duration, easing.camera);
  const y = lerp(restY - b.lift, H / 2, progress(t, T.fly.start - 0.2, 0.4, easing.camera));
  return {
    x: W / 2,
    y,
    r: R,
    squash: b.squash,
    wobble3: b.wobble3,
    stretch: 1 + 0.55 * speed,
    angle: 90,
    spread,
    matte: progress(t, T.spread.start + 0.15, T.spread.duration, easing.camera),
    spin: SPIN * t,
    card: CARD,
  };
}

/** The light round the ball and its shadow on the floor, drawn beneath it. */
function under(t: number): SceneNode[] {
  const p = pose(t);
  if (!p) return [];
  const nodes: SceneNode[] = [];
  const glow = p.drops ? progress(t, T.merge.start, 0.6, easing.enter) : 1 - (p.spread ?? 0);
  const halo = R * 3;
  nodes.push(
    shapeNode('halo', {
      geometry: rect(p.x, p.y, 2 * halo, 2 * halo, halo),
      fill: radialGradient(p.x, p.y, halo, [
        withAlpha(C.meet.violet, 0.32 * glow),
        withAlpha(C.meet.lilac, 0.12 * glow),
        withAlpha(C.meet.lilac, 0),
      ]),
    }),
  );
  if (!p.drops && t < T.fly.start) {
    const lift = clamp((FLOOR - (p.y + R)) / 220);
    nodes.push(
      shapeNode('shadow', {
        geometry: rect(p.x, FLOOR - 2, R * 1.8 * (1 - 0.35 * lift), 18 * (1 - 0.3 * lift), 9),
        fill: withAlpha(lighting.shadow, 0.3 * (1 - 0.6 * lift)),
        blur: 14 + 18 * lift,
      }),
    );
  }
  return nodes;
}

interface Mounted {
  readonly svg: Renderer;
  readonly layer: ThreeLayer;
  readonly rig: BallRig;
}
const mounted = new WeakMap<HTMLElement, Mounted>();

const impacts = [0, 1, 2].map((k) => {
  // Times of the first impacts, read off the motion itself.
  let prev = Infinity;
  for (let t = T.drop; t < T.fly.start; t += 1 / 240) {
    const lift = bounce(t - T.drop, FLOOR - R - 560).lift;
    if (lift === 0 && prev > 0) {
      if (k === 0) return t;
      k--;
    }
    prev = lift;
  }
  return T.fly.start;
});

/**
 * The Cowork chrome ball on its own: drops of violet-tinted liquid chrome
 * run together into a ball, which drops, squashes and wobbles like firm
 * jelly, stretches as it flies, and flattens out into a card. Three.js
 * (seeked to t through `@html-animation-engine/adapters/three`) draws the
 * metal; the engine draws the ground, the light round it and its shadow.
 */
export default defineComposition({
  ...phoneDefaults,
  id: 'chrome-ball',
  duration: 4.2,
  background: C.bg.canvas,
  audio: soundtrack([
    cue(T.merge.start, whoosh(0.8, { from: 2400, to: 600, peak: 0.6, gain: 0.3 })),
    cue(T.drop - 0.05, pluck({ degree: 4, octave: 1, gain: 0.3 })),
    impacts.map((at, k) => cue(at, thump({ gain: 0.5 * 0.55 ** k }))),
    cue(T.fly.start, whoosh(T.fly.duration, { from: 300, to: 1800, peak: 0.5, gain: 0.45 })),
    cue(T.spread.start + 0.1, pluck({ degree: 7, octave: 1, gain: 0.3 })),
  ]),
  async setup(ctx) {
    const size = { width: W, height: H, pixelRatio: ctx.pixelRatio };
    const svg = createRenderer('svg', ctx.root, { ...size, background: C.bg.canvas });
    const layer = createThreeLayer(ctx.root, size);
    const rig = createBallRig(layer.renderer, W, H);
    mounted.set(ctx.root, { svg, layer, rig });
  },
  render(t, ctx) {
    const m = mounted.get(ctx.root);
    if (!m) throw new Error('chrome-ball rendered before setup.');
    m.svg.render({
      width: W,
      height: H,
      world: [
        shapeNode('base', { geometry: rect(W / 2, H / 2, W, H), fill: C.bg.canvas }),
        gridBackdrop({
          id: 'grid',
          x: 0,
          y: 0,
          width: W,
          height: H,
          cell: 120,
          color: C.bg.grid,
          majorColor: C.bg.gridMajor,
        }),
        ...under(t),
      ],
    });
    m.rig.pose(pose(t));
    m.layer.render(m.rig.scene, m.rig.camera);
  },
  teardown(ctx) {
    const m = mounted.get(ctx.root);
    m?.svg.destroy();
    m?.layer.destroy();
    mounted.delete(ctx.root);
  },
});

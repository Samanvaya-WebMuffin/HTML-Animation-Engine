import {
  defineComposition,
  lerp,
  linearGradient,
  progress,
  rect,
  shapeNode,
  withAlpha,
  type Point,
  type SceneNode,
} from '@html-animation-engine/core';
import { createRenderer, type Renderer } from '@html-animation-engine/renderers';
import { phoneDefaults, theme } from '../index.js';
import { SFX_DIV, beats, onGrid } from '../cowork-beat.js';
import { openingBackdrop } from '../cowork-film.js';
import { CRACK_DURATION, TINT, wall, type Measure } from '../query-bubbles/composition.js';
import { createFracture, type ShadowSprite } from '../fracture.js';
import { bell, clap, crack, cue, pad, seeded, soundtrack, tick, whoosh } from '../sounds.js';

const { colors, easing } = theme;
const W = phoneDefaults.width;
const H = phoneDefaults.height;

/**
 * Picks up from scene 1's exact last frame: the screen full of messages is
 * the wall, the messages its paint. It sets (a faint sheen crosses it),
 * cracks from the centre outwards with light shining through, then breaks:
 * each shard carries its piece of the painted messages as it falls, and the
 * light room behind is revealed.
 */
const T = {
  /** A breath on the finished wall; a faint sheen crosses it as it sets. */
  sheen: { start: onGrid(0.1), duration: 0.6 },
  /** The crack front runs from the centre to the corners. */
  crack: { start: beats(1), duration: 1.0 },
  /** It breaks: shards fall, the centre first. */
  fall: beats(3),
  duration: CRACK_DURATION,
} as const;

// ---------------------------------------------------------------------------
// The fracture (`fracture.ts`): an eggshell break around the centre.
// ---------------------------------------------------------------------------

const FRACTURE = createFracture({
  seed: 'query-crack',
  width: W,
  height: H,
  crack: T.crack,
  fall: T.fall,
  tint: TINT,
  light: colors.light,
});
const { cracks, leak, crackReaches } = FRACTURE;

/** A light sheen crossing the wall once, as it sets hard. */
function sheen(t: number): SceneNode | null {
  const p = progress(t, T.sheen.start, T.sheen.duration, easing.camera);
  if (p <= 0 || p >= 1) return null;
  const y = lerp(-H * 0.4, H * 1.4, p);
  return shapeNode('sheen', {
    geometry: rect(W / 2, H / 2, W, H),
    fill: linearGradient(0, y - 260, W * 0.35, y + 260, [
      { offset: 0, color: withAlpha(colors.light, 0) },
      { offset: 0.5, color: withAlpha(colors.light, 0.08) },
      { offset: 1, color: withAlpha(colors.light, 0) },
    ]),
  });
}

/** A small shake as it breaks (moving only the shards and the light, which are cheap to redraw). */
function shake(t: number): Point {
  const hit = (start: number, amp: number) => {
    const tau = t - start;
    if (tau < 0) return { x: 0, y: 0 };
    const e = amp * Math.exp(-tau / 0.18);
    return { x: e * Math.sin(tau * 2 * Math.PI * 7), y: e * Math.cos(tau * 2 * Math.PI * 5.3) };
  };
  // Only as it breaks: shaking the wall while it cracks would make the browser
  // repaint every message on it each frame.
  return hit(T.fall, 6);
}

// ---------------------------------------------------------------------------

/**
 * The wall sets with a low lock; cracks snap outwards (the snap recording,
 * slowed into a crunch), quickening, under a creaking rise; it breaks with a
 * big clap and thump; debris ticks and glints as it falls; and the light room
 * opens up on a bright chord and a bell.
 */
const audio = soundtrack([
  cue(0, pad(T.fall, { chord: 'shadow', attack: 0.2, release: 0.8, gain: 1.2 })),
  cue(0, whoosh(T.crack.start, { from: 180, to: 600, peak: 0.9, gain: 1.1 })),
  cue(T.crack.start, crack({ size: 0.9 })),
  [60, 110, 170, 240, 320, 410, 510, 620].map((r, i) =>
    cue(
      onGrid(crackReaches(r), SFX_DIV),
      crack({
        size: lerp(0.6, 0.2, i / 7),
        take: i + 1,
        pan: (seeded('crack-pan', i) - 0.5) * 1.2,
      }),
    ),
  ),
  cue(T.crack.start, whoosh(T.fall - T.crack.start, { from: 120, to: 900, peak: 0.95, gain: 0.8 })),
  cue(T.fall, clap({ big: true, chord: 'home' })),
  cue(T.fall, crack({ size: 1 })),
  cue(T.fall, whoosh(1.2, { from: 3000, to: 250, peak: 0.15, gain: 0.9 })),
  Array.from({ length: 12 }, (_, i) =>
    cue(
      onGrid(T.fall + 0.15 + seeded('debris', i) * 1.1, SFX_DIV),
      tick({ degree: 5 + (i % 5), gain: 0.6, pan: (seeded('debris-pan', i) - 0.5) * 1.4 }),
    ),
  ),
  [0, 1, 2].map((i) => cue(T.fall + beats(0.5 * (i + 1)), bell({ degree: 7 + i * 2, gain: 0.35 }))),
  cue(T.fall, pad(T.duration - T.fall - 0.4, { chord: 'home', attack: 0.5, release: 1.2 })),
]);

interface Mounted {
  readonly measure: Measure;
  readonly room: Renderer;
  readonly wallLayer: HTMLElement;
  readonly wallRenderer: Renderer;
  readonly shardCanvas: HTMLCanvasElement;
  readonly wallImage: HTMLCanvasElement;
  readonly sprites: readonly ShadowSprite[];
  readonly top: Renderer;
}
const mounted = new WeakMap<HTMLElement, Mounted>();

export default defineComposition({
  ...phoneDefaults,
  fonts: [...phoneDefaults.fonts, ...wall.fonts],
  id: 'query-crack',
  seed: 'query-crack',
  audio,
  title: 'The wall breaks',
  duration: T.duration,
  background: TINT,
  /**
   * Layers, bottom to top: the room (SVG), the wall exactly as scene 1 draws
   * it (SVG; hidden when it breaks), the falling shards (canvas), and the
   * light: sheen, leak and cracks (SVG). The room is the film's ground and
   * aurora, redrawn each frame as the light drifts; the wall is still, so it
   * is drawn once here, and the shards are cut from a still picture of it.
   */
  setup(ctx) {
    const measure = wall.createMeasure();
    const size = { width: W, height: H, pixelRatio: ctx.pixelRatio };
    const doc = ctx.root.ownerDocument;
    const still = { width: W, height: H, camera: wall.camera(wall.end) };
    const room = createRenderer('svg', ctx.root, size);
    room.render({ ...still, world: openingBackdrop(T.duration) });
    const wallLayer = doc.createElement('div');
    Object.assign(wallLayer.style, { position: 'absolute', inset: '0' });
    ctx.root.append(wallLayer);
    const wallRenderer = createRenderer('svg', wallLayer, size);
    wallRenderer.render({ ...still, world: wall.world(wall.end, measure) });
    const shardCanvas = doc.createElement('canvas');
    shardCanvas.width = Math.round(W * ctx.pixelRatio);
    shardCanvas.height = Math.round(H * ctx.pixelRatio);
    Object.assign(shardCanvas.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${W}px`,
      height: `${H}px`,
    });
    ctx.root.append(shardCanvas);
    const top = createRenderer('svg', ctx.root, size);
    // The finished wall as one picture, at the output resolution.
    const holder = doc.createElement('div');
    const painter = createRenderer('canvas', holder, { ...size, background: TINT });
    painter.render({
      width: W,
      height: H,
      camera: wall.camera(wall.end),
      world: wall.world(wall.end, measure),
    });
    const wallImage = holder.querySelector('canvas') as HTMLCanvasElement;
    const sprites = FRACTURE.shadowSprites(doc, ctx.pixelRatio);
    mounted.set(ctx.root, {
      measure,
      room,
      wallLayer,
      wallRenderer,
      shardCanvas,
      wallImage,
      sprites,
      top,
    });
  },
  render(t, ctx) {
    const m = mounted.get(ctx.root);
    if (!m) throw new Error('query-crack rendered before setup.');
    // The film's ground and aurora, drifting on to the pinboard (its last frame is the pinboard's first).
    m.room.render({
      width: W,
      height: H,
      camera: wall.camera(wall.end),
      world: openingBackdrop(T.duration - t),
    });
    const jolt = shake(t);
    const camera = { ...wall.camera(wall.end), x: W / 2 + jolt.x, y: H / 2 + jolt.y };
    // Until it breaks, scene 1's last frame exactly; then the room behind the shards.
    const showWall = t < T.fall;
    if ((m.wallLayer.style.display !== 'none') !== showWall) {
      m.wallLayer.style.display = showWall ? '' : 'none';
    }
    const g = m.shardCanvas.getContext('2d');
    if (g) FRACTURE.drawShards(g, m.wallImage, m.sprites, t, ctx.pixelRatio, jolt);
    const light = [sheen(t), leak(t)].filter((n): n is SceneNode => n !== null);
    m.top.render({ width: W, height: H, camera, world: [...light, ...cracks(t)] });
  },
  teardown(ctx) {
    const m = mounted.get(ctx.root);
    m?.room.destroy();
    m?.wallRenderer.destroy();
    m?.wallLayer.remove();
    m?.top.destroy();
    m?.shardCanvas.remove();
    mounted.delete(ctx.root);
  },
});

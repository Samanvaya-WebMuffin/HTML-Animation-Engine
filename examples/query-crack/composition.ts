import {
  clamp,
  createRng,
  defineComposition,
  lerp,
  linearGradient,
  pathGeometry,
  progress,
  radialGradient,
  rect,
  shapeNode,
  withAlpha,
  type Point,
  type SceneNode,
} from '@html-animation-engine/core';
import { createRenderer, type Renderer } from '@html-animation-engine/renderers';
import { lighting, phoneDefaults, theme } from '../index.js';
import { SFX_DIV, beats, onGrid } from '../cowork-beat.js';
import { openingBackdrop } from '../cowork-film.js';
import { CRACK_DURATION, TINT, wall, type Measure } from '../query-bubbles/composition.js';
import { bell, clap, crack, cue, pad, seeded, soundtrack, tick, whoosh } from '../sounds.js';

const { colors, easing } = theme;
const W = phoneDefaults.width;
const H = phoneDefaults.height;
const CENTRE = { x: W / 2, y: H / 2 };
/** Furthest point of the frame from the centre. */
const REACH = Math.hypot(W / 2, H / 2);

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
// The fracture: Voronoi cells around seeds in jittered rings. Small shards at
// the centre where it breaks first, longer radial ones further out, the way
// an eggshell cracks.
// ---------------------------------------------------------------------------

const BOX = { x0: -60, y0: -60, x1: W + 60, y1: H + 60 };

function seeds(): Point[] {
  const rng = createRng('query-crack');
  const points: Point[] = [CENTRE];
  // Uneven rings: spacing and count vary, so no circle shows in the cracks.
  for (let r = 26; r < REACH * 1.25; r *= 1.28 + rng.next() * 0.3) {
    const n = 5 + Math.floor(rng.next() * 5);
    const turn = rng.next() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const a = turn + ((k + (rng.next() - 0.5) * 0.7) / n) * Math.PI * 2;
      const rr = r * (0.7 + rng.next() * 0.6);
      const p = { x: CENTRE.x + rr * Math.cos(a), y: CENTRE.y + rr * Math.sin(a) };
      if (p.x > BOX.x0 && p.x < BOX.x1 && p.y > BOX.y0 && p.y < BOX.y1) points.push(p);
    }
  }
  return points;
}

/** Keeps the part of a convex polygon on the near side of the bisector between `a` and `b`. */
function clipHalf(poly: Point[], a: Point, b: Point): Point[] {
  const [nx, ny] = [b.x - a.x, b.y - a.y];
  const c = (nx * (a.x + b.x)) / 2 + (ny * (a.y + b.y)) / 2;
  const side = (p: Point) => nx * p.x + ny * p.y - c; // <= 0 is a's side
  const out: Point[] = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length] as Point;
    const [sp, sq] = [side(p), side(q)];
    if (sp <= 0) out.push(p);
    if (sp <= 0 !== sq <= 0) {
      const k = sp / (sp - sq);
      out.push({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k });
    }
  });
  return out;
}

interface Shard {
  readonly poly: readonly Point[];
  readonly centre: Point;
  /** Distance of its centre from the impact. */
  readonly d: number;
  readonly fallAt: number;
  readonly spin: number;
  readonly drift: number;
}

interface Crack {
  /** The jagged line, from the end nearer the impact to the far end. */
  readonly points: readonly Point[];
  /** Distance along the line at each point. */
  readonly along: readonly number[];
  readonly dNear: number;
  readonly dFar: number;
  readonly angle: number;
}

const BOX_EDGE = 0.5;
const onBox = (p: Point) =>
  Math.abs(p.x - BOX.x0) < BOX_EDGE ||
  Math.abs(p.x - BOX.x1) < BOX_EDGE ||
  Math.abs(p.y - BOX.y0) < BOX_EDGE ||
  Math.abs(p.y - BOX.y1) < BOX_EDGE;
const pointKey = (v: Point) => `${Math.round(v.x)},${Math.round(v.y)}`;

/**
 * A crack between two corners, as a jagged line: short segments, each kink
 * pushed sideways a little. It is seeded by the edge itself (whichever way
 * it is walked), so the crack and the two shards either side of it follow
 * exactly the same line.
 */
function jag(p: Point, q: Point): Point[] {
  const [kp, kq] = [pointKey(p), pointKey(q)];
  const forward = kp < kq;
  const [a, b] = forward ? [p, q] : [q, p];
  const rng = createRng(`${kp < kq ? kp : kq}|${kp < kq ? kq : kp}`);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(2, Math.round(len / 8));
  const [nx, ny] = [-(b.y - a.y) / (len || 1), (b.x - a.x) / (len || 1)];
  const amp = Math.min(5.5, len * 0.07);
  // A wandering offset (each kink follows on from the last), pinned to 0 at
  // both ends, plus a little fine grit: a crack meanders, it doesn't zig-zag.
  let walk = 0;
  const offsets = Array.from({ length: n + 1 }, () => {
    walk = 0.65 * walk + (rng.next() - 0.5) * amp;
    return walk;
  });
  const line = Array.from({ length: n + 1 }, (_, k) => {
    const f = k / n;
    const pin = Math.sin(Math.PI * f); // 0 at the corners, so neighbours meet
    const off = k === 0 || k === n ? 0 : (offsets[k] ?? 0) * 1.6 * pin + (rng.next() - 0.5) * 1.2;
    return { x: lerp(a.x, b.x, f) + nx * off, y: lerp(a.y, b.y, f) + ny * off };
  });
  return forward ? line : line.reverse();
}

/** A cell's outline with every inner edge replaced by its jagged crack. */
function jagged(poly: readonly Point[]): Point[] {
  return poly.flatMap((p, i) => {
    const q = poly[(i + 1) % poly.length] as Point;
    return onBox(p) && onBox(q) ? [p] : jag(p, q).slice(0, -1);
  });
}

const SEEDS = seeds();
const box: Point[] = [
  { x: BOX.x0, y: BOX.y0 },
  { x: BOX.x1, y: BOX.y0 },
  { x: BOX.x1, y: BOX.y1 },
  { x: BOX.x0, y: BOX.y1 },
];
const CELLS = SEEDS.map((s, i) =>
  SEEDS.reduce((poly, o, j) => (i === j || poly.length < 3 ? poly : clipHalf(poly, s, o)), box),
).filter((poly) => poly.length >= 3);

const dist = (p: Point) => Math.hypot(p.x - CENTRE.x, p.y - CENTRE.y);

const SHARDS: Shard[] = CELLS.map((poly, i) => {
  const centre = {
    x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
    y: poly.reduce((s, p) => s + p.y, 0) / poly.length,
  };
  const d = dist(centre);
  return {
    poly: jagged(poly),
    centre,
    d,
    // The centre lets go first; the edges follow, a little unevenly.
    fallAt: T.fall + 0.55 * (d / REACH) + 0.14 * seeded('fall', i),
    spin: (seeded('spin', i) - 0.5) * 260,
    drift: (seeded('drift', i) - 0.5) * 70,
  };
});

/** Every shared edge once, oriented from the end nearer the impact. */
const CRACKS: Crack[] = (() => {
  const seen = new Set<string>();
  const out: Crack[] = [];
  for (const poly of CELLS) {
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length] as Point;
      if (onBox(p) && onBox(q)) return;
      const key = [p, q]
        .map((v) => `${Math.round(v.x)},${Math.round(v.y)}`)
        .sort()
        .join('|');
      if (seen.has(key) || Math.hypot(p.x - q.x, p.y - q.y) < 1) return;
      seen.add(key);
      const [near, far] = dist(p) <= dist(q) ? [p, q] : [q, p];
      const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      const points = jag(near, far);
      let total = 0;
      const along = points.map((v, k) => {
        const prev = points[k - 1];
        if (prev) total += Math.hypot(v.x - prev.x, v.y - prev.y);
        return total;
      });
      out.push({
        points,
        along,
        dNear: dist(near),
        dFar: dist(far),
        angle: Math.atan2(mid.y - CENTRE.y, mid.x - CENTRE.x),
      });
    });
  }
  return out;
})();

/** The crack front is uneven: it runs further in some directions than others. */
const PHASE = [seeded('phase', 0), seeded('phase', 1), seeded('phase', 2)].map(
  (v) => v * Math.PI * 2,
);
const unevenness = (a: number) =>
  0.5 +
  0.24 * Math.sin(3 * a + (PHASE[0] ?? 0)) +
  0.16 * Math.sin(5 * a + (PHASE[1] ?? 0)) +
  0.1 * Math.sin(9 * a + (PHASE[2] ?? 0));

/** How far the crack front has run in direction `a` at time `t`. */
function front(t: number, a: number): number {
  const p = clamp((t - T.crack.start) / T.crack.duration);
  if (p <= 0) return 0;
  return REACH * 1.15 * p ** 0.85 * (0.62 + 0.76 * unevenness(a));
}

// ---------------------------------------------------------------------------

/** Cracks glowing with the light behind the wall: inner (older) ones wider. */
function cracks(t: number): SceneNode[] {
  const fade = 1 - progress(t, T.fall, 0.3, easing.exit);
  if (t < T.crack.start || fade <= 0) return [];
  const grow = clamp((t - T.crack.start) / T.crack.duration);
  const bands = [
    { max: 140, width: 3.4 },
    { max: 380, width: 2.3 },
    { max: Infinity, width: 1.5 },
  ];
  const paths = bands.map(() => [] as string[]);
  for (const c of CRACKS) {
    const reach = front(t, c.angle);
    if (reach <= c.dNear) continue;
    // Draw the jagged line as far along as the front has run.
    const f = clamp((reach - c.dNear) / Math.max(c.dFar - c.dNear, 1));
    const length = f * (c.along.at(-1) ?? 0);
    const drawn: Point[] = [];
    c.points.forEach((v, k) => {
      const at = c.along[k] ?? 0;
      const prev = c.points[k - 1];
      const prevAt = c.along[k - 1] ?? 0;
      if (at <= length) drawn.push(v);
      else if (prev && prevAt < length) {
        const u = (length - prevAt) / (at - prevAt);
        drawn.push({ x: lerp(prev.x, v.x, u), y: lerp(prev.y, v.y, u) });
      }
    });
    if (drawn.length < 2) continue;
    const band = bands.findIndex((b) => c.dNear < b.max);
    paths[band]?.push(`M${drawn.map((v) => `${v.x.toFixed(1)} ${v.y.toFixed(1)}`).join('L')}`);
  }
  // The glow is drawn as stacked strokes (a wide faint halo, a softer middle
  // and a bright core) rather than blur filters, which would have to be
  // recomputed over the whole frame every time the cracks grow.
  const glow = [
    { scale: 10, color: TINT, alpha: 0.035 },
    { scale: 7, color: TINT, alpha: 0.05 },
    { scale: 4.6, color: TINT, alpha: 0.08 },
    { scale: 2.6, color: colors.light, alpha: 0.2 },
    { scale: 1, color: colors.light, alpha: 1 },
  ];
  return bands.flatMap((b, i) => {
    const d = paths[i]?.join('');
    if (!d) return [];
    const geometry = pathGeometry(d);
    const width = b.width * lerp(0.5, 1.15, grow);
    return glow.map((layer, k) =>
      shapeNode(`crack-${i}-${k}`, {
        geometry,
        fill: 'transparent',
        stroke: {
          color: withAlpha(layer.color, layer.alpha * fade),
          width: width * layer.scale,
          cap: 'round',
          join: 'round',
        },
      }),
    );
  });
}

/** Light leaking through the spreading cracks, brightest at the centre. */
function leak(t: number): SceneNode | null {
  const grow = clamp((t - T.crack.start) / T.crack.duration);
  const fade = 1 - progress(t, T.fall, 0.5, easing.exit);
  const a = 0.22 * grow * fade;
  if (a <= 0) return null;
  const r = lerp(120, REACH, grow);
  return shapeNode('leak', {
    geometry: rect(CENTRE.x, CENTRE.y, 2 * r, 2 * r, r),
    fill: radialGradient(CENTRE.x, CENTRE.y, r, [
      { offset: 0, color: withAlpha(TINT, a) },
      { offset: 1, color: withAlpha(TINT, 0) },
    ]),
  });
}

/**
 * Draws the falling shards onto a 2D canvas. The wall is a still picture by
 * the time it breaks, so it is painted once (at setup) into `wallImage`;
 * each shard is that picture clipped to its jagged outline, moved, turned
 * and scaled, with its lit edge and the shadow it casts on the room. Far
 * cheaper than redrawing every message inside every shard each frame.
 */
/** Each shard's box on the wall, in whole pixels, clamped to the frame. */
const SHARD_BOXES = SHARDS.map((s) => {
  const xs = s.poly.map((p) => p.x);
  const ys = s.poly.map((p) => p.y);
  const x = Math.max(0, Math.floor(Math.min(...xs)) - 1);
  const y = Math.max(0, Math.floor(Math.min(...ys)) - 1);
  return {
    x,
    y,
    w: Math.min(W, Math.ceil(Math.max(...xs)) + 1) - x,
    h: Math.min(H, Math.ceil(Math.max(...ys)) + 1) - y,
  };
});

/** A shard's soft shadow, blurred once at setup (blurring every frame is what made the fall stutter). */
interface ShadowSprite {
  readonly image: HTMLCanvasElement;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

function shadowSprites(doc: Document, scale: number): ShadowSprite[] {
  const blur = 26;
  const pad = blur * 2;
  return SHARDS.map((s) => {
    const xs = s.poly.map((p) => p.x);
    const ys = s.poly.map((p) => p.y);
    const [x, y] = [Math.min(...xs) - pad, Math.min(...ys) - pad];
    const [w, h] = [Math.max(...xs) + pad - x, Math.max(...ys) + pad - y];
    const image = doc.createElement('canvas');
    image.width = Math.ceil(w * scale);
    image.height = Math.ceil(h * scale);
    const g = image.getContext('2d');
    if (g) {
      g.setTransform(scale, 0, 0, scale, -x * scale, -y * scale);
      g.filter = `blur(${(blur / 2) * scale}px)`;
      g.fillStyle = withAlpha(lighting.shadow, 0.35);
      g.beginPath();
      s.poly.forEach((p, k) => (k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
      g.fill();
    }
    return { image, x, y, w, h };
  });
}

function drawShards(
  g: CanvasRenderingContext2D,
  wallImage: CanvasImageSource,
  sprites: readonly ShadowSprite[],
  t: number,
  scale: number,
  shake: Point,
) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  if (t < T.fall) return;
  const trace = (poly: readonly Point[]) => {
    g.beginPath();
    poly.forEach((p, k) => (k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
  };
  SHARDS.forEach((s, i) => {
    const tau = Math.max(0, t - s.fallAt);
    // Falling: a small kick outwards from the impact, then gravity.
    const away = {
      x: (s.centre.x - CENTRE.x) / (s.d || 1),
      y: (s.centre.y - CENTRE.y) / (s.d || 1),
    };
    const dx = (away.x * 120 + s.drift) * tau;
    const dy = away.y * 120 * tau + 0.5 * 2600 * tau * tau;
    if (s.centre.y + dy - 260 > H) return; // gone below the frame
    // World → canvas: the output scale, the camera's shake, then the shard's own motion.
    const place = (down: number, spread: number) => {
      g.setTransform(scale, 0, 0, scale, -shake.x * scale, (down - shake.y) * scale);
      g.translate(s.centre.x + dx, s.centre.y + dy);
      g.rotate((s.spin * tau * Math.PI) / 180);
      g.scale((1 + 0.2 * tau) * spread, (1 + 0.2 * tau) * spread);
      g.translate(-s.centre.x, -s.centre.y);
    };
    const sprite = sprites[i];
    if (tau > 0 && sprite) {
      // Its shadow on the room: further below and wider the further it has fallen.
      place(14 + 60 * tau, 1 + 0.25 * tau);
      g.drawImage(sprite.image, sprite.x, sprite.y, sprite.w, sprite.h);
    }
    place(0, 1);
    g.save();
    trace(s.poly);
    g.clip();
    // Only the part of the picture under this shard (its box), not the whole wall.
    const box = SHARD_BOXES[i];
    if (box) {
      g.drawImage(
        wallImage,
        box.x * scale,
        box.y * scale,
        box.w * scale,
        box.h * scale,
        box.x,
        box.y,
        box.w,
        box.h,
      );
    }
    g.restore();
    if (tau > 0) {
      trace(s.poly);
      g.strokeStyle = withAlpha(colors.light, 0.16);
      g.lineWidth = 1.4;
      g.stroke();
    }
  });
}

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

/** When the crack front (on average) reaches distance `r`. */
const crackReaches = (r: number) =>
  T.crack.start + T.crack.duration * (r / (REACH * 1.15)) ** (1 / 0.85);

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
    const sprites = shadowSprites(doc, ctx.pixelRatio);
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
    if (g) drawShards(g, m.wallImage, m.sprites, t, ctx.pixelRatio, jolt);
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

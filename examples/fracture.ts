/**
 * A wall cracking like an eggshell and breaking into falling shards, shared
 * by the scenes that break a wall (`query-crack`, the film's opening): a
 * Voronoi fracture around seeds in jittered rings (small shards at the
 * impact, longer radial ones further out), jagged crack lines that run out
 * from the centre with light glowing through them, and shards that carry
 * their piece of a still picture of the wall as they fall (drawn on a 2D
 * canvas). Every part is seeded, so the same options give the same break.
 */
import {
  clamp,
  createRng,
  lerp,
  pathGeometry,
  progress,
  radialGradient,
  rect,
  shapeNode,
  withAlpha,
  type Point,
  type SceneNode,
} from '@html-animation-engine/core';
import { lighting, theme } from './index.js';
import { seeded } from './sounds.js';

const { easing } = theme;

export interface FractureOptions {
  /** Seeds the fracture pattern. */
  readonly seed: string;
  readonly width: number;
  readonly height: number;
  /** When the crack front starts from the centre, and how long it takes to reach the corners. */
  readonly crack: { readonly start: number; readonly duration: number };
  /** When it breaks and the shards begin to fall. */
  readonly fall: number;
  /** The light behind the wall: the cracks' glow, and their bright core. */
  readonly tint: string;
  readonly light: string;
}

/** How the falling shards are drawn beyond their picture. */
export interface ShardStyle {
  /** Px of broken edge showing beneath each falling shard (0 = none). */
  readonly thickness?: number;
  readonly underside?: string;
  /** Opacity of the light edge round each falling shard. */
  readonly edge?: number;
  /**
   * Cut each shard's shadow and underside to the part of it that was in
   * the frame (the picture only covers the frame; without this, the parts
   * of edge shards beyond it fall into view as grey bars).
   */
  readonly inFrame?: boolean;
}

export interface ShadowSprite {
  readonly image: HTMLCanvasElement;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type Fracture = ReturnType<typeof createFracture>;

export function createFracture(o: FractureOptions) {
  const W = o.width;
  const H = o.height;
  const CENTRE = { x: W / 2, y: H / 2 };
  /** Furthest point of the frame from the centre. */
  const REACH = Math.hypot(W / 2, H / 2);
  const TINT = o.tint;
  const colors = { light: o.light };
  // ---------------------------------------------------------------------------
  // The fracture: Voronoi cells around seeds in jittered rings. Small shards at
  // the centre where it breaks first, longer radial ones further out, the way
  // an eggshell cracks.
  // ---------------------------------------------------------------------------

  const BOX = { x0: -60, y0: -60, x1: W + 60, y1: H + 60 };

  function seeds(): Point[] {
    const rng = createRng(o.seed);
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
      fallAt: o.fall + 0.55 * (d / REACH) + 0.14 * seeded('fall', i),
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
    const p = clamp((t - o.crack.start) / o.crack.duration);
    if (p <= 0) return 0;
    return REACH * 1.15 * p ** 0.85 * (0.62 + 0.76 * unevenness(a));
  }

  // ---------------------------------------------------------------------------

  /** Cracks glowing with the light behind the wall: inner (older) ones wider. */
  function cracks(t: number): SceneNode[] {
    const fade = 1 - progress(t, o.fall, 0.3, easing.exit);
    if (t < o.crack.start || fade <= 0) return [];
    const grow = clamp((t - o.crack.start) / o.crack.duration);
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
    const grow = clamp((t - o.crack.start) / o.crack.duration);
    const fade = 1 - progress(t, o.fall, 0.5, easing.exit);
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
  /** A polygon cut to the frame (each edge of the frame in turn: Sutherland–Hodgman). */
  const inFrame = (poly: readonly Point[]): Point[] => {
    const edges: [Point, Point][] = [
      [
        { x: 0, y: 0 },
        { x: -1, y: 0 },
      ],
      [
        { x: W, y: 0 },
        { x: W + 1, y: 0 },
      ],
      [
        { x: 0, y: 0 },
        { x: 0, y: -1 },
      ],
      [
        { x: 0, y: H },
        { x: 0, y: H + 1 },
      ],
    ];
    // clipHalf keeps the side of the bisector nearer `a`; put the bisector on each frame edge.
    return edges.reduce<Point[]>(
      (out, [edge, outside]) =>
        out.length < 3
          ? out
          : clipHalf(out, { x: 2 * edge.x - outside.x, y: 2 * edge.y - outside.y }, outside).map(
              (p) => p,
            ),
      [...poly],
    );
  };

  /**
   * Each shard's soft shadow, blurred once at setup. With `onlyInFrame`, a
   * shard's shadow is cast by the part of it that was in the frame (the
   * only part with picture), so edge shards don't drag a shadow of nothing.
   */
  function shadowSprites(
    doc: Document,
    scale: number,
    strength = 0.35,
    onlyInFrame = false,
  ): ShadowSprite[] {
    const blur = 26;
    const pad = blur * 2;
    return SHARDS.map((shard) => {
      const s = { poly: onlyInFrame ? inFrame(shard.poly) : shard.poly };
      if (s.poly.length < 3) s.poly = [...shard.poly];
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
        g.fillStyle = withAlpha(lighting.shadow, strength);
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
    style: ShardStyle = {},
  ) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, g.canvas.width, g.canvas.height);
    if (t < o.fall) return;
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
      const box = SHARD_BOXES[i];
      const clipToBox = () => {
        if (!style.inFrame || !box) return;
        g.beginPath();
        g.rect(box.x, box.y, box.w, box.h);
        g.clip();
      };
      if (tau > 0 && sprite) {
        // Its shadow on the room: further below and wider the further it has fallen.
        place(14 + 60 * tau, 1 + 0.25 * tau);
        g.drawImage(sprite.image, sprite.x, sprite.y, sprite.w, sprite.h);
      }
      if (tau > 0 && style.thickness) {
        // The shard's broken edge: its underside, showing below as it turns and falls.
        place(style.thickness, 1);
        g.save();
        clipToBox();
        trace(s.poly);
        g.fillStyle = style.underside ?? withAlpha(lighting.shadow, 0.5);
        g.fill();
        g.restore();
      }
      place(0, 1);
      g.save();
      trace(s.poly);
      g.clip();
      // Only the part of the picture under this shard (its box), not the whole wall.
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
        g.save();
        clipToBox();
        trace(s.poly);
        g.strokeStyle = withAlpha(colors.light, style.edge ?? 0.16);
        g.lineWidth = 1.4;
        g.stroke();
        g.restore();
      }
    });
  }

  /** When the crack front (on average) reaches distance `r`. */
  const crackReaches = (r: number) =>
    o.crack.start + o.crack.duration * (r / (REACH * 1.15)) ** (1 / 0.85);

  return {
    centre: CENTRE,
    reach: REACH,
    shards: SHARDS,
    cracks,
    leak,
    crackReaches,
    shadowSprites,
    drawShards,
  };
}

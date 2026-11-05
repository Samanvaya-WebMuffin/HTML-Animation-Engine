import {
  circle,
  clamp,
  createNoise,
  createRng,
  groupNode,
  lerp,
  mixColors,
  mod,
  pathGeometry,
  random,
  rect,
  shapeNode,
  type GroupNode,
  type SceneNode,
} from '@html-animation-engine/core';

export interface ParticleOptions {
  readonly id: string;
  readonly seed: number | string;
  /** Emission point. */
  readonly x: number;
  readonly y: number;
  readonly start: number;
  readonly count: number;
  readonly colors: readonly string[];
  /** Launch speed range, px/s. */
  readonly speed: readonly [number, number];
  /** Centre of the launch direction in degrees (0 = right, -90 = up). Default -90. */
  readonly direction?: number;
  /** Spread around `direction` in degrees. Default 360. */
  readonly spread?: number;
  /** Downward acceleration, px/s². Default 900. */
  readonly gravity?: number;
  /** Linear drag coefficient, 1/s. Default 2. */
  readonly drag?: number;
  /** Particle lifetime range in seconds. Default [1, 1.6]. */
  readonly life?: readonly [number, number];
  /** Particle size range (diameter or width), px. Default [6, 12]. */
  readonly size?: readonly [number, number];
  /** Emission spread over time: each particle launches within `[start, start + stagger]`. */
  readonly stagger?: number;
}

interface Particle {
  vx: number;
  vy: number;
  life: number;
  delay: number;
  size: number;
  color: string;
  spin: number;
  flip: number;
  phase: number;
}

/**
 * Closed-form position of a particle with linear drag `k` and gravity `g`
 * (y down), launched from the origin with velocity (vx, vy).
 */
function ballistic(vx: number, vy: number, k: number, g: number, tau: number) {
  if (k === 0) return { x: vx * tau, y: vy * tau + 0.5 * g * tau * tau };
  const decay = (1 - Math.exp(-k * tau)) / k;
  return { x: vx * decay, y: (g / k) * tau + (vy - g / k) * decay };
}

function makeParticles(options: ParticleOptions): Particle[] {
  const rng = createRng(options.seed);
  const direction = options.direction ?? -90;
  const spread = options.spread ?? 360;
  const [minLife, maxLife] = options.life ?? [1, 1.6];
  const [minSize, maxSize] = options.size ?? [6, 12];
  return Array.from({ length: options.count }, () => {
    const angle = ((direction + (rng.next() - 0.5) * spread) * Math.PI) / 180;
    const speed = rng.range(options.speed[0], options.speed[1]);
    return {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rng.range(minLife, maxLife),
      delay: rng.next() * (options.stagger ?? 0),
      size: rng.range(minSize, maxSize),
      color: rng.pick(options.colors),
      spin: rng.range(-720, 720),
      flip: rng.range(6, 14),
      phase: rng.range(0, Math.PI * 2),
    };
  });
}

function particleField(
  options: ParticleOptions,
  draw: (p: Particle, i: number, tau: number, x: number, y: number, fade: number) => SceneNode,
): (t: number) => GroupNode {
  const particles = makeParticles(options);
  const k = options.drag ?? 2;
  const g = options.gravity ?? 900;
  return (t) =>
    groupNode(
      options.id,
      particles.map((p, i) => {
        const tau = t - options.start - p.delay;
        if (tau < 0 || tau > p.life) {
          return shapeNode(`${options.id}-${i}`, { geometry: circle(0, 0, 0), visible: false });
        }
        const pos = ballistic(p.vx, p.vy, k, g, tau);
        const fade = 1 - clamp((tau / p.life - 0.7) / 0.3); // fade over the last 30 % of life
        return draw(p, i, tau, options.x + pos.x, options.y + pos.y, fade);
      }),
    );
}

/** A radial burst of round sparks that slow, fall and fade. */
export function particleBurst(options: ParticleOptions): (t: number) => GroupNode {
  return particleField(options, (p, i, tau, x, y, fade) =>
    shapeNode(`${options.id}-${i}`, {
      geometry: circle(0, 0, (p.size / 2) * lerp(1, 0.4, tau / p.life)),
      fill: p.color,
      opacity: fade,
      transform: { x, y },
    }),
  );
}

/** Paper confetti: spinning, fluttering rectangles. */
export function confetti(options: ParticleOptions): (t: number) => GroupNode {
  return particleField(
    { gravity: 700, drag: 2.5, life: [1.8, 2.6], spread: 70, ...options },
    (p, i, tau, x, y, fade) =>
      shapeNode(`${options.id}-${i}`, {
        geometry: rect(0, 0, p.size, p.size * 0.6, 1),
        fill: p.color,
        opacity: fade,
        transform: {
          x: x + Math.sin(tau * 5 + p.phase) * 12,
          y,
          rotation: p.spin * tau,
          // Flutter: the paper's apparent height swings as it flips.
          scaleY: Math.cos(tau * p.flip + p.phase),
        },
      }),
  );
}

export interface DotGridOptions {
  readonly id: string;
  /** Centre of the grid. */
  readonly x: number;
  readonly y: number;
  readonly cols: number;
  readonly rows: number;
  readonly spacing: number;
  readonly radius: number;
  readonly color: string;
  /** Colour at the crest of the wave. Default `color`. */
  readonly accent?: string;
  /** Ripple origin. Default: grid centre. */
  readonly origin?: { readonly x: number; readonly y: number };
  /** Distance between wave crests, px. */
  readonly wavelength: number;
  /** Scale added at a crest. Default 1.2. */
  readonly amplitude?: number;
  /** Seconds for one full wave cycle; the grid loops seamlessly at multiples of it. */
  readonly period: number;
}

/** A grid of dots with a wave rippling out from a point; loops every `period`. */
export function dotGrid(options: DotGridOptions): (t: number) => GroupNode {
  const { id, cols, rows, spacing } = options;
  const origin = options.origin ?? { x: options.x, y: options.y };
  const amplitude = options.amplitude ?? 1.2;
  const dots = Array.from({ length: cols * rows }, (_, i) => {
    const x = options.x + ((i % cols) - (cols - 1) / 2) * spacing;
    const y = options.y + (Math.floor(i / cols) - (rows - 1) / 2) * spacing;
    return { x, y, distance: Math.hypot(x - origin.x, y - origin.y) };
  });
  return (t) =>
    groupNode(
      id,
      dots.map((dot, i) => {
        // Wrap time into the loop first so t = period gives exactly the t = 0 frame.
        const phase = dot.distance / options.wavelength - mod(t, options.period) / options.period;
        const crest = (0.5 + 0.5 * Math.cos(2 * Math.PI * phase)) ** 4; // sharp crest
        return shapeNode(`${id}-${i}`, {
          geometry: circle(0, 0, options.radius),
          fill: options.accent ? mixColors(options.color, options.accent, crest) : options.color,
          transform: { x: dot.x, y: dot.y, scale: 1 + amplitude * crest },
        });
      }),
    );
}

export interface NodeGraphOptions {
  readonly id: string;
  readonly seed: number | string;
  readonly count: number;
  /** Area the points live in (top-left, size). */
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  /** Seconds for one seamless loop of the drift. */
  readonly loopDuration: number;
  /** How far each point drifts from home, px. */
  readonly drift: number;
  /** Links longer than this are not drawn, px. */
  readonly linkDistance: number;
  /** Links per point to its nearest neighbours. Default 3. */
  readonly neighbours?: number;
  readonly nodeRadius: number;
  readonly nodeColor: string;
  readonly linkColor: string;
  readonly linkWidth?: number;
}

/** Drifting points joined to their nearest neighbours; loops seamlessly. */
export function nodeGraph(options: NodeGraphOptions): (t: number) => GroupNode {
  const { id, bounds, count } = options;
  const noise = createNoise(options.seed);
  const k = options.neighbours ?? 3;
  const homes = Array.from({ length: count }, (_, i) => ({
    x: bounds.x + random(options.seed, 'x', i) * bounds.width,
    y: bounds.y + random(options.seed, 'y', i) * bounds.height,
  }));
  return (t) => {
    const p = t / options.loopDuration;
    const points = homes.map((home, i) => ({
      x: home.x + options.drift * noise.loop(p, 0.8, i * 2),
      y: home.y + options.drift * noise.loop(p, 0.8, i * 2 + 1),
    }));
    const links = new Map<string, { a: number; b: number; d: number }>();
    points.forEach((point, a) => {
      points
        .map((other, b) => ({ b, d: Math.hypot(other.x - point.x, other.y - point.y) }))
        .filter(({ b, d }) => b !== a && d <= options.linkDistance)
        .sort((m, n) => m.d - n.d || m.b - n.b)
        .slice(0, k)
        .forEach(({ b, d }) => {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          links.set(`${lo}-${hi}`, { a: lo, b: hi, d });
        });
    });
    const linkNodes = [...links.entries()]
      .sort(([x], [y]) => (x < y ? -1 : 1))
      .map(([key, { a, b, d }]) => {
        const from = points[a] ?? { x: 0, y: 0 };
        const to = points[b] ?? { x: 0, y: 0 };
        return shapeNode(`${id}-l${key}`, {
          geometry: pathGeometry(
            `M${from.x.toFixed(2)} ${from.y.toFixed(2)}L${to.x.toFixed(2)} ${to.y.toFixed(2)}`,
          ),
          stroke: { color: options.linkColor, width: options.linkWidth ?? 1.5 },
          opacity: 1 - d / options.linkDistance,
        });
      });
    const nodes = points.map((point, i) =>
      shapeNode(`${id}-n${i}`, {
        geometry: circle(0, 0, options.nodeRadius),
        fill: options.nodeColor,
        transform: point,
      }),
    );
    return groupNode(id, [groupNode(`${id}-links`, linkNodes), groupNode(`${id}-nodes`, nodes)]);
  };
}

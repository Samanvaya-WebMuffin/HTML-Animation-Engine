import {
  circle,
  clamp,
  createNoise,
  createRng,
  groupNode,
  lerp,
  linearGradient,
  mixColors,
  mod,
  pathGeometry,
  radialGradient,
  random,
  rect,
  shapeNode,
  withAlpha,
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
  /**
   * Light. For `particleBurst`, sparks become glowing streaks: stretched along
   * their velocity, fading to a transparent tail and a hot `core` tip. For
   * `confetti`, paper catches the light as it flips: a glint of `core` when it
   * faces the viewer and `shade` when edge-on. Gradients only, no blur.
   */
  readonly light?: {
    readonly core: string;
    /** Confetti only: the colour paper darkens toward when edge-on. */
    readonly shade?: string;
    /** Burst only: streak length per px/s of speed, in seconds. Default 0.035. */
    readonly streak?: number;
  };
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

/** Velocity of `ballistic` at `tau` (its time derivative). */
function velocity(vx: number, vy: number, k: number, g: number, tau: number) {
  if (k === 0) return { x: vx, y: vy + g * tau };
  const e = Math.exp(-k * tau);
  return { x: vx * e, y: g / k + (vy - g / k) * e };
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
  const k = dragOf(options);
  const g = gravityOf(options);
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

const dragOf = (options: ParticleOptions) => options.drag ?? 2;
const gravityOf = (options: ParticleOptions) => options.gravity ?? 900;

/**
 * A radial burst of round sparks that slow, fall and fade. With `light`, each
 * spark is a glowing streak along its direction of travel.
 */
export function particleBurst(options: ParticleOptions): (t: number) => GroupNode {
  const { light } = options;
  const k = dragOf(options);
  const g = gravityOf(options);
  return particleField(options, (p, i, tau, x, y, fade) => {
    const r = (p.size / 2) * lerp(1, 0.4, tau / p.life);
    if (!light) {
      return shapeNode(`${options.id}-${i}`, {
        geometry: circle(0, 0, r),
        fill: p.color,
        opacity: fade,
        transform: { x, y },
      });
    }
    // Streak: a capsule from the tail (behind, transparent) to the head (at the
    // particle, hot core), as long as the distance covered in `streak` seconds.
    const v = velocity(p.vx, p.vy, k, g, tau);
    const speed = Math.hypot(v.x, v.y);
    const length = Math.min(speed * (light.streak ?? 0.035), 90) + r * 2;
    const angle = (Math.atan2(v.y, v.x) * 180) / Math.PI;
    return shapeNode(`${options.id}-${i}`, {
      geometry: rect(r - length / 2, 0, length, r * 2, r),
      fill: linearGradient(r - length, 0, r, 0, [
        { offset: 0, color: withAlpha(p.color, 0) },
        { offset: 0.6, color: withAlpha(p.color, 0.85) },
        { offset: 0.88, color: p.color },
        { offset: 1, color: mixColors(p.color, light.core, 0.75) },
      ]),
      opacity: fade,
      transform: { x, y, rotation: angle },
    });
  });
}

/**
 * Paper confetti: spinning, fluttering rectangles. With `light`, each piece
 * glints as it turns to face the viewer and darkens as it turns edge-on.
 */
export function confetti(options: ParticleOptions): (t: number) => GroupNode {
  const { light } = options;
  return particleField(
    { gravity: 700, drag: 2.5, life: [1.8, 2.6], spread: 70, ...options },
    (p, i, tau, x, y, fade) => {
      // Flutter: the paper's apparent height swings as it flips.
      const facing = Math.cos(tau * p.flip + p.phase);
      let fill = p.color;
      if (light) {
        const glint = Math.abs(facing) ** 6;
        fill = mixColors(p.color, light.core, 0.45 * glint);
        if (light.shade) fill = mixColors(fill, light.shade, 0.45 * (1 - Math.abs(facing)));
      }
      return shapeNode(`${options.id}-${i}`, {
        geometry: rect(0, 0, p.size, p.size * 0.6, 1),
        fill,
        opacity: fade,
        transform: {
          x: x + Math.sin(tau * 5 + p.phase) * 12,
          y,
          rotation: p.spin * tau,
          scaleY: facing,
        },
      });
    },
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
  /**
   * A soft halo of `accent` around dots on the crest, as a multiple of the dot
   * radius (e.g. 4). A radial gradient, drawn only where the crest is lit. Default: none.
   */
  readonly glow?: number;
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
  const glowColor = options.accent ?? options.color;
  return (t) => {
    const crests = dots.map((dot) => {
      // Wrap time into the loop first so t = period gives exactly the t = 0 frame.
      const phase = dot.distance / options.wavelength - mod(t, options.period) / options.period;
      return (0.5 + 0.5 * Math.cos(2 * Math.PI * phase)) ** 4; // sharp crest
    });
    const dotNodes = dots.map((dot, i) => {
      const crest = crests[i] ?? 0;
      return shapeNode(`${id}-${i}`, {
        geometry: circle(0, 0, options.radius),
        fill: options.accent ? mixColors(options.color, options.accent, crest) : options.color,
        transform: { x: dot.x, y: dot.y, scale: 1 + amplitude * crest },
      });
    });
    if (!options.glow) return groupNode(id, dotNodes);
    // Halos sit beneath all dots; the ones off the crest are hidden (the
    // node stays in the scene so renderers keep reusing its element).
    const r = options.radius * options.glow;
    const halos = dots.map((dot, i) => {
      const crest = crests[i] ?? 0;
      return shapeNode(`${id}-h${i}`, {
        geometry: circle(0, 0, r),
        fill: radialGradient(0, 0, r, [
          { offset: 0, color: withAlpha(glowColor, 0.7) },
          { offset: 0.3, color: withAlpha(glowColor, 0.32) },
          { offset: 0.65, color: withAlpha(glowColor, 0.08) },
          { offset: 1, color: withAlpha(glowColor, 0) },
        ]),
        opacity: crest,
        visible: crest > 0.02,
        transform: { x: dot.x, y: dot.y, scale: 0.6 + 0.4 * crest },
      });
    });
    return groupNode(id, [groupNode(`${id}-halos`, halos), groupNode(`${id}-dots`, dotNodes)]);
  };
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
  /**
   * Luminous links and nodes: each link gets a wide faint underglow, each
   * node a radial halo and a bright `core`. Gradients and wide strokes only, no blur.
   */
  readonly glow?: {
    readonly core: string;
    /** Halo radius as a multiple of the node radius. Default 5. */
    readonly halo?: number;
    /** Underglow width as a multiple of the link width. Default 5. */
    readonly linkSpread?: number;
    /** Underglow opacity. Default 0.14. */
    readonly linkOpacity?: number;
  };
  /**
   * Depth of field, 0–1: points get a seeded depth; far ones are smaller and
   * dimmer, near ones larger and brighter. Default 0 (all the same).
   */
  readonly depth?: number;
}

/** Drifting points joined to their nearest neighbours; loops seamlessly. */
export function nodeGraph(options: NodeGraphOptions): (t: number) => GroupNode {
  const { id, bounds, count } = options;
  const noise = createNoise(options.seed);
  const k = options.neighbours ?? 3;
  const depthAmount = clamp(options.depth ?? 0, 0, 1);
  const homes = Array.from({ length: count }, (_, i) => ({
    x: bounds.x + random(options.seed, 'x', i) * bounds.width,
    y: bounds.y + random(options.seed, 'y', i) * bounds.height,
    // 0 = far, 1 = near; 1 everywhere when depth is off.
    near: 1 - depthAmount * random(options.seed, 'depth', i),
  }));
  const { glow } = options;
  const linkWidth = options.linkWidth ?? 1.5;
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
        const geometry = pathGeometry(
          `M${from.x.toFixed(2)} ${from.y.toFixed(2)}L${to.x.toFixed(2)} ${to.y.toFixed(2)}`,
        );
        const near = ((homes[a]?.near ?? 1) + (homes[b]?.near ?? 1)) / 2;
        const opacity = (1 - d / options.linkDistance) * lerp(0.35, 1, near);
        const line = shapeNode(`${id}-l${key}`, {
          geometry,
          stroke: { color: options.linkColor, width: linkWidth, ...(glow ? { cap: 'round' } : {}) },
          opacity,
        });
        if (!glow) return line;
        return groupNode(`${id}-lg${key}`, [
          shapeNode(`${id}-lu${key}`, {
            geometry,
            stroke: {
              color: options.linkColor,
              width: linkWidth * (glow.linkSpread ?? 5),
              cap: 'round',
            },
            opacity: opacity * (glow.linkOpacity ?? 0.14),
          }),
          line,
        ]);
      });
    const nodes = points.map((point, i) => {
      const near = homes[i]?.near ?? 1;
      const radius = options.nodeRadius * (depthAmount > 0 ? lerp(0.55, 1.25, near) : 1);
      const brightness = lerp(0.45, 1, near);
      if (!glow) {
        return shapeNode(`${id}-n${i}`, {
          geometry: circle(0, 0, radius),
          fill: options.nodeColor,
          opacity: brightness,
          transform: point,
        });
      }
      const halo = radius * (glow.halo ?? 5);
      return groupNode(
        `${id}-n${i}`,
        [
          shapeNode(`${id}-n${i}-halo`, {
            geometry: circle(0, 0, halo),
            fill: radialGradient(0, 0, halo, [
              { offset: 0, color: withAlpha(options.nodeColor, 0.5) },
              { offset: 0.3, color: withAlpha(options.nodeColor, 0.16) },
              { offset: 1, color: withAlpha(options.nodeColor, 0) },
            ]),
          }),
          shapeNode(`${id}-n${i}-core`, {
            geometry: circle(0, 0, radius),
            fill: radialGradient(-radius * 0.3, -radius * 0.3, radius * 1.4, [
              { offset: 0, color: glow.core },
              { offset: 0.45, color: mixColors(options.nodeColor, glow.core, 0.35) },
              { offset: 1, color: options.nodeColor },
            ]),
          }),
        ],
        { opacity: brightness, transform: point },
      );
    });
    return groupNode(id, [groupNode(`${id}-links`, linkNodes), groupNode(`${id}-nodes`, nodes)]);
  };
}

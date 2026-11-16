/**
 * A mood board: a large canvas the camera travels across. Its background
 * (white, a faint grid fading out at the edges, and drifting aurora light),
 * the optimal zoom-and-pan flight between two views (van Wijk & Nuij 2003,
 * the model d3's zoom interpolation uses), parallax layers, and the blurs
 * that make a move feel filmed: motion blur from the camera's velocity and
 * defocus by distance from the focal plane.
 */
import {
  createNoise,
  groupNode,
  pathGeometry,
  radialGradient,
  rect,
  shapeNode,
  withAlpha,
  type Blur,
  type GroupNode,
  type SceneNode,
  type Transform,
} from '@html-animation-engine/core';

// ---------------------------------------------------------------------------
// Aurora
// ---------------------------------------------------------------------------

/** One pool of coloured light. */
export interface AuroraPool {
  /** Centre, in the layer's px. */
  readonly x: number;
  readonly y: number;
  /** Half-width and half-height of the pool (an ellipse). */
  readonly rx: number;
  readonly ry: number;
  /** Degrees. */
  readonly rotation?: number;
  readonly color: string;
  /** Peak opacity at the centre (keep it low: 0.1–0.3). */
  readonly alpha: number;
}

export interface AuroraOptions {
  readonly id: string;
  /** Seed for the drift. */
  readonly seed: string;
  /**
   * The pools at time `t` (a function, so pools can strengthen or change
   * colour with the story).
   */
  readonly pools: (t: number) => readonly AuroraPool[];
  /** How far pools wander, in px, and how long one wander takes, in s. Default 60, 18. */
  readonly drift?: number;
  readonly period?: number;
}

/**
 * Soft light pools that drift slowly on smooth seeded noise: a background
 * that is alive but never draws the eye. Draw it over a white base.
 */
export function aurora(options: AuroraOptions): (t: number) => GroupNode {
  const noise = createNoise(options.seed);
  const drift = options.drift ?? 60;
  const period = options.period ?? 18;
  const R = 100;
  return (t) =>
    groupNode(
      options.id,
      options.pools(t).map((pool, i) => {
        const u = t / period;
        const dx = drift * noise.noise2(u, i * 7.31);
        const dy = drift * noise.noise2(i * 3.17 + 50, u);
        const breathe = 1 + 0.06 * noise.noise2(u * 0.7, i * 11.9 + 100);
        return shapeNode(`${options.id}-${i}`, {
          geometry: rect(0, 0, 2 * R, 2 * R, R),
          fill: radialGradient(0, 0, R, [
            { offset: 0, color: withAlpha(pool.color, pool.alpha) },
            { offset: 0.45, color: withAlpha(pool.color, pool.alpha * 0.55) },
            { offset: 0.75, color: withAlpha(pool.color, pool.alpha * 0.18) },
            { offset: 1, color: withAlpha(pool.color, 0) },
          ]),
          transform: {
            x: pool.x + dx,
            y: pool.y + dy,
            rotation: pool.rotation ?? 0,
            scaleX: (pool.rx / R) * breathe,
            scaleY: (pool.ry / R) * breathe,
          },
        });
      }),
    );
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

export interface GridOptions {
  readonly id: string;
  /** Area to cover, in board px. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Major cell size; minor lines divide it into `divisions`. */
  readonly cell: number;
  readonly divisions?: number;
  readonly color: string;
  readonly majorColor: string;
  /** Line width in board px. Default 1. */
  readonly lineWidth?: number;
}

/** A fine drafting grid: solid major lines and dashed minor lines between them. */
export function gridBackdrop(options: GridOptions): GroupNode {
  const { x, y, width, height, cell } = options;
  const divisions = options.divisions ?? 3;
  const minor = cell / divisions;
  const major: string[] = [];
  const fine: string[] = [];
  const startX = Math.ceil(x / minor) * minor;
  const startY = Math.ceil(y / minor) * minor;
  for (let gx = startX; gx <= x + width; gx += minor) {
    const isMajor = Math.abs(gx / cell - Math.round(gx / cell)) < 1e-6;
    (isMajor ? major : fine).push(`M${gx} ${y}V${y + height}`);
  }
  for (let gy = startY; gy <= y + height; gy += minor) {
    const isMajor = Math.abs(gy / cell - Math.round(gy / cell)) < 1e-6;
    (isMajor ? major : fine).push(`M${x} ${gy}H${x + width}`);
  }
  const w = options.lineWidth ?? 1;
  return groupNode(options.id, [
    shapeNode(`${options.id}-minor`, {
      geometry: pathGeometry(fine.join('')),
      stroke: { color: options.color, width: w, dash: [3, 4] },
    }),
    shapeNode(`${options.id}-major`, {
      geometry: pathGeometry(major.join('')),
      stroke: { color: options.majorColor, width: w },
    }),
  ]);
}

/**
 * A white veil that fades in towards the edges of a frame-sized area, so a
 * grid beneath it melts into the white (draw it after the grid).
 */
export function edgeFade(
  id: string,
  frame: { width: number; height: number },
  color: string,
  inner = 0.35,
): SceneNode {
  const r = Math.hypot(frame.width, frame.height) / 2;
  return shapeNode(id, {
    geometry: rect(frame.width / 2, frame.height / 2, frame.width, frame.height),
    fill: radialGradient(frame.width / 2, frame.height / 2, r, [
      { offset: 0, color: withAlpha(color, 0) },
      { offset: inner, color: withAlpha(color, 0) },
      { offset: 1, color: withAlpha(color, 0.92) },
    ]),
  });
}

// ---------------------------------------------------------------------------
// The camera on the board
// ---------------------------------------------------------------------------

/** What the camera shows: the board point at the frame centre, and the zoom. */
export interface BoardView {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/**
 * The optimal flight from one view to another (van Wijk & Nuij): pans and
 * zooms together so the move feels smooth and efficient, pulling back
 * further for longer journeys. `at(s)` gives the view at s ∈ [0, 1] of the
 * path; `length` is the path's length in the model's units (use it to scale
 * durations, as d3 does). `rho` trades zooming against panning (√2 default).
 */
export function flightPath(
  from: BoardView,
  to: BoardView,
  frameWidth: number,
  rho = Math.SQRT2,
): { at(s: number): BoardView; length: number } {
  const [ux0, uy0, w0] = [from.x, from.y, frameWidth / from.zoom];
  const [ux1, uy1, w1] = [to.x, to.y, frameWidth / to.zoom];
  const dx = ux1 - ux0;
  const dy = uy1 - uy0;
  const d2 = dx * dx + dy * dy;
  const rho2 = rho * rho;
  const rho4 = rho2 * rho2;
  if (d2 < 1e-12) {
    const S = Math.log(w1 / w0) / rho;
    return {
      length: Math.abs(S),
      at: (s) => ({
        x: ux0 + s * dx,
        y: uy0 + s * dy,
        zoom: frameWidth / (w0 * Math.exp(rho * s * S)),
      }),
    };
  }
  const d1 = Math.sqrt(d2);
  const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1);
  const b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (r1 - r0) / rho;
  return {
    length: S,
    at: (s) => {
      const t = s * S;
      const coshr0 = Math.cosh(r0);
      const u = (w0 / (rho2 * d1)) * (coshr0 * Math.tanh(rho * t + r0) - Math.sinh(r0));
      const w = (w0 * coshr0) / Math.cosh(rho * t + r0);
      return { x: ux0 + u * dx, y: uy0 + u * dy, zoom: frameWidth / w };
    },
  };
}

/**
 * The transform that shows `view` on a frame, for a layer at `depth`
 * (1 = the board; below 1 = farther away, moving and zooming less;
 * above 1 = nearer). Put a layer's nodes in a group with this transform.
 */
export function viewTransform(
  view: BoardView,
  frame: { width: number; height: number },
  depth = 1,
  anchor: { x: number; y: number } = { x: 0, y: 0 },
): Transform {
  const zoom = Math.pow(view.zoom, depth);
  return {
    x: frame.width / 2,
    y: frame.height / 2,
    scale: zoom,
    originX: anchor.x + (view.x - anchor.x) * depth,
    originY: anchor.y + (view.y - anchor.y) * depth,
  };
}

/**
 * Motion blur for content moving at `velocity` px/s on screen, as a film
 * camera with a 180° shutter at `fps` would record it (exposure = half a
 * frame). A box blur of length L is close to a Gaussian with σ ≈ 0.29 L.
 * Returns undefined when the smear would be under half a pixel.
 */
export function motionBlur(
  velocity: { readonly x: number; readonly y: number },
  fps = 60,
  shutter = 0.5,
): Blur | undefined {
  const speed = Math.hypot(velocity.x, velocity.y);
  const length = (speed * shutter) / fps;
  if (length < 0.5) return undefined;
  return {
    x: 2 * 0.29 * length,
    y: 0,
    angle: (Math.atan2(velocity.y, velocity.x) * 180) / Math.PI,
  };
}

/** The screen velocity of the board's centre point under a moving view (px/s), by central difference. */
export function screenVelocity(
  view: (t: number) => BoardView,
  t: number,
  dt = 1 / 240,
): { x: number; y: number } {
  const a = view(t - dt);
  const b = view(t + dt);
  // A fixed board point at the current centre moves opposite to the camera, scaled by zoom.
  const zoom = (a.zoom + b.zoom) / 2;
  return { x: (-(b.x - a.x) / (2 * dt)) * zoom, y: (-(b.y - a.y) / (2 * dt)) * zoom };
}

/**
 * Defocus for something `distance` away from the focal plane (in the
 * scene's depth units): no blur inside `sharp`, then growing linearly by
 * `rate` blur px per unit, up to `max`.
 */
export function defocus(distance: number, rate: number, max = 24, sharp = 0): number {
  return Math.min(max, Math.max(0, Math.abs(distance) - sharp) * rate);
}

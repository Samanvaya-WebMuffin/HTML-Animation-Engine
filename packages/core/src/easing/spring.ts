import type { Ease } from './ease.js';

export interface SpringOptions {
  /** Spring constant k. Default 170. */
  stiffness?: number;
  /** Damping coefficient c. Default 26. */
  damping?: number;
  /** Mass m. Default 1. */
  mass?: number;
  /** Initial velocity in progress units per second. Default 0. */
  velocity?: number;
  /** Displacement below which the spring counts as settled. Default 0.001. */
  precision?: number;
}

/** A spring used as an ease. `duration` is its natural settle time in seconds. */
export type SpringEase = Ease & { readonly duration: number };

interface Solution {
  /** Displacement from the target at time t (starts at -1, settles to 0). */
  displacement(t: number): number;
  /** Upper bound on |displacement(t)|, decreasing once past its peak. */
  envelope(t: number): number;
}

const SETTLE_STEP = 1 / 1000;
const SETTLE_LIMIT = 120;

/**
 * Closed-form solution of m·x'' + c·x' + k·x = 0 with x(0) = -1, x'(0) = v0.
 * No numerical integration, so the value at any t is exact and repeatable.
 */
function solve(options: SpringOptions): Solution {
  const k = options.stiffness ?? 170;
  const c = options.damping ?? 26;
  const m = options.mass ?? 1;
  const v0 = options.velocity ?? 0;
  if (!(k > 0 && m > 0 && c >= 0)) {
    throw new RangeError('spring: stiffness and mass must be > 0 and damping >= 0.');
  }
  const omega0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));

  if (Math.abs(zeta - 1) < 1e-6) {
    // Critically damped: y = (A + B·t)·e^(-ω0·t)
    // y(0) = A = -1; y'(0) = B - ω0·A = v0  =>  B = v0 + ω0·A
    const a = -1;
    const b = v0 + omega0 * a;
    return {
      displacement: (t) => (a + b * t) * Math.exp(-omega0 * t),
      envelope: (t) => (Math.abs(a) + Math.abs(b) * t) * Math.exp(-omega0 * t),
    };
  }
  if (zeta < 1) {
    // Underdamped: y = e^(-ζω0·t)·(A·cos ωd·t + B·sin ωd·t)
    const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
    // y(0) = A = -1; y'(0) = -ζω0·A + ωd·B = v0
    const a = -1;
    const b = (v0 + zeta * omega0 * a) / omegaD;
    const amplitude = Math.hypot(a, b);
    return {
      displacement: (t) =>
        Math.exp(-zeta * omega0 * t) * (a * Math.cos(omegaD * t) + b * Math.sin(omegaD * t)),
      envelope: (t) => amplitude * Math.exp(-zeta * omega0 * t),
    };
  }
  // Overdamped: y = C1·e^(r1·t) + C2·e^(r2·t)
  const root = Math.sqrt(zeta * zeta - 1);
  const r1 = -omega0 * (zeta - root);
  const r2 = -omega0 * (zeta + root);
  const c2 = (v0 + r1) / (r2 - r1);
  const c1 = -1 - c2;
  return {
    displacement: (t) => c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t),
    envelope: (t) => Math.abs(c1) * Math.exp(r1 * t) + Math.abs(c2) * Math.exp(r2 * t),
  };
}

/** Spring position at `t` seconds, moving from 0 towards 1. */
export function springValue(t: number, options: SpringOptions = {}): number {
  return t <= 0 ? 0 : 1 + solve(options).displacement(t);
}

/**
 * Time in seconds after which the spring stays within `precision` of its
 * target. Found by stepping a fixed 1 ms grid against the decay envelope, so
 * the result is identical on every run.
 */
export function springSettleTime(options: SpringOptions = {}): number {
  const precision = options.precision ?? 0.001;
  const { envelope } = solve(options);
  for (let i = 1; i * SETTLE_STEP <= SETTLE_LIMIT; i++) {
    const t = i * SETTLE_STEP;
    if (envelope(t) < precision) return t;
  }
  throw new RangeError(`spring: does not settle within ${SETTLE_LIMIT} s; increase damping.`);
}

/**
 * A spring as an ease over its natural settle time. `ease(0) = 0` and
 * `ease(1) = 1` exactly; in between it may overshoot. Use `.duration` as the
 * clip length to play the spring at its physical speed.
 */
export function spring(options: SpringOptions = {}): SpringEase {
  const { displacement } = solve(options);
  const duration = springSettleTime(options);
  const ease = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : 1 + displacement(p * duration));
  return Object.assign(ease, { duration });
}

import type { Ease } from './ease.js';

const EPSILON = 1e-7;
const NEWTON_ITERATIONS = 8;
const BISECTION_ITERATIONS = 60;

/**
 * CSS-style `cubic-bezier(x1, y1, x2, y2)`. Solves x(s) = p for the curve
 * parameter s with a few Newton steps, and falls back to bisection whenever
 * Newton fails to converge. Bisection always converges because x(s) is
 * monotonic when x1, x2 ∈ [0, 1]. y may leave [0, 1] (overshoot).
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Ease {
  if (!(x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1)) {
    throw new RangeError(`cubicBezier: x1 and x2 must be in [0, 1], got ${x1}, ${x2}.`);
  }
  if (x1 === y1 && x2 === y2) return (p) => clampUnit(p);

  // Polynomial coefficients: B(s) = ((a·s + b)·s + c)·s
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;

  const solveS = (x: number): number => {
    let s = x;
    for (let i = 0; i < NEWTON_ITERATIONS; i++) {
      const error = sampleX(s) - x;
      if (Math.abs(error) < EPSILON) return s;
      const slope = slopeX(s);
      if (Math.abs(slope) < 1e-6) break;
      s -= error / slope;
      if (s < 0 || s > 1) break;
    }
    let lo = 0;
    let hi = 1;
    s = x;
    for (let i = 0; i < BISECTION_ITERATIONS; i++) {
      const value = sampleX(s);
      if (Math.abs(value - x) < EPSILON) return s;
      if (value < x) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return s;
  };

  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    return sampleY(solveS(p));
  };
}

function clampUnit(p: number): number {
  return p <= 0 ? 0 : p >= 1 ? 1 : p;
}

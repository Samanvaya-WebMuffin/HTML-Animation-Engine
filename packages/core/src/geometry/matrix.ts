import { DEG_TO_RAD } from '../math.js';
import type { Point } from '../tween.js';

/**
 * 2D affine matrix `[a, b, c, d, e, f]`, in the same order as Canvas
 * `setTransform` and CSS `matrix()`:
 *
 *   | a c e |
 *   | b d f |
 *   | 0 0 1 |
 */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `m1 · m2`: applies `m2` first, then `m1`. */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

/** Multiplies left to right: `compose(A, B, C) = A · B · C` (C applies first). */
export function compose(...matrices: Matrix[]): Matrix {
  return matrices.reduce(multiply, IDENTITY);
}

export function translate(x: number, y: number): Matrix {
  return [1, 0, 0, 1, x, y];
}

export function scale(sx: number, sy = sx): Matrix {
  return [sx, 0, 0, sy, 0, 0];
}

/** Rotation in degrees, clockwise on screen (y points down). */
export function rotate(degrees: number): Matrix {
  if (degrees === 0) return IDENTITY;
  const r = degrees * DEG_TO_RAD;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cos, sin, -sin, cos, 0, 0];
}

export function applyMatrix(m: Matrix, point: Point): Point {
  return { x: m[0] * point.x + m[2] * point.y + m[4], y: m[1] * point.x + m[3] * point.y + m[5] };
}

export function invert(m: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (det === 0) throw new RangeError('invert: matrix is singular.');
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

import { DEG_TO_RAD } from '../math.js';
import type { Vec3 } from './vec.js';

/**
 * 3D affine matrix as 12 numbers, row-major: the top three rows of a 4 × 4
 * matrix. `[m00 m01 m02 tx, m10 m11 m12 ty, m20 m21 m22 tz]`.
 */
export type Matrix3D = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export const IDENTITY_3D: Matrix3D = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

/** `a · b`: applies `b` first, then `a`. */
export function multiply3D(a: Matrix3D, b: Matrix3D): Matrix3D {
  const out: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      let v = c === 3 ? (a[r * 4 + 3] as number) : 0;
      for (let k = 0; k < 3; k++) v += (a[r * 4 + k] as number) * (b[k * 4 + c] as number);
      out.push(v);
    }
  }
  return out as unknown as Matrix3D;
}

export function apply3D(m: Matrix3D, p: Vec3): Vec3 {
  return {
    x: m[0] * p.x + m[1] * p.y + m[2] * p.z + m[3],
    y: m[4] * p.x + m[5] * p.y + m[6] * p.z + m[7],
    z: m[8] * p.x + m[9] * p.y + m[10] * p.z + m[11],
  };
}

export function translate3D(x: number, y: number, z: number): Matrix3D {
  return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
}

export function scale3D(x: number, y = x, z = x): Matrix3D {
  return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0];
}

/** Rotation about the x axis, degrees (right-hand rule). */
export function rotateX3D(degrees: number): Matrix3D {
  const c = Math.cos(degrees * DEG_TO_RAD);
  const s = Math.sin(degrees * DEG_TO_RAD);
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0];
}

export function rotateY3D(degrees: number): Matrix3D {
  const c = Math.cos(degrees * DEG_TO_RAD);
  const s = Math.sin(degrees * DEG_TO_RAD);
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0];
}

export function rotateZ3D(degrees: number): Matrix3D {
  const c = Math.cos(degrees * DEG_TO_RAD);
  const s = Math.sin(degrees * DEG_TO_RAD);
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0];
}

/** Position, Euler rotation (degrees, applied X then Y then Z) and scale. */
export interface Transform3D {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  readonly rotateX?: number;
  readonly rotateY?: number;
  readonly rotateZ?: number;
  readonly scale?: number;
}

export function transform3DMatrix(t: Transform3D | undefined): Matrix3D {
  if (!t) return IDENTITY_3D;
  return [
    translate3D(t.x ?? 0, t.y ?? 0, t.z ?? 0),
    rotateZ3D(t.rotateZ ?? 0),
    rotateY3D(t.rotateY ?? 0),
    rotateX3D(t.rotateX ?? 0),
    scale3D(t.scale ?? 1),
  ].reduce(multiply3D, IDENTITY_3D);
}

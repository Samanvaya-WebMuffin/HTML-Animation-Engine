/** Clamps `value` to `[min, max]`. */
export function clamp(value: number, min = 0, max = 1): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Linear interpolation. Written as `(1 - p) * a + p * b` so that `p = 0`
 * returns exactly `a` and `p = 1` returns exactly `b`.
 */
export function lerp(a: number, b: number, p: number): number {
  return (1 - p) * a + p * b;
}

/** Inverse of `lerp`: where `value` sits between `a` and `b` (unclamped). */
export function invLerp(a: number, b: number, value: number): number {
  return a === b ? 0 : (value - a) / (b - a);
}

/** Maps `value` from `[inMin, inMax]` to `[outMin, outMax]`, clamped. */
export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  return lerp(outMin, outMax, clamp(invLerp(inMin, inMax, value)));
}

/** Always-positive modulo. */
export function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

/** Interpolates angles in degrees along the shortest arc. */
export function lerpAngle(a: number, b: number, p: number): number {
  const delta = mod(b - a + 180, 360) - 180;
  return p === 1 ? b : a + delta * p;
}

export const DEG_TO_RAD = Math.PI / 180;

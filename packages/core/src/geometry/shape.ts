import type { Point } from '../tween.js';
import { flattenPath, formatNumber, parsePath, resampleClosed, signedArea } from './path.js';

/**
 * A rounded rectangle centred on (`x`, `y`). Pills (radius = half the short
 * side) and circles (width = height, radius = half) are the same kind, so
 * rect → pill → circle interpolates exactly.
 */
export interface RectGeometry {
  readonly kind: 'rect';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
}

/** Any SVG path, in local coordinates. */
export interface PathGeometry {
  readonly kind: 'path';
  readonly d: string;
}

export type Geometry = RectGeometry | PathGeometry;

export function rect(
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 0,
): RectGeometry {
  return { kind: 'rect', x, y, width, height, radius };
}

export function pill(x: number, y: number, width: number, height: number): RectGeometry {
  return rect(x, y, width, height, Math.min(width, height) / 2);
}

export function circle(x: number, y: number, r: number): RectGeometry {
  return rect(x, y, 2 * r, 2 * r, r);
}

export function pathGeometry(d: string): PathGeometry {
  return { kind: 'path', d };
}

/** Radius actually drawn: never more than half the shorter side. */
export function effectiveRadius(g: RectGeometry): number {
  return Math.max(0, Math.min(g.radius, Math.abs(g.width) / 2, Math.abs(g.height) / 2));
}

/** Cubic approximation constant for a quarter circle. */
const KAPPA = 0.5522847498307936;

/**
 * Geometry as an SVG path `d`. Rounded rectangles start at the top centre and
 * run clockwise, so every rect-family shape has the same starting point.
 */
export function geometryToPath(g: Geometry): string {
  if (g.kind === 'path') return g.d;
  const n = (v: number) => formatNumber(v);
  const r = effectiveRadius(g);
  const k = r * KAPPA;
  const left = g.x - g.width / 2;
  const right = g.x + g.width / 2;
  const top = g.y - g.height / 2;
  const bottom = g.y + g.height / 2;
  return [
    `M${n(g.x)} ${n(top)}`,
    `L${n(right - r)} ${n(top)}`,
    `C${n(right - r + k)} ${n(top)} ${n(right)} ${n(top + r - k)} ${n(right)} ${n(top + r)}`,
    `L${n(right)} ${n(bottom - r)}`,
    `C${n(right)} ${n(bottom - r + k)} ${n(right - r + k)} ${n(bottom)} ${n(right - r)} ${n(bottom)}`,
    `L${n(left + r)} ${n(bottom)}`,
    `C${n(left + r - k)} ${n(bottom)} ${n(left)} ${n(bottom - r + k)} ${n(left)} ${n(bottom - r)}`,
    `L${n(left)} ${n(top + r)}`,
    `C${n(left)} ${n(top + r - k)} ${n(left + r - k)} ${n(top)} ${n(left + r)} ${n(top)}`,
    'Z',
  ].join('');
}

/**
 * Samples the outline of `g` at `count` points evenly spaced by arc length,
 * clockwise. The geometry must be a single closed contour.
 */
export function sampleOutline(g: Geometry, count: number): Point[] {
  const contours = flattenPath(parsePath(geometryToPath(g)));
  if (contours.length !== 1) {
    throw new RangeError(
      `Shapes used in a morph must have exactly one contour; this one has ${contours.length}. ` +
        'Merge subpaths into one outline, or morph each contour as its own shape.',
    );
  }
  let points = (contours[0] as { points: Point[] }).points;
  if (signedArea(points) < 0) points = [...points].reverse();
  return resampleClosed(points, count);
}

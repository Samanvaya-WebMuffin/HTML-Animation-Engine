import type { Point } from '../tween.js';

/** Normalised path command: absolute, and only M, L, C or Z. */
export type PathCommand =
  | { readonly type: 'M' | 'L'; readonly x: number; readonly y: number }
  | {
      readonly type: 'C';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly x: number;
      readonly y: number;
    }
  | { readonly type: 'Z' };

function tokenize(d: string): (string | number)[] {
  const tokens: (string | number)[] = [];
  const pattern = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(d))) {
    if (match[1]) tokens.push(match[1]);
    else if (match[2]) tokens.push(parseFloat(match[2]));
  }
  return tokens;
}

/**
 * Parses an SVG path `d` string and normalises it to absolute M/L/C/Z
 * commands. Quadratics become cubics; arcs become cubic segments of at most
 * 90° each.
 */
export function parsePath(d: string): PathCommand[] {
  const tokens = tokenize(d);
  const out: PathCommand[] = [];
  let i = 0;
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  let prevCubic: { x: number; y: number } | null = null; // last cubic control point 2
  let prevQuad: { x: number; y: number } | null = null; // last quadratic control point
  let command = '';

  const num = (): number => {
    const token = tokens[i++];
    if (typeof token !== 'number') throw new SyntaxError(`parsePath: expected a number in "${d}".`);
    return token;
  };

  while (i < tokens.length) {
    const token = tokens[i];
    if (typeof token === 'string') {
      command = token;
      i++;
    } else if (!command) {
      throw new SyntaxError(`parsePath: path must start with a command: "${d}".`);
    }
    const lower = command.toLowerCase();
    const relative = command === lower && lower !== 'z';
    const ox = relative ? cx : 0;
    const oy = relative ? cy : 0;
    let nextCubic: { x: number; y: number } | null = null;
    let nextQuad: { x: number; y: number } | null = null;

    switch (lower) {
      case 'm': {
        cx = ox + num();
        cy = oy + num();
        startX = cx;
        startY = cy;
        out.push({ type: 'M', x: cx, y: cy });
        command = relative ? 'l' : 'L'; // implicit lineto for further pairs
        break;
      }
      case 'l':
        cx = ox + num();
        cy = oy + num();
        out.push({ type: 'L', x: cx, y: cy });
        break;
      case 'h':
        cx = ox + num();
        out.push({ type: 'L', x: cx, y: cy });
        break;
      case 'v':
        cy = oy + num();
        out.push({ type: 'L', x: cx, y: cy });
        break;
      case 'c': {
        const x1 = ox + num();
        const y1 = oy + num();
        const x2 = ox + num();
        const y2 = oy + num();
        cx = ox + num();
        cy = oy + num();
        out.push({ type: 'C', x1, y1, x2, y2, x: cx, y: cy });
        nextCubic = { x: x2, y: y2 };
        break;
      }
      case 's': {
        const x1 = prevCubic ? 2 * cx - prevCubic.x : cx;
        const y1 = prevCubic ? 2 * cy - prevCubic.y : cy;
        const x2 = ox + num();
        const y2 = oy + num();
        cx = ox + num();
        cy = oy + num();
        out.push({ type: 'C', x1, y1, x2, y2, x: cx, y: cy });
        nextCubic = { x: x2, y: y2 };
        break;
      }
      case 'q':
      case 't': {
        const reflected: { x: number; y: number } = prevQuad
          ? { x: 2 * cx - prevQuad.x, y: 2 * cy - prevQuad.y }
          : { x: cx, y: cy };
        const qx: number = lower === 'q' ? ox + num() : reflected.x;
        const qy: number = lower === 'q' ? oy + num() : reflected.y;
        const x = ox + num();
        const y = oy + num();
        out.push({
          type: 'C',
          x1: cx + (2 / 3) * (qx - cx),
          y1: cy + (2 / 3) * (qy - cy),
          x2: x + (2 / 3) * (qx - x),
          y2: y + (2 / 3) * (qy - y),
          x,
          y,
        });
        cx = x;
        cy = y;
        nextQuad = { x: qx, y: qy };
        break;
      }
      case 'a': {
        const rx = num();
        const ry = num();
        const rotation = num();
        const largeArc = num() !== 0;
        const sweep = num() !== 0;
        const x = ox + num();
        const y = oy + num();
        out.push(...arcToCubics(cx, cy, rx, ry, rotation, largeArc, sweep, x, y));
        cx = x;
        cy = y;
        break;
      }
      case 'z':
        out.push({ type: 'Z' });
        cx = startX;
        cy = startY;
        command = '';
        break;
      default:
        throw new SyntaxError(`parsePath: unknown command "${command}".`);
    }
    prevCubic = nextCubic;
    prevQuad = nextQuad;
  }
  return out;
}

/** SVG arc (endpoint form) → cubic Béziers, per SVG 1.1 implementation notes F.6. */
function arcToCubics(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  rotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
): PathCommand[] {
  if (x1 === x2 && y1 === y2) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [{ type: 'L', x: x2, y: y2 }];

  const phi = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let factor = Math.sqrt(Math.max(0, numerator / denominator));
  if (largeArc === sweep) factor = -factor;
  const cxp = (factor * rx * y1p) / ry;
  const cyp = (-factor * ry * x1p) / rx;
  const centerX = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const centerY = sin * cxp + cos * cyp + (y1 + y2) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / segments;
  const k = (4 / 3) * Math.tan(step / 4);
  const point = (t: number) => ({
    x: centerX + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    y: centerY + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  });
  const derivative = (t: number) => ({
    x: -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    y: -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
  });

  const out: PathCommand[] = [];
  for (let s = 0; s < segments; s++) {
    const t0 = theta1 + s * step;
    const t1 = t0 + step;
    const p0 = point(t0);
    const p1 = s === segments - 1 ? { x: x2, y: y2 } : point(t1);
    const d0 = derivative(t0);
    const d1 = derivative(t1);
    out.push({
      type: 'C',
      x1: p0.x + k * d0.x,
      y1: p0.y + k * d0.y,
      x2: p1.x - k * d1.x,
      y2: p1.y - k * d1.y,
      x: p1.x,
      y: p1.y,
    });
  }
  return out;
}

/** Number formatting for generated paths: fixed precision, no "-0". */
export function formatNumber(value: number, digits = 3): string {
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** Serialises normalised commands back to a `d` string. */
export function serializePath(commands: readonly PathCommand[], digits = 3): string {
  const n = (v: number) => formatNumber(v, digits);
  return commands
    .map((c) => {
      switch (c.type) {
        case 'M':
        case 'L':
          return `${c.type}${n(c.x)} ${n(c.y)}`;
        case 'C':
          return `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
        case 'Z':
          return 'Z';
      }
    })
    .join('');
}

/** A closed polygon as a `d` string. */
export function polygonPath(points: readonly Point[], digits = 3): string {
  if (points.length === 0) return '';
  const n = (v: number) => formatNumber(v, digits);
  return `${points.map((p, i) => `${i === 0 ? 'M' : 'L'}${n(p.x)} ${n(p.y)}`).join('')}Z`;
}

/** Segments per cubic when flattening; fixed so output is repeatable. */
const CUBIC_SUBDIVISIONS = 24;

/**
 * Flattens commands into polylines, one per subpath (contour). `closed`
 * records whether the contour ended with Z.
 */
export function flattenPath(
  commands: readonly PathCommand[],
): { points: Point[]; closed: boolean }[] {
  const contours: { points: Point[]; closed: boolean }[] = [];
  let current: { points: Point[]; closed: boolean } | null = null;
  let x = 0;
  let y = 0;
  for (const c of commands) {
    if (c.type === 'M') {
      current = { points: [{ x: c.x, y: c.y }], closed: false };
      contours.push(current);
      x = c.x;
      y = c.y;
      continue;
    }
    if (!current) {
      current = { points: [{ x, y }], closed: false };
      contours.push(current);
    }
    if (c.type === 'L') {
      current.points.push({ x: c.x, y: c.y });
      x = c.x;
      y = c.y;
    } else if (c.type === 'C') {
      for (let s = 1; s <= CUBIC_SUBDIVISIONS; s++) {
        const t = s / CUBIC_SUBDIVISIONS;
        const u = 1 - t;
        current.points.push({
          x: u * u * u * x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
          y: u * u * u * y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
        });
      }
      x = c.x;
      y = c.y;
    } else {
      current.closed = true;
      const first = current.points[0];
      if (first) {
        x = first.x;
        y = first.y;
      }
      current = null;
    }
  }
  return contours.filter((contour) => contour.points.length > 1);
}

function polylineLength(points: readonly Point[], closed: boolean): number {
  let length = 0;
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = points[i] as Point;
    const b = points[(i + 1) % points.length] as Point;
    length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return length;
}

/** Total length of a path (all contours), for stroke-dash effects. */
export function pathLength(d: string): number {
  return flattenPath(parsePath(d)).reduce(
    (sum, contour) => sum + polylineLength(contour.points, contour.closed),
    0,
  );
}

/**
 * Resamples a closed polyline to `count` points evenly spaced by arc length,
 * starting at its first point.
 */
export function resampleClosed(points: readonly Point[], count: number): Point[] {
  const ring = [...points];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && first.x === last.x && first.y === last.y) ring.pop();
  const total = polylineLength(ring, true);
  if (total === 0 || ring.length === 0)
    return Array.from({ length: count }, () => first ?? { x: 0, y: 0 });

  const out: Point[] = [];
  let segment = 0;
  let segmentStart = 0;
  for (let k = 0; k < count; k++) {
    const target = (k / count) * total;
    for (;;) {
      const a = ring[segment % ring.length] as Point;
      const b = ring[(segment + 1) % ring.length] as Point;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (segmentStart + length >= target || segment >= ring.length - 1) {
        const p = length === 0 ? 0 : (target - segmentStart) / length;
        out.push({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p });
        break;
      }
      segmentStart += length;
      segment++;
    }
  }
  return out;
}

/** Signed area of a closed polygon; positive is clockwise on screen (y down). */
export function signedArea(points: readonly Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i] as Point;
    const b = points[(i + 1) % points.length] as Point;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

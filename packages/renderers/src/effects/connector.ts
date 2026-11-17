import {
  clamp,
  flattenPath,
  groupNode,
  mixColors,
  parsePath,
  pathGeometry,
  progress,
  radialGradient,
  rect,
  shapeNode,
  withAlpha,
  type Ease,
  type GroupNode,
  type SceneNode,
} from '@html-animation-engine/core';

export interface Point2 {
  readonly x: number;
  readonly y: number;
}

/** A path through `points` with each corner rounded to `radius` (Glean-style routed lines). */
export function roundedRoute(input: readonly Point2[], radius: number): string {
  // Repeated points (an elbow between aligned ends) would make a zero-length corner.
  const points = input.filter((p, i) => {
    const prev = input[i - 1];
    return !prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 1e-6;
  });
  const [first] = points;
  if (!first) return '';
  let d = `M${first.x} ${first.y}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i] as Point2;
    const prev = points[i - 1] as Point2;
    const next = points[i + 1];
    if (!next) {
      d += `L${p.x} ${p.y}`;
      break;
    }
    const inLen = Math.hypot(p.x - prev.x, p.y - prev.y);
    const outLen = Math.hypot(next.x - p.x, next.y - p.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const a = { x: p.x - ((p.x - prev.x) / inLen) * r, y: p.y - ((p.y - prev.y) / inLen) * r };
    const b = { x: p.x + ((next.x - p.x) / outLen) * r, y: p.y + ((next.y - p.y) / outLen) * r };
    d += `L${a.x} ${a.y}Q${p.x} ${p.y} ${b.x} ${b.y}`;
  }
  return d;
}

/** An elbow route from `a` to `b`: across, then along, then across again (or the other way round). */
export function elbow(
  a: Point2,
  b: Point2,
  first: 'horizontal' | 'vertical' = 'horizontal',
): Point2[] {
  if (first === 'horizontal') {
    const mx = (a.x + b.x) / 2;
    return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
  }
  const my = (a.y + b.y) / 2;
  return [a, { x: a.x, y: my }, { x: b.x, y: my }, b];
}

export interface ConnectorPulse {
  /** When it leaves the start, and how long it takes to reach the end. */
  readonly at: number;
  readonly duration: number;
  readonly color: string;
  /** Radius of the bright core (px). Default 3.5. */
  readonly size?: number;
}

export interface ConnectorOptions {
  readonly id: string;
  /** The path (e.g. from `roundedRoute`). */
  readonly d: string;
  readonly color: string;
  readonly width?: number;
  /** The line draws on from its start over this window. */
  readonly start: number;
  readonly duration: number;
  readonly ease: Ease;
  /** Junction dots, as fractions along the path; each appears as the line reaches it. */
  readonly dots?: readonly number[];
  readonly dotColor?: string;
  readonly pulses?: readonly ConnectorPulse[];
  readonly pulseEase?: Ease;
  /**
   * Make the pulses and junction dots glow (0–1): a wide soft halo, a
   * brighter inner glow and a near-white core, as light rather than paint.
   */
  readonly glow?: number;
}

/** A routed line that draws itself on, with junction dots and light pulses travelling along it. */
export function connector(options: ConnectorOptions): (t: number) => GroupNode {
  const points = flattenPath(parsePath(options.d)).flatMap((c) => c.points);
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    lengths.push((lengths[i - 1] ?? 0) + (a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0));
  }
  const total = lengths[lengths.length - 1] ?? 0;
  const pointAt = (f: number): Point2 => {
    const s = clamp(f) * total;
    let i = 1;
    while (i < lengths.length - 1 && (lengths[i] ?? 0) < s) i++;
    const a = points[i - 1] ?? { x: 0, y: 0 };
    const b = points[i] ?? a;
    const s0 = lengths[i - 1] ?? 0;
    const seg = (lengths[i] ?? s0) - s0;
    const u = seg > 0 ? (s - s0) / seg : 0;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  };
  const geometry = pathGeometry(options.d);
  const width = options.width ?? 2;
  const glow = clamp(options.glow ?? 0);
  return (t) => {
    const drawn = progress(t, options.start, options.duration, options.ease);
    const nodes: SceneNode[] = [];
    if (drawn <= 0) return groupNode(options.id, nodes);
    nodes.push(
      shapeNode(`${options.id}-line`, {
        geometry,
        stroke: {
          color: options.color,
          width,
          cap: 'round',
          join: 'round',
          ...(drawn < 1 ? { dash: [total * drawn, total + 1] } : {}),
        },
      }),
    );
    (options.dots ?? []).forEach((f, k) => {
      const shown = clamp((drawn - f) / 0.04);
      if (shown <= 0) return;
      const p = pointAt(f);
      const color = options.dotColor ?? options.color;
      nodes.push(
        shapeNode(`${options.id}-dot${k}`, {
          geometry: rect(p.x, p.y, 7, 7, 3.5),
          fill: color,
          opacity: shown,
          ...(glow > 0
            ? { shadow: { x: 0, y: 0, blur: 12, color: withAlpha(color, 0.7 * glow) } }
            : {}),
        }),
      );
    });
    (options.pulses ?? []).forEach((pulse, k) => {
      const f = progress(t, pulse.at, pulse.duration, options.pulseEase);
      if (f <= 0 || f >= 1 || f > drawn) return;
      const p = pointAt(f);
      const r = pulse.size ?? 3.5;
      const fade = Math.min(1, f * 6, (1 - f) * 6);
      // The halo grows with the glow: a wide soft light round a bright core.
      const reach = r * (4 + 6 * glow);
      nodes.push(
        shapeNode(`${options.id}-halo${k}`, {
          geometry: rect(p.x, p.y, 2 * reach, 2 * reach, reach),
          fill: radialGradient(p.x, p.y, reach, [
            { offset: 0, color: withAlpha(pulse.color, 0.45 + 0.25 * glow) },
            { offset: 0.35, color: withAlpha(pulse.color, 0.18 + 0.14 * glow) },
            { offset: 1, color: withAlpha(pulse.color, 0) },
          ]),
          opacity: fade,
        }),
        shapeNode(`${options.id}-pulse${k}`, {
          geometry: rect(p.x, p.y, 2 * r, 2 * r, r),
          fill:
            glow > 0
              ? radialGradient(p.x, p.y, r, [
                  { offset: 0, color: mixColors(pulse.color, '#ffffff', 0.75 * glow) },
                  { offset: 1, color: pulse.color },
                ])
              : pulse.color,
          opacity: fade,
          ...(glow > 0
            ? { shadow: { x: 0, y: 0, blur: 3 * r, color: withAlpha(pulse.color, 0.8 * glow) } }
            : {}),
        }),
      );
    });
    return groupNode(options.id, nodes);
  };
}

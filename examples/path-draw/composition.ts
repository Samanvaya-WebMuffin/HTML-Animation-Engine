import {
  circle,
  clamp,
  flattenPath,
  groupNode,
  mixColors,
  parsePath,
  pathLength,
  progress,
  radialGradient,
  shapeNode,
  type Ease,
  withAlpha,
  type SceneNode,
} from '@html-animation-engine/core';
import {
  backdrop,
  defineSceneComposition,
  glowShadows,
  pathDraw,
  type BackdropLight,
} from '@html-animation-engine/renderers';
import { exampleDefaults, lighting, theme } from '../index.js';

const { colors, easing } = theme;
const W = exampleDefaults.width;
const H = exampleDefaults.height;

interface Line {
  readonly id: string;
  readonly d: string;
  readonly x: number;
  readonly y: number;
  readonly color: string;
  readonly width: number;
  readonly start: number;
  readonly duration: number;
  readonly ease: Ease;
}

const lines: Line[] = [
  {
    id: 'swoosh',
    d: 'M-420 60 C-300 -120 -160 160 -40 0 S180 -150 260 20 Q330 140 420 -40',
    x: 640,
    y: 320,
    color: colors.lime,
    width: 14,
    start: 0.3,
    duration: 1.4,
    ease: easing.camera,
  },
  {
    id: 'underline',
    d: 'M-300 0 H300',
    x: 640,
    y: 470,
    color: colors.pink,
    width: 8,
    start: 1.4,
    duration: 0.6,
    ease: easing.enter,
  },
  {
    id: 'ring',
    d: 'M0 -60 A60 60 0 1 1 -0.01 -60',
    x: 1080,
    y: 540,
    color: colors.blue,
    width: 10,
    start: 0.8,
    duration: 1.2,
    ease: easing.enter,
  },
];

/** The point at arc length `s` along a polyline. */
function pointAt(points: readonly { x: number; y: number }[], s: number) {
  let left = s;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) break;
    const step = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= step && step > 0) {
      const k = left / step;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    left -= step;
  }
  return points.at(-1) ?? { x: 0, y: 0 };
}

// Each line is a neon tube: a glowing coloured stroke, a pale hot core and a
// spark at the pen tip while it draws.
const tubes = lines.map((line) => {
  const options = { d: line.d, x: line.x, y: line.y, start: line.start, duration: line.duration };
  const glow = pathDraw({
    ...options,
    id: line.id,
    color: line.color,
    width: line.width,
    ease: line.ease,
    shadow: glowShadows(lighting, line.color, {
      radius: Math.max(line.width * 3, 30),
      strength: 1.1,
    }),
  });
  const core = pathDraw({
    ...options,
    id: `${line.id}-core`,
    color: mixColors(line.color, colors.light, 0.6),
    width: line.width * 0.35,
    ease: line.ease,
  });
  const points = flattenPath(parsePath(line.d)).flatMap((contour) => contour.points);
  // pathDraw pads its dash by the same amount, so the tip lands where the stroke ends.
  const padded = pathLength(line.d) * 1.02 + 1;
  const spark = (t: number): SceneNode | null => {
    const p = progress(t, line.start, line.duration, line.ease);
    if (!(p > 0 && p < 1)) return null;
    const tip = pointAt(points, p * padded);
    const halo = line.width * 3.2;
    // A radial-gradient halo (no blur filter needed) around a white-hot dot.
    return groupNode(
      `${line.id}-spark`,
      [
        shapeNode(`${line.id}-spark-halo`, {
          geometry: circle(0, 0, halo),
          fill: radialGradient(0, 0, halo, [
            { offset: 0, color: withAlpha(mixColors(line.color, colors.light, 0.5), 0.9) },
            { offset: 0.3, color: withAlpha(line.color, 0.45) },
            { offset: 1, color: withAlpha(line.color, 0) },
          ]),
        }),
        shapeNode(`${line.id}-spark-dot`, {
          geometry: circle(0, 0, line.width * 0.5),
          fill: colors.light,
        }),
      ],
      { opacity: clamp((1 - p) * 8), transform: { x: line.x + tip.x, y: line.y + tip.y } },
    );
  };
  return { line, glow, core, spark };
});

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'path-draw',
  title: 'Path draw',
  duration: 3.5,
  background: colors.ink,
  renderer: 'svg',
  scene(t) {
    // The tubes light the wall behind them as they are drawn.
    const lights: BackdropLight[] = tubes.map(({ line }) => ({
      x: line.x,
      y: line.y,
      radius: line.id === 'swoosh' ? 520 : 280,
      color: line.color,
      alpha:
        (line.id === 'swoosh' ? 0.14 : 0.09) * progress(t, line.start, line.duration, line.ease),
    }));
    return {
      world: [
        backdrop('backdrop', lighting, { width: W, height: H, lights }),
        ...tubes.flatMap(({ glow, core, spark }) => {
          const tip = spark(t);
          return [glow(t), core(t), ...(tip ? [tip] : [])];
        }),
      ],
    };
  },
});

import {
  mixColors,
  radialGradient,
  rect,
  shapeNode,
  vec3,
  withAlpha,
} from '@html-animation-engine/core';
import { backdrop, defineSceneComposition, flyThrough } from '@html-animation-engine/renderers';
import { exampleDefaults, lighting, theme } from '../index.js';
import { cue, pad, pluck, soundtrack, whoosh } from '../sounds.js';

const { colors } = theme;
const W = exampleDefaults.width;
const H = exampleDefaults.height;

// The vanishing point glows violet. The fog matches the glow's lightness but
// is nearly grey: distant objects dissolve into the light, and keep their own
// hue on the way (OKLCH hue moves in proportion to chroma; a vivid violet fog
// would turn lime objects teal).
const horizon = mixColors(colors.violet, colors.ink, 0.72);
const fog = mixColors(mixColors(colors.muted, colors.violet, 0.25), colors.ink, 0.66);

const flight = flyThrough({
  id: 'flight',
  viewport: { width: W, height: H },
  seed: 'flight',
  count: 70,
  field: { width: 1600, height: 1000, length: 3200 },
  clearance: 170,
  size: [60, 160],
  palette: [colors.lime, colors.pink, colors.blue, colors.orange, colors.violet],
  loopDuration: 6,
  fog: { color: fog, near: 500, far: 3000 },
  fov: 62,
  light: {
    direction: vec3(-0.35, -0.6, -0.7),
    ambient: 0.38,
    specular: { strength: 0.35, shininess: 18, color: colors.light },
    rim: { strength: 0.18, power: 3, color: colors.light },
  },
  dust: { count: 70, color: colors.paper, streak: 0.06, width: 2.4, opacity: 0.45 },
});

const sky = backdrop('sky', lighting, {
  width: W,
  height: H,
  centre: horizon,
  edge: colors.shade,
  focus: { x: W / 2, y: H / 2 },
  lights: [
    { x: W / 2, y: H / 2, radius: 360, color: colors.violet, alpha: 0.28 },
    { x: W / 2, y: H / 2, radius: 140, color: colors.paper, alpha: 0.08 },
  ],
});

const vignette = shapeNode('vignette', {
  geometry: rect(W / 2, H / 2, W, H),
  fill: radialGradient(W / 2, H / 2, W * 0.62, [
    { offset: 0, color: withAlpha(lighting.shadow, 0) },
    { offset: 0.6, color: withAlpha(lighting.shadow, 0.05) },
    { offset: 1, color: withAlpha(lighting.shadow, 0.6) },
  ]),
});

/** Objects that pass closest to the camera (seconds), from their depth / forward speed. */
const PASSES = [0.248, 0.34, 2.392, 2.546, 4.111, 4.932, 5.49, 5.941];

/** A steady rush of air, a whoosh as each near object passes, and a note for each. */
const audio = soundtrack([
  cue(0, pad(4.6, { chord: 'lift', attack: 0.3, release: 1.4 })),
  cue(0, whoosh(5.9, { from: 260, to: 520, peak: 0.5, gain: 0.7 })),
  PASSES.map((t, i) => [
    cue(
      Math.max(0, t - 0.35),
      whoosh(0.45, { from: 500, to: 3400, peak: 0.8, pan: i % 2 ? 0.45 : -0.45 }),
    ),
    cue(
      t,
      pluck({
        degree: [4, 5, 2, 4, 7, 5, 4, 2][i] ?? 0,
        octave: 1,
        gain: 0.55,
        pan: i % 2 ? 0.3 : -0.3,
      }),
    ),
  ]),
]);

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'fly-through',
  audio,
  title: 'Flying past 3D objects',
  duration: 6,
  background: colors.ink,
  renderer: 'canvas',
  scene(t) {
    return { world: [sky, flight(t)], screen: [vignette] };
  },
});

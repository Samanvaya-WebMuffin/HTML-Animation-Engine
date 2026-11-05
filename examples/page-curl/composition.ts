import {
  mixColors,
  radialGradient,
  rect,
  shapeNode,
  vec3,
  withAlpha,
} from '@html-animation-engine/core';
import {
  backdrop,
  defineSceneComposition,
  elevationShadows,
  pageCurl,
} from '@html-animation-engine/renderers';
import { exampleDefaults, lighting, theme } from '../index.js';

const { colors } = theme;
const W = exampleDefaults.width;
const H = exampleDefaults.height;

const page = pageCurl({
  id: 'page',
  viewport: { width: W, height: H },
  camera: { position: vec3(0, -760, 1150), target: vec3(0, -30, 0), fov: 40 },
  width: 520,
  height: 680,
  paper: colors.paper,
  back: mixColors(colors.paper, colors.muted, 0.3),
  ink: mixColors(colors.paper, colors.muted, 0.65),
  shadow: withAlpha(lighting.shadow, 0.5),
  contactShadow: withAlpha(lighting.shadow, 0.35),
  // The page rests on the desk: a tight contact shadow and a soft ambient one.
  rest: elevationShadows(lighting, 'mid', { strength: 1.1, lift: 0.6 }),
  corner: 'bottom-right',
  reach: 210,
  radius: 55,
  wobble: 0.08,
  period: 3,
  seed: 'page',
  // A desk lamp up and to the left: a broad, soft sheen across the paper and
  // a brighter band where the curl turns towards it.
  light: {
    direction: vec3(-0.3, 0.5, -1),
    ambient: 0.45,
    specular: { strength: 0.22, shininess: 10, color: colors.light, perVertex: true },
  },
});

// Lamp light falling off towards the frame edges, over everything.
const vignette = shapeNode('vignette', {
  geometry: rect(W / 2, H / 2, W, H),
  fill: radialGradient(W * 0.45, H * 0.42, W * 0.72, [
    { offset: 0, color: withAlpha(lighting.shadow, 0) },
    { offset: 0.55, color: withAlpha(lighting.shadow, 0.08) },
    { offset: 1, color: withAlpha(lighting.shadow, 0.55) },
  ]),
});

const desk = backdrop('desk', lighting, {
  width: W,
  height: H,
  // A desk a few shades lighter than the frame, so the paper's shadows read on it.
  centre: mixColors(colors.surface, colors.muted, 0.38),
  edge: colors.ink,
  focus: { x: W * 0.42, y: H * 0.38 },
  lights: [{ x: W * 0.22, y: H * 0.05, radius: 760, color: colors.orange, alpha: 0.1 }],
});

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'page-curl',
  title: 'Page corner lifted',
  duration: 6,
  background: colors.surface,
  renderer: 'canvas',
  scene(t) {
    return { world: [desk, page(t)], screen: [vignette] };
  },
});

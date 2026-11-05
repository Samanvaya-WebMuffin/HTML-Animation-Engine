import { mixColors, vec3, withAlpha } from '@html-animation-engine/core';
import { defineSceneComposition, pageCurl } from '@html-animation-engine/renderers';
import { exampleDefaults, theme } from '../index.js';

const { colors } = theme;

const page = pageCurl({
  id: 'page',
  viewport: { width: 1280, height: 720 },
  camera: { position: vec3(0, -760, 1150), target: vec3(0, -30, 0), fov: 40 },
  width: 520,
  height: 680,
  paper: colors.paper,
  back: mixColors(colors.paper, colors.muted, 0.3),
  ink: mixColors(colors.paper, colors.muted, 0.65),
  shadow: withAlpha(colors.ink, 0.45),
  corner: 'bottom-right',
  reach: 210,
  radius: 55,
  wobble: 0.08,
  period: 3,
  seed: 'page',
});

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'page-curl',
  title: 'Page corner lifted',
  duration: 6,
  background: colors.surface,
  renderer: 'canvas',
  scene(t) {
    return { world: [page(t)] };
  },
});

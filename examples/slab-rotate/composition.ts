import { mixColors, progress, vec3, type OrbitOptions } from '@html-animation-engine/core';
import { backdrop, defineSceneComposition, slab3d } from '@html-animation-engine/renderers';
import { exampleDefaults, lighting, theme } from '../index.js';
import { arrival, clap, cue, pad, pluck, soundtrack, whoosh } from '../sounds.js';

const { colors, easing } = theme;
const target = vec3(0, 0, 0);
const orbit = (distance: number, azimuth = 0, elevation = 14): OrbitOptions => ({
  target,
  distance,
  azimuth,
  elevation,
  fov: 40,
});

const slab = slab3d({
  id: 'slab',
  viewport: { width: 1280, height: 720 },
  width: 420,
  height: 260,
  depth: 36,
  face: colors.lime,
  back: colors.pink,
  // Edges a darker lime, so the slab's thickness reads against the dark background.
  edge: mixColors(colors.lime, colors.ink, 0.45),
  plate: { color: colors.paper, inset: 44 },
  // Key light from the upper left, with a gloss that glints as faces turn
  // through it and a cool rim on faces seen edge-on.
  light: {
    direction: vec3(-0.45, -0.55, -0.7),
    ambient: 0.42,
    specular: { strength: 0.45, shininess: 28, color: colors.light, perVertex: true },
    rim: { strength: 0.25, power: 4, color: colors.light },
  },
  floor: { y: -250, color: lighting.shadow, softness: 70, minDepth: 0.45 },
  rotation: [
    { at: 0, value: { rotateX: -14, rotateY: -28, rotateZ: 0 } },
    { at: 0.6, value: { rotateX: -14, rotateY: -28, rotateZ: 0 } }, // hold the front first
    { at: 1.6, value: { rotateX: 8, rotateY: 200, rotateZ: 0 }, ease: easing.snap }, // spin to the back
    { at: 2.8, value: { rotateX: 8, rotateY: 200, rotateZ: 0 } }, // hold
    { at: 4.0, value: { rotateX: -18, rotateY: 330, rotateZ: -6 }, ease: easing.snap }, // spin round
    { at: 5.6, value: { rotateX: -10, rotateY: 338, rotateZ: 0 }, ease: easing.camera }, // settle
  ],
  camera: [
    { at: 0, value: orbit(1500) },
    { at: 1.6, value: orbit(780, 10, 10), ease: easing.camera }, // zoom in
    { at: 2.8, value: orbit(740, 12, 10) },
    { at: 4.2, value: orbit(1750, -8, 24), ease: easing.camera }, // zoom out
    { at: 5.6, value: orbit(1150, 0, 16), ease: easing.camera }, // settle
  ],
});

/**
 * The camera rushes in; each whip spin swishes and lands on a clap; the bed
 * follows the light (pink while the back faces us) and resolves as it settles.
 */
const audio = soundtrack([
  cue(0, pad(0.9, { attack: 0.5, release: 1 })),
  cue(0.9, pad(2.4, { chord: 'shadow', attack: 0.6, release: 1 })),
  cue(3.2, pad(2.2, { attack: 0.7, release: 1.4 })),
  cue(0, whoosh(1.6, { from: 200, to: 1800, peak: 0.5, gain: 0.8 })),
  cue(0.6, whoosh(0.2, { from: 900, to: 5200, peak: 0.9 })),
  cue(arrival(0.6, 1.0, easing.snap), clap({ big: true })),
  cue(2.8, whoosh(0.24, { from: 900, to: 5200, peak: 0.9 })),
  cue(arrival(2.8, 1.2, easing.snap), clap({ chord: 'lift' })),
  cue(2.8, whoosh(1.4, { from: 2200, to: 240, peak: 0.45, gain: 0.8 })),
  cue(5.6, pluck({ degree: 0, octave: 1 })),
]);

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'slab-rotate',
  audio,
  title: '3D slab rotating with zooms',
  duration: 6.5,
  background: colors.ink,
  renderer: 'svg',
  scene(t) {
    // Coloured light pools: lime while the front shows, pink while the back does.
    const back = progress(t, 0.9, 0.8, easing.camera) * (1 - progress(t, 3.2, 0.9, easing.camera));
    const lights = [
      { x: 360, y: 250, radius: 620, color: colors.lime, alpha: 0.1 * (1 - back) },
      { x: 920, y: 260, radius: 620, color: colors.pink, alpha: 0.12 * back },
      { x: 1100, y: 620, radius: 520, color: colors.violet, alpha: 0.08 },
    ];
    return {
      world: [backdrop('backdrop', lighting, { width: 1280, height: 720, lights }), slab(t)],
    };
  },
});

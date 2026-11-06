import {
  circle,
  mixColors,
  progress,
  radialGradient,
  rect,
  shapeNode,
  textNode,
  withAlpha,
  type SceneNode,
} from '@html-animation-engine/core';
import {
  backdrop,
  cameraPath,
  defineSceneComposition,
  elevationShadows,
  glowShadows,
  lightSweep,
  litFill,
} from '@html-animation-engine/renderers';
import { exampleDefaults, font, lighting, theme } from '../index.js';
import { bell, cue, pad, pluck, snap, soundtrack, whoosh } from '../sounds.js';

const { colors, easing, durations } = theme;
const W = 1280;
const H = 720;

const wide = { x: W / 2, y: H / 2, zoom: 1, rotation: 0 };
const close = { x: 900, y: 260, zoom: 3, rotation: -4 };
const camera = cameraPath([
  { at: 0.4, value: wide },
  { at: 1.8, value: close, ease: easing.camera }, // push in
  { at: 3.4, value: close }, // hold
  { at: 4.8, value: wide, ease: easing.camera }, // pull back
]);

/** A lit rounded block resting on the floor. */
function block(id: string, x: number, y: number, w: number, h: number, r: number, color: string) {
  return shapeNode(id, {
    geometry: rect(x, y, w, h, r),
    fill: litFill(lighting, color, { y, height: h }),
    shadow: elevationShadows(lighting, 'mid'),
  });
}

const target = rect(900, 260, 180, 110, 20);
const world: SceneNode[] = [
  backdrop('backdrop', lighting, { width: W, height: H }),
  shapeNode('floor', {
    geometry: rect(640, 360, 1180, 620, 32),
    fill: litFill(lighting, colors.surface, { y: 360, height: 620 }, { sheen: 0.06, shade: 0.3 }),
    shadow: elevationShadows(lighting, 'high'),
  }),
  block('a', 320, 470, 300, 180, 24, colors.blue),
  // The ball is shaded like a sphere: a highlight up and to the left.
  shapeNode('b', {
    geometry: circle(620, 300, 90),
    fill: radialGradient(590, 262, 150, [
      { offset: 0, color: mixColors(colors.pink, colors.light, 0.45) },
      { offset: 0.45, color: colors.pink },
      { offset: 1, color: mixColors(colors.pink, colors.shade, 0.35) },
    ]),
    shadow: elevationShadows(lighting, 'mid'),
  }),
  shapeNode('target', {
    geometry: target,
    fill: litFill(lighting, colors.lime, { y: 260, height: 110 }),
    shadow: [
      ...glowShadows(lighting, colors.lime, { radius: 40, strength: 0.6 }),
      ...elevationShadows(lighting, 'mid'),
    ],
  }),
  textNode('target-label', {
    text: 'detail',
    font: font('display', 30),
    fill: colors.ink,
    align: 'center',
    transform: { x: 900, y: 240 },
  }),
  block('c', 1000, 520, 240, 120, 60, colors.orange),
];

/** Air rushing in and out with the camera; a snap as it locks on, a bell on the glint. */
const audio = soundtrack([
  cue(0, pad(4.3, { attack: 0.6, release: 1.2 })),
  cue(0.4, whoosh(1.4, { from: 220, to: 2600, peak: 0.5 })),
  cue(1.8, snap({ degree: 4 })),
  cue(2.35, bell({ degree: 7, gain: 0.6 })),
  cue(3.4, whoosh(1.4, { from: 2600, to: 220, peak: 0.5 })),
  cue(4.8, pluck({ degree: 0, octave: 1, gain: 0.8 })),
]);

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'camera-push',
  audio,
  title: 'Camera push-in and pull-back',
  duration: 5.5,
  background: colors.ink,
  renderer: 'canvas',
  scene(t) {
    // A glint crosses the target once the camera has arrived on it.
    const glint = lightSweep(
      'target-glint',
      target,
      { x: 900, y: 260, width: 180, height: 110 },
      progress(t, 1.95, durations.slow, easing.camera),
      { color: colors.light, width: 60, angle: 25, strength: 0.4 },
    );
    return {
      camera: camera(t),
      world: glint ? [...world.slice(0, -2), glint, ...world.slice(-2)] : world,
      // Screen-pinned: stays put while the camera moves.
      screen: [
        textNode('title', {
          text: 'Camera: push in, hold, pull back',
          font: font('body', 26),
          fill: colors.paper,
          shadow: { x: 0, y: 2, blur: 8, color: withAlpha(colors.shade, 0.8) },
          // Inside the floor's top-left corner, clear of its edge.
          transform: { x: 84, y: 78 },
        }),
      ],
    };
  },
});

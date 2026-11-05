import {
  circle,
  DEG_TO_RAD,
  groupNode,
  linearGradient,
  morph,
  pathGeometry,
  pill,
  progress,
  rect,
  type MorphFrame,
  type MorphKey,
  type Shadow,
} from '@html-animation-engine/core';
import {
  backdrop,
  defineSceneComposition,
  elevationShadows,
  glowShadows,
  lightSweep,
  litGradient,
  shapeMorph,
} from '@html-animation-engine/renderers';
import { exampleDefaults, lighting, theme } from '../index.js';

const { colors, easing, durations } = theme;
const W = exampleDefaults.width;
const H = exampleDefaults.height;
const X = 640;
const Y = 360;
const STAR = 'M0 -150 L35 -48 L143 -46 L57 19 L88 121 L0 60 L-88 121 L-57 19 L-143 -46 L-35 -48 Z';
const FINAL = rect(0, 0, 260, 260, 48);

const keys: MorphKey[] = [
  { at: 0.3, shape: rect(0, 0, 220, 220, 0), fill: colors.lime },
  { at: 1.0, shape: pill(0, 0, 460, 120), fill: colors.pink, ease: easing.snap },
  { at: 2.0, shape: circle(0, 0, 120), fill: colors.blue, ease: easing.snap },
  { at: 3.0, shape: pathGeometry(STAR), fill: colors.orange, rotation: 0, ease: easing.enter },
  { at: 4.0, shape: FINAL, fill: colors.violet, rotation: 90, ease: easing.snap },
];
/** Same track as the shape, read for its colour (to tint the backdrop). */
const track = morph(keys);

/** A vector in screen space, expressed in the shape's rotated local space. */
function toLocal(form: MorphFrame, x: number, y: number) {
  const a = -form.rotation * DEG_TO_RAD;
  return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
}

const shape = shapeMorph({
  id: 'shifter',
  x: X,
  y: Y,
  keys,
  // Lit from above on screen, however the shape is turned.
  paint: (form) => {
    const lit = litGradient(lighting, form.fill ?? colors.paper, -150, 150);
    const top = toLocal(form, 0, -150);
    const bottom = toLocal(form, 0, 150);
    return linearGradient(top.x, top.y, bottom.x, bottom.y, lit.stops);
  },
  // A glow in the shape's own colour, then a shadow falling straight down.
  shadow: (form): Shadow[] => [
    ...glowShadows(lighting, form.fill ?? colors.paper, { radius: 70, strength: 0.5 }),
    ...elevationShadows(lighting, 'high').map((s) => ({ ...s, ...toLocal(form, s.x, s.y) })),
  ],
});

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'shape-morph',
  title: 'Shape morph',
  duration: 5.5,
  background: colors.ink,
  renderer: 'svg',
  scene(t) {
    const tint = track.at(t).fill ?? colors.paper;
    // A glint crosses the final form once it has settled.
    const glint = lightSweep(
      'glint',
      FINAL,
      { x: 0, y: 0, width: 260, height: 260 },
      progress(t, 4.45, durations.slow, easing.camera),
      // The shape is turned 90°, so -65° locally travels at 25° on screen.
      { color: colors.light, width: 110, angle: 25 - 90, strength: 0.35 },
    );
    return {
      world: [
        backdrop('backdrop', lighting, {
          width: W,
          height: H,
          lights: [{ x: X, y: Y + 20, radius: 460, color: tint, alpha: 0.16 }],
        }),
        shape(t),
        ...(glint
          ? [groupNode('glint-frame', [glint], { transform: { x: X, y: Y, rotation: 90 } })]
          : []),
      ],
    };
  },
});

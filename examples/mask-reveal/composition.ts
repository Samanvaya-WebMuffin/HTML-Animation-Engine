import {
  circle,
  linearGradient,
  progress,
  rect,
  shapeNode,
  textNode,
  withAlpha,
  type SceneNode,
} from '@html-animation-engine/core';
import {
  backdrop,
  circleReveal,
  defineSceneComposition,
  elevationShadows,
  glowShadows,
  lightSweep,
  litFill,
  maskReveal,
} from '@html-animation-engine/renderers';
import { exampleDefaults, font, lighting, theme } from '../index.js';
import { arrival, bell, clap, cue, pad, snap, soundtrack, whoosh } from '../sounds.js';

const { colors, easing, durations } = theme;
const headline = font('display', 96);
const caption = font('body', 28);
const W = exampleDefaults.width;
const H = exampleDefaults.height;

const MASK = { x: 640, y: 250, width: 1100, height: 200, start: 0.3 };
const IRIS = { x: 640, y: 480, start: 1.2 };
const panel = { x: 640, y: 480, width: 800, height: 220 };
const panelShape = rect(panel.x, panel.y, panel.width, panel.height, 28);

const wipe = maskReveal({
  id: 'headline-mask',
  ...MASK,
  from: 'left',
  duration: durations.slow,
  ease: easing.wipe,
});
const iris = circleReveal({
  id: 'panel-iris',
  x: IRIS.x,
  y: IRIS.y,
  // Wide enough to uncover the panel's shadow as well as the panel.
  radius: Math.hypot(panel.width / 2 + 60, panel.height / 2 + 110),
  start: IRIS.start,
  duration: durations.slow,
  ease: easing.enter,
});

/** A thin bar of light riding the mask's leading edge while it wipes. */
function wipeEdge(t: number): SceneNode[] {
  const p = progress(t, MASK.start, durations.slow, easing.wipe);
  if (!(p > 0 && p < 1)) return [];
  const x = MASK.x - MASK.width / 2 + MASK.width * p;
  const fade = Math.sin(Math.PI * p);
  return [
    shapeNode('wipe-edge', {
      geometry: rect(x, MASK.y, 4, MASK.height * 0.8, 2),
      fill: linearGradient(0, MASK.y - MASK.height * 0.4, 0, MASK.y + MASK.height * 0.4, [
        withAlpha(colors.lime, 0),
        colors.lime,
        withAlpha(colors.lime, 0),
      ]),
      shadow: glowShadows(lighting, colors.lime, { radius: 30, strength: 1.3 }),
      opacity: fade,
    }),
  ];
}

/** A glowing ring on the iris edge, fading as the iris opens. */
function irisRing(t: number): SceneNode[] {
  const p = progress(t, IRIS.start, durations.slow, easing.enter);
  if (!(p > 0 && p < 0.98)) return [];
  const radius = Math.hypot(panel.width / 2 + 60, panel.height / 2 + 110) * p;
  return [
    shapeNode('iris-ring', {
      geometry: circle(IRIS.x, IRIS.y, radius),
      stroke: { color: withAlpha(colors.blue, 0.8), width: 2 },
      shadow: glowShadows(lighting, colors.blue, { radius: 18, strength: 0.7 }),
      opacity: (1 - p) * 0.9,
    }),
  ];
}

/** A swish with the wipe and a snap as it completes; a clap as the iris opens; a bell on the glint. */
const audio = soundtrack([
  cue(0, pad(2.2, { attack: 0.4, release: 1 })),
  cue(MASK.start, whoosh(durations.slow, { from: 300, to: 3600, peak: 0.48 })),
  cue(arrival(MASK.start, durations.slow, easing.wipe, 0.95), snap({ degree: 2 })),
  cue(arrival(IRIS.start, durations.slow, easing.enter, 0.5), clap({ chord: 'lift' })),
  cue(IRIS.start + durations.slow * 0.8 + durations.slow / 2, bell({ degree: 9, gain: 0.55 })),
]);

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'mask-reveal',
  audio,
  title: 'Mask and circle reveal',
  duration: 3.2,
  background: colors.ink,
  renderer: 'svg',
  scene(t) {
    const opened = progress(t, IRIS.start, durations.slow, easing.enter);
    const glint = lightSweep(
      'panel-glint',
      panelShape,
      panel,
      progress(t, IRIS.start + durations.slow * 0.8, durations.slow, easing.camera),
      { color: colors.light, width: 120, angle: 20, strength: 0.25 },
    );
    return {
      world: [
        backdrop('backdrop', lighting, {
          width: W,
          height: H,
          focus: { x: W / 2, y: 280 },
          lights: [
            // The panel throws blue light onto the backdrop as it opens.
            { x: panel.x, y: panel.y + 40, radius: 560, color: colors.blue, alpha: 0.18 * opened },
            { x: 200, y: 60, radius: 520, color: colors.violet, alpha: 0.1 },
          ],
        }),
        wipe(t, [
          textNode('headline', {
            text: 'Revealed by a mask',
            font: headline,
            fill: colors.paper,
            align: 'center',
            shadow: elevationShadows(lighting, 'mid', { strength: 1.2 }),
            transform: { x: 640, y: 190 },
          }),
        ]),
        ...wipeEdge(t),
        iris(t, [
          shapeNode('panel', {
            geometry: panelShape,
            fill: litFill(lighting, colors.blue, panel),
            stroke: { color: withAlpha(colors.light, 0.12), width: 1 },
            shadow: [
              ...glowShadows(lighting, colors.blue, { radius: 60, strength: 0.4 }),
              ...elevationShadows(lighting, 'high'),
            ],
          }),
          ...(glint ? [glint] : []),
          textNode('caption', {
            text: 'and a circle iris',
            font: caption,
            fill: colors.paper,
            shadow: elevationShadows(lighting, 'low'),
            align: 'center',
            transform: { x: 640, y: 463 },
          }),
        ]),
        ...irisRing(t),
      ],
    };
  },
});

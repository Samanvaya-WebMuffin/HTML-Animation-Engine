import {
  apply3D,
  cameraBasis,
  circle,
  clamp,
  dot3,
  keyframes,
  lerp,
  linearGradient,
  mixColors,
  normalize3,
  orbitCamera,
  pathGeometry,
  polygonPath,
  projectPoint,
  projectSpace,
  radialGradient,
  random,
  rect,
  roundedBox,
  scale3,
  shapeNode,
  sub3,
  transform3DMatrix,
  vec3,
  withAlpha,
  type Point,
  type SceneNode,
  type Transform3D,
  type Vec3,
} from '@html-animation-engine/core';
import { backdrop, defineSceneComposition } from '@html-animation-engine/renderers';
import { exampleDefaults, lighting, theme } from '../index.js';
import { arrival, bell, clap, cue, pad, snap, soundtrack, thump, whoosh } from '../sounds.js';

const { colors, easing } = theme;
const W = exampleDefaults.width;
const H = exampleDefaults.height;
const VIEWPORT = { width: W, height: H };

/** The slab: a neon device, rounded like a phone. */
const SLAB = { width: 250, height: 500, depth: 26, radius: 44 };
const NEON = colors.violet;

/** Timing: it rises into the light, and turns to face us as it does. */
const T = { rise: 0.6, riseEnd: 3.6, turn: 1.4, turnEnd: 4.9 } as const;

/**
 * One key light above the camera, pointing down and into the scene. Faces
 * turned up and towards us catch it; a face turned down stays dark.
 */
const LIGHT_DIR = normalize3(vec3(0, -0.78, -0.62));
const TO_LIGHT = scale3(LIGHT_DIR, -1);

const lerp3 = (a: Vec3, b: Vec3, p: number) =>
  vec3(lerp(a.x, b.x, p), lerp(a.y, b.y, p), lerp(a.z, b.z, p));

/** Where the slab is: below the frame, then risen to the centre. */
const position = keyframes<Vec3>(
  [
    { at: 0, value: vec3(0, -820, -160) },
    { at: T.rise, value: vec3(0, -820, -160) },
    { at: T.riseEnd, value: vec3(0, 0, 0), ease: easing.camera },
  ],
  lerp3,
);

/** Rotation (degrees about x, y, z): face down (x = 90) to facing us, tipped back into the light. */
const turn = keyframes<Vec3>(
  [
    { at: 0, value: vec3(90, -26, 5) },
    { at: T.turn, value: vec3(90, -26, 5) },
    { at: T.turnEnd, value: vec3(-9, -20, 0), ease: easing.camera },
  ],
  lerp3,
);

const camera = keyframes<Vec3>(
  [
    { at: 0, value: vec3(1500, 5, 0) }, // distance, elevation
    { at: 7, value: vec3(1320, 3, 0) },
  ],
  lerp3,
);

/** The light falls off below its cone: the slab is in darkness until it rises into it. */
const exposure = (y: number) => {
  const p = clamp((y + 700) / 640);
  return p * p * (3 - 2 * p);
};

/** The shaft of light: half-width at the source, and at the bottom of the frame. */
const SHAFT = { top: 70, bottom: 470, softness: 260, alpha: 0.12 };

/**
 * A shaft of light from the source above the frame, as two halves, each
 * filled with a gradient running across its slanted edge: clear at the edge,
 * rising smoothly inwards. Gradients have no steps, so the shaft has soft
 * sides and no visible layers.
 */
const beam = [-1, 1].map((side) => {
  const edgeTop = { x: W / 2 + side * SHAFT.top, y: -40 };
  const edgeBottom = { x: W / 2 + side * SHAFT.bottom, y: H };
  // Unit normal to the edge, pointing into the shaft.
  const [dx, dy] = [edgeBottom.x - edgeTop.x, edgeBottom.y - edgeTop.y];
  const length = Math.hypot(dx, dy);
  const inward = { x: (-side * dy) / length, y: (side * dx) / length };
  return shapeNode(`beam-${side < 0 ? 'left' : 'right'}`, {
    geometry: pathGeometry(
      `M ${W / 2} -40 L ${edgeTop.x} -40 L ${edgeBottom.x} ${H} L ${W / 2} ${H} Z`,
    ),
    fill: linearGradient(
      edgeTop.x,
      edgeTop.y,
      edgeTop.x + inward.x * SHAFT.softness,
      edgeTop.y + inward.y * SHAFT.softness,
      Array.from({ length: 9 }, (_, j) => {
        const p = j / 8;
        return { offset: p, color: withAlpha(colors.light, SHAFT.alpha * p * p * (3 - 2 * p)) };
      }),
    ),
  });
});

/** The light falls off with distance from the source: the lower frame sinks into shadow. */
const falloff = shapeNode('falloff', {
  geometry: rect(W / 2, H / 2, W, H),
  fill: linearGradient(
    0,
    H * 0.2,
    0,
    H,
    Array.from({ length: 9 }, (_, j) => {
      const p = j / 8;
      return { offset: p, color: withAlpha(colors.shade, 0.6 * p * p * (3 - 2 * p)) };
    }),
  ),
});

/**
 * Dust drifting in the shaft: tiny motes, seeded, lit only where the light
 * falls (brighter near the source), some out of focus. They drift a few
 * pixels over the whole clip and shimmer slowly, never flash.
 */
function dust(seed: number, t: number): SceneNode[] {
  return Array.from({ length: 46 }, (_, i) => {
    const rand = (key: string) => random(seed, 'dust', i, key);
    const phase = rand('phase') * Math.PI * 2;
    const y = lerp(30, H * 0.95, rand('y') ** 1.3) - 9 * t + 6 * Math.sin(t * 0.27 + phase * 1.7);
    const halfWidth = 70 + y * 0.42;
    const x = W / 2 + (rand('x') * 2 - 1) * halfWidth * 0.85 + 14 * Math.sin(t * 0.35 + phase);
    // Light in the shaft at this point: falls off with depth and towards its edges.
    const inLight = clamp((1 - y / (H * 1.2)) * (1 - Math.abs(x - W / 2) / halfWidth));
    const shimmer = 0.65 + 0.35 * Math.sin(t * 0.9 + phase);
    const alpha = inLight * shimmer * 0.55;
    const size = lerp(1.1, 2.6, rand('size'));
    // About 40 % are out of focus: bigger, softer and fainter.
    if (rand('focus') < 0.4) {
      return shapeNode(`dust-${i}`, {
        geometry: circle(x, y, size * 2.2),
        fill: 'transparent',
        shadow: { x: 0, y: 0, blur: 6, color: withAlpha(colors.light, alpha * 0.6) },
      });
    }
    return shapeNode(`dust-${i}`, {
      geometry: circle(x, y, size),
      fill: withAlpha(colors.light, alpha),
    });
  });
}

/** The source itself, glimpsed as a glow at the top edge. */
const source = shapeNode('source', {
  geometry: rect(W / 2, -40, 920, 920, 460),
  fill: radialGradient(W / 2, -40, 460, [
    { offset: 0, color: withAlpha(colors.light, 0.2) },
    { offset: 0.35, color: withAlpha(colors.light, 0.05) },
    { offset: 1, color: withAlpha(colors.light, 0) },
  ]),
});

const pathOf = (points: readonly Point[]) => pathGeometry(polygonPath(points, 2));

/**
 * A soft snap sets it off; air rises with the slab; as its face meets the
 * light a low thump and a clap on the home chord land, the bed turns from
 * dark to bright, and a bell rings.
 */
const MEETS_LIGHT = arrival(T.turn, T.turnEnd - T.turn, easing.camera, 0.9);
const audio = soundtrack([
  cue(0, pad(MEETS_LIGHT, { chord: 'shadow', attack: 1.6, release: 1.2, gain: 1.1 })),
  cue(T.rise, snap({ degree: 0, gain: 0.7 })),
  cue(T.rise, whoosh(T.riseEnd - T.rise, { from: 140, to: 2200, peak: 0.85, gain: 0.8 })),
  cue(MEETS_LIGHT, thump()),
  cue(MEETS_LIGHT, clap({ chord: 'home' })),
  cue(MEETS_LIGHT, pad(6.6 - MEETS_LIGHT, { chord: 'home', attack: 0.4, release: 1.4 })),
  cue(MEETS_LIGHT + 0.35, bell({ degree: 7, gain: 0.6 })),
]);

export default defineSceneComposition({
  ...exampleDefaults,
  id: 'slab-reveal',
  audio,
  title: 'A neon slab rises into a top light and turns to face us',
  duration: 7,
  background: colors.shade,
  renderer: 'svg',
  scene(t, ctx) {
    const at = position(t);
    const r = turn(t);
    const cam = camera(t);
    const view = orbitCamera({
      target: vec3(0, 0, 0),
      distance: cam.x,
      azimuth: 0,
      elevation: cam.y,
      fov: 36,
    });
    const basis = cameraBasis(view, VIEWPORT);
    const lit = exposure(at.y);
    // In darkness the slab's colours sink towards black; in the light they are themselves.
    const dim = (c: string) => mixColors(c, colors.shade, 0.92 * (1 - lit));
    const mesh = roundedBox(
      SLAB.width,
      SLAB.height,
      SLAB.depth,
      SLAB.radius,
      12,
      {
        front: dim(NEON),
        // A graphite back and a darker neon frame.
        back: dim(mixColors(NEON, colors.ink, 0.82)),
        side: dim(mixColors(NEON, colors.ink, 0.45)),
      },
      { bevel: 9, bevelSegments: 10 },
    );
    const transform: Transform3D = { ...at, rotateX: r.x, rotateY: r.y, rotateZ: r.z };
    const slab = projectSpace(
      'slab',
      {
        camera: view,
        objects: [{ id: 'body', mesh, transform }],
        light: {
          direction: LIGHT_DIR,
          ambient: 0.16,
          specular: { strength: 0.4 * lit, shininess: 36, color: colors.light, perVertex: true },
          rim: { strength: 0.2 * lit, power: 4, color: colors.light },
        },
      },
      VIEWPORT,
    );

    // The front face in the world: its normal, outline and top-to-bottom axis.
    const m = transform3DMatrix(transform);
    const world = (v: Vec3) => apply3D(m, v);
    const normal = normalize3(sub3(world(vec3(0, 0, 1)), world(vec3(0, 0, 0))));
    const front = mesh.faces[0]?.indices.map((i) => mesh.vertices[i] as Vec3) ?? [];
    const outline = front.map((v) => projectPoint(basis, world(v)));
    const top = projectPoint(basis, world(vec3(0, SLAB.height / 2, SLAB.depth / 2)));
    const bottom = projectPoint(basis, world(vec3(0, -SLAB.height / 2, SLAB.depth / 2)));
    const seen = dot3(normal, sub3(view.position, world(vec3(0, 0, SLAB.depth / 2)))) > 0;
    // How squarely the face meets the light (0 face down → 1 full on), and how lit it is.
    const facing = clamp(dot3(normal, TO_LIGHT) / 0.78) * lit;

    const under: SceneNode[] = [];
    const over: SceneNode[] = [];
    if (seen && top && bottom && outline.every((p) => p !== null) && facing > 0.001) {
      const face = pathOf(outline as Point[]);
      // Neon: the face glows into the dark around it once it is lit.
      under.push(
        shapeNode('glow', {
          geometry: face,
          fill: withAlpha(NEON, 0.9 * facing),
          shadow: [
            { x: 0, y: 0, blur: 90, color: withAlpha(NEON, 0.42 * facing) },
            { x: 0, y: 0, blur: 28, color: withAlpha(NEON, 0.5 * facing) },
          ],
        }),
      );
      // Glass lit from above: brighter at the top, falling off to the bottom,
      // with the reflection of the overhead light sliding down the face as it
      // tips back towards it.
      const band = lerp(0.04, 0.3, clamp((40 - r.x) / 49));
      over.push(
        shapeNode('gloss', {
          geometry: face,
          // Sampled smooth curves: a glow under the top edge, a soft (Gaussian)
          // reflection band, and shade gathering towards the bottom.
          fill: linearGradient(
            top.x,
            top.y,
            bottom.x,
            bottom.y,
            Array.from({ length: 25 }, (_, j) => {
              const o = j / 24;
              const light =
                0.22 * Math.exp(-o / 0.09) + 0.2 * Math.exp(-(((o - band) / 0.075) ** 2));
              const fall = clamp((o - 0.5) / 0.5);
              const shade = 0.36 * fall * fall * (3 - 2 * fall);
              return {
                offset: o,
                color:
                  light >= shade
                    ? withAlpha(colors.light, light * facing)
                    : withAlpha(colors.shade, shade * facing),
              };
            }),
          ),
        }),
      );
    }

    const centre = projectPoint(basis, at) ?? { x: W / 2, y: H };
    // Light spilling onto the dark around the slab, in its own colour.
    const halo = shapeNode('halo', {
      geometry: rect(centre.x, centre.y, 1000, 1000, 500),
      fill: radialGradient(centre.x, centre.y, 500, [
        { offset: 0, color: withAlpha(NEON, 0.2 * facing) },
        { offset: 0.45, color: withAlpha(NEON, 0.06 * facing) },
        { offset: 1, color: withAlpha(NEON, 0) },
      ]),
    });

    return {
      world: [
        backdrop('backdrop', lighting, {
          width: W,
          height: H,
          // The room is lit only from above: brightest at the top centre.
          focus: { x: W / 2, y: 40 },
          centre: colors.dusk,
          edge: colors.shade,
        }),
        ...beam,
        ...dust(ctx.seed, t),
        falloff,
        source,
        halo,
        ...under,
        slab,
        ...over,
      ],
    };
  },
});

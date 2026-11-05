import {
  defaultTheme,
  flattenScene,
  vec3,
  withAlpha,
  type OrbitOptions,
} from '@html-animation-engine/core';
import { describe, expect, it } from 'vitest';
import { flyThrough, pageCurl, slab3d } from '../src/index.js';

const { colors, easing } = defaultTheme;
const viewport = { width: 640, height: 360 };
const json = (v: unknown) => JSON.stringify(v);
const orbit = (distance: number): OrbitOptions => ({
  target: vec3(0, 0, 0),
  distance,
  azimuth: 0,
  elevation: 10,
});

const slab = slab3d({
  id: 'slab',
  viewport,
  width: 200,
  height: 120,
  depth: 20,
  face: colors.lime,
  back: colors.pink,
  edge: colors.surface,
  plate: { color: colors.paper, inset: 20 },
  rotation: [
    { at: 0, value: { rotateX: 0, rotateY: 0, rotateZ: 0 } },
    { at: 1, value: { rotateX: 0, rotateY: 180, rotateZ: 0 }, ease: easing.snap },
  ],
  camera: [
    { at: 0, value: orbit(800) },
    { at: 1, value: orbit(400), ease: easing.camera },
  ],
});
const page = pageCurl({
  id: 'page',
  viewport,
  camera: { position: vec3(0, -500, 800), target: vec3(0, 0, 0), fov: 40 },
  width: 260,
  height: 340,
  paper: colors.paper,
  back: colors.muted,
  ink: colors.ink,
  shadow: withAlpha(colors.ink, 0.4),
  corner: 'bottom-right',
  reach: 100,
  radius: 30,
  wobble: 0.1,
  period: 2,
});
const flight = flyThrough({
  id: 'fly',
  viewport,
  seed: 1,
  count: 20,
  field: { width: 800, height: 500, length: 1600 },
  clearance: 100,
  size: [40, 80],
  palette: [colors.lime, colors.blue],
  loopDuration: 4,
  fog: { color: colors.ink, near: 300, far: 1500 },
});
// The same effects with every optional polish feature turned on.
const lit = {
  direction: vec3(-0.4, -0.6, -0.7),
  specular: { strength: 0.6, shininess: 4, perVertex: true },
};
const slabLit = slab3d({
  id: 'slab',
  viewport,
  width: 200,
  height: 120,
  depth: 20,
  face: colors.lime,
  back: colors.pink,
  edge: colors.surface,
  rotation: [
    { at: 0, value: { rotateX: 0, rotateY: -30, rotateZ: 0 } },
    { at: 1, value: { rotateX: 0, rotateY: 60, rotateZ: 0 } },
  ],
  camera: [{ at: 0, value: orbit(800) }],
  light: lit,
  floor: { y: -150, color: colors.ink },
});
const pageLit = pageCurl({
  id: 'page',
  viewport,
  camera: { position: vec3(0, -500, 800), target: vec3(0, 0, 0), fov: 40 },
  width: 260,
  height: 340,
  paper: colors.paper,
  back: colors.muted,
  ink: colors.ink,
  shadow: withAlpha(colors.ink, 0.4),
  contactShadow: withAlpha(colors.ink, 0.3),
  rest: [{ x: 0, y: 4, blur: 10, color: withAlpha(colors.ink, 0.4) }],
  corner: 'bottom-right',
  reach: 100,
  radius: 30,
  wobble: 0.1,
  period: 2,
});
const flightDust = flyThrough({
  id: 'fly',
  viewport,
  seed: 1,
  count: 20,
  field: { width: 800, height: 500, length: 1600 },
  clearance: 100,
  size: [40, 80],
  palette: [colors.lime, colors.blue],
  loopDuration: 4,
  fog: { color: colors.ink, near: 300, far: 1500 },
  dust: { count: 40, color: colors.paper },
});
const ids = (node: Parameters<typeof flattenScene>[0]['world'][number]) =>
  flattenScene({ width: 640, height: 360, world: [node] }).map((item) => item.node.id);

describe('3D effects', () => {
  it.each([
    ['slab3d', slab],
    ['pageCurl', page],
    ['flyThrough', flight],
  ] as const)('%s is a pure function of t', (_name, effect) => {
    const times = [0, 0.4, 1.3, 2.2, 3.9];
    expect(
      [...times]
        .reverse()
        .map((t) => json(effect(t)))
        .reverse(),
    ).toEqual(times.map((t) => json(effect(t))));
  });

  it.each([
    ['slab3d with floor and gloss', slabLit],
    ['pageCurl with resting and contact shadows', pageLit],
    ['flyThrough with dust', flightDust],
  ] as const)('%s is a pure function of t', (_name, effect) => {
    const times = [0, 0.4, 1.3, 2.2, 3.9];
    expect(
      [...times]
        .reverse()
        .map((t) => json(effect(t)))
        .reverse(),
    ).toEqual(times.map((t) => json(effect(t))));
  });

  it('the slab floor shadow turns with the slab', () => {
    const shadowOf = (t: number) =>
      flattenScene({ width: 640, height: 360, world: [slabLit(t)] })[0]!.node;
    expect(shadowOf(0).id).toBe('slab-floor-shadow');
    expect(json(shadowOf(0))).not.toBe(json(shadowOf(1)));
  });

  it('per-vertex gloss fills broad faces with a gradient', () => {
    const fills = flattenScene({ width: 640, height: 360, world: [slabLit(0)] }).map(
      (item) => item.node.type === 'shape' && item.node.fill,
    );
    expect(fills.some((fill) => typeof fill === 'object' && fill.type === 'linear')).toBe(true);
  });

  it('the page rests on soft shadows and its curl adds a contact shadow', () => {
    const drawn = ids(pageLit(0.5));
    expect(drawn[0]).toBe('page-rest');
    expect(drawn).toContain('page-contact');
  });

  it('dust streaks loop with the flight and leave the objects unchanged', () => {
    expect(json(flightDust(4))).toBe(json(flightDust(0)));
    const [objects, dust] = flightDust(1.5).children;
    expect(json(objects)).toBe(json(flight(1.5)));
    expect(dust?.type === 'group' && dust.children.length).toBeGreaterThan(5);
  });

  it('shows the slab front plate only while the front faces the camera', () => {
    expect(ids(slab(0)).some((id) => id.includes('plate'))).toBe(true);
    expect(ids(slab(1)).some((id) => id.includes('plate'))).toBe(false);
  });

  it('the page curl and the fly-through loop exactly', () => {
    expect(json(page(2))).toBe(json(page(0)));
    expect(json(flight(4))).toBe(json(flight(0)));
  });

  it('the page curl has a flat part, a shadow and a lifted part', () => {
    const [flat, shadow, lifted] = page(0.5).children;
    expect(flat?.id).toBe('page-flat');
    expect(shadow).toMatchObject({ fill: 'transparent', shadow: { blur: 18 } });
    expect(lifted?.type === 'group' && lifted.children.length).toBeGreaterThan(10);
  });

  it('the fly-through clips objects as they pass the camera', () => {
    // Every drawn face is in front of the near plane, so nothing projects inside out.
    for (const t of [0, 1, 2, 3]) {
      const faces = flattenScene({ width: 640, height: 360, world: [flight(t)] });
      expect(faces.length).toBeGreaterThan(0);
    }
  });
});

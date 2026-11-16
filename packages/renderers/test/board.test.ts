import {
  defaultTheme,
  flattenScene,
  type SceneNode,
  type TextMeasurer,
} from '@html-animation-engine/core';
import { describe, expect, it } from 'vitest';
import {
  aurora,
  connector,
  defocus,
  elbow,
  flightPath,
  gridBackdrop,
  kineticText,
  motionBlur,
  roundedRoute,
  viewTransform,
} from '../src/index.js';

const { colors, easing } = defaultTheme;
const mono: TextMeasurer = {
  measure: (text, font) => [...text].length * font.size * 0.6,
  metrics: (font) => ({ ascent: font.size * 0.8, descent: font.size * 0.2 }),
};
const font = { family: 'Test', size: 40 };
const json = (node: unknown) => JSON.stringify(node);
const pure = (effect: (t: number) => unknown) => {
  const times = Array.from({ length: 41 }, (_, i) => i / 8);
  const forward = times.map((t) => json(effect(t)));
  const backward = [...times]
    .reverse()
    .map((t) => json(effect(t)))
    .reverse();
  expect(backward).toEqual(forward);
};

describe('board effects are pure functions of t', () => {
  it('aurora', () =>
    pure(
      aurora({
        id: 'a',
        seed: 's',
        pools: (t) => [
          { x: 100, y: 100, rx: 300, ry: 200, color: colors.violet, alpha: 0.2 + 0.01 * t },
          { x: 400, y: 600, rx: 200, ry: 260, rotation: 20, color: colors.blue, alpha: 0.1 },
        ],
      }),
    ));
  it('connector', () =>
    pure(
      connector({
        id: 'c',
        d: roundedRoute(elbow({ x: 0, y: 0 }, { x: 300, y: 120 }), 20),
        color: colors.muted,
        start: 0.5,
        duration: 1,
        ease: easing.enter,
        dots: [0.25, 0.75],
        pulses: [{ at: 1.2, duration: 1.5, color: colors.blue }],
      }),
    ));
  it('kinetic text', () =>
    pure(
      kineticText({
        id: 'k',
        text: 'Less *searching.*',
        font,
        measurer: mono,
        x: 0,
        y: 0,
        color: colors.ink,
        accent: colors.violet,
        at: 0.3,
        ease: easing.enter,
      }),
    ));
});

describe('flightPath', () => {
  const frame = 720;
  it('starts and ends exactly on the two views', () => {
    const path = flightPath({ x: 0, y: 0, zoom: 1 }, { x: 2000, y: 800, zoom: 1.5 }, frame);
    expect(path.at(0).x).toBeCloseTo(0);
    expect(path.at(0).zoom).toBeCloseTo(1);
    expect(path.at(1).x).toBeCloseTo(2000);
    expect(path.at(1).y).toBeCloseTo(800);
    expect(path.at(1).zoom).toBeCloseTo(1.5);
  });
  it('pulls back further for longer journeys', () => {
    const near = flightPath({ x: 0, y: 0, zoom: 1 }, { x: 800, y: 0, zoom: 1 }, frame);
    const far = flightPath({ x: 0, y: 0, zoom: 1 }, { x: 4000, y: 0, zoom: 1 }, frame);
    expect(far.at(0.5).zoom).toBeLessThan(near.at(0.5).zoom);
    expect(near.at(0.5).zoom).toBeLessThan(1);
    expect(far.length).toBeGreaterThan(near.length);
  });
  it('zooms in place when the views share a centre', () => {
    const path = flightPath({ x: 5, y: 5, zoom: 1 }, { x: 5, y: 5, zoom: 2 }, frame);
    expect(path.at(0.5).x).toBe(5);
    expect(path.at(1).zoom).toBeCloseTo(2);
  });
});

describe('camera helpers', () => {
  it('shows the view point at the frame centre', () => {
    const tr = viewTransform({ x: 300, y: 900, zoom: 2 }, { width: 720, height: 1280 });
    expect(tr).toMatchObject({ x: 360, y: 640, scale: 2, originX: 300, originY: 900 });
  });
  it('moves far layers less', () => {
    const tr = viewTransform({ x: 1000, y: 0, zoom: 2 }, { width: 720, height: 1280 }, 0.3);
    expect(tr.originX).toBeCloseTo(300);
    expect(tr.scale).toBeCloseTo(Math.pow(2, 0.3));
  });
  it('blurs along the direction of motion, more for faster moves', () => {
    expect(motionBlur({ x: 10, y: 0 })).toBeUndefined();
    const slow = motionBlur({ x: 600, y: 0 });
    const fast = motionBlur({ x: 0, y: 3000 });
    expect(typeof slow === 'object' && slow.angle).toBe(0);
    expect(typeof fast === 'object' && fast.angle).toBe(90);
    expect(typeof fast === 'object' && typeof slow === 'object' && fast.x > slow.x).toBe(true);
  });
  it('defocuses with distance from the focal plane', () => {
    expect(defocus(0.2, 10, 24, 0.5)).toBe(0);
    expect(defocus(2, 10)).toBe(20);
    expect(defocus(-9, 10)).toBe(24);
  });
});

describe('kinetic text', () => {
  const k = kineticText({
    id: 'k',
    text: 'Hello *there*',
    font,
    measurer: mono,
    x: 0,
    y: 0,
    color: colors.ink,
    accent: colors.violet,
    at: 0,
    ease: easing.enter,
  });
  const leaves = (node: SceneNode) => flattenScene({ width: 10, height: 10, world: [node] });
  it('arrives letter by letter, blurred, then settles into whole words', () => {
    const mid = leaves(k(0.05));
    expect(mid.length).toBeGreaterThan(1);
    expect(mid.every((i) => i.node.type === 'text' && [...i.node.text].length === 1)).toBe(true);
    expect(mid.some((i) => i.layers.length > 0)).toBe(true);
    const done = leaves(k(k.end + 0.01));
    expect(done.map((i) => (i.node.type === 'text' ? i.node.text : ''))).toEqual([
      'Hello',
      'there',
    ]);
    expect(done.every((i) => i.layers.length === 0)).toBe(true);
  });
  it('colours accented words', () => {
    const done = leaves(k(k.end + 0.01));
    expect(done[1]?.node.type === 'text' && done[1].node.fill).toBe(colors.violet);
  });
  it('leaves with a motion blur', () => {
    const out = leaves(k(k.end + 1, 0.5));
    expect(out[0]?.layers[0]?.angle).toBe(0);
    expect(out[0]?.layers[0]?.x).toBeGreaterThan(out[0]?.layers[0]?.y ?? 0);
  });
});

describe('routes', () => {
  it('rounds corners and survives aligned ends (no zero-length corners)', () => {
    const d = roundedRoute(elbow({ x: 10, y: 0 }, { x: 10, y: 200 }, 'vertical'), 30);
    expect(d).not.toContain('NaN');
    expect(roundedRoute(elbow({ x: 0, y: 0 }, { x: 200, y: 100 }), 20)).toContain('Q');
  });
});

describe('grid', () => {
  it('draws major lines solid and minor lines dashed', () => {
    const g = gridBackdrop({
      id: 'g',
      x: 0,
      y: 0,
      width: 240,
      height: 120,
      cell: 120,
      color: colors.paper,
      majorColor: colors.muted,
    });
    const [minor, major] = g.children;
    expect(minor?.type === 'shape' && minor.stroke?.dash).toBeTruthy();
    expect(major?.type === 'shape' && major.stroke?.dash).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import {
  circle,
  defaultTheme,
  morph,
  parseColor,
  pathGeometry,
  pill,
  rect,
  rgbToOklch,
  sampleOutline,
  type Geometry,
} from '../src/index.js';

const { colors, easing } = defaultTheme;
const STAR =
  'M0 -100 L23.5 -32.4 L95.1 -30.9 L38 12.4 L58.8 80.9 L0 40 L-58.8 80.9 L-38 12.4 L-95.1 -30.9 L-23.5 -32.4 Z';

const shapeshifter = () =>
  morph([
    { at: 0, shape: rect(0, 0, 200, 120, 0), fill: colors.lime },
    { at: 1, shape: pill(0, 0, 320, 80), fill: colors.pink, ease: easing.snap },
    { at: 2, shape: circle(0, 0, 60), fill: colors.blue, rotation: 90 },
    { at: 3, shape: pathGeometry(STAR), fill: colors.orange, ease: easing.enter },
    { at: 4, shape: rect(0, 0, 160, 160, 24), fill: colors.violet, opacity: 0.5 },
  ]);

describe('morph', () => {
  it('returns each key shape exactly at its key time', () => {
    const m = shapeshifter();
    for (const key of m.keys) {
      const frame = m.at(key.at);
      expect(frame.geometry).toEqual(key.shape);
      expect(frame.fill).toBe(key.fill);
    }
    expect(m.at(-1).geometry).toEqual(m.keys[0]?.shape);
    expect(m.at(99).geometry).toEqual(m.keys.at(-1)?.shape);
  });

  it('interpolates rect → pill → circle parametrically (stays a crisp rect)', () => {
    const m = morph([
      { at: 0, shape: rect(0, 0, 200, 100, 0) },
      { at: 1, shape: pill(0, 0, 300, 100) },
      { at: 2, shape: circle(0, 0, 50) },
    ]);
    expect(m.at(0.5).geometry).toEqual(rect(0, 0, 250, 100, 25));
    const mid = m.at(1.5).geometry;
    expect(mid).toMatchObject({ kind: 'rect', width: 200, height: 100, radius: 50 });
  });

  it('uses the drawn (clamped) radius so pill → circle does not jump', () => {
    const m = morph([
      { at: 0, shape: rect(0, 0, 100, 100, 999) },
      { at: 1, shape: rect(0, 0, 100, 100, 0) },
    ]);
    expect(m.at(0.5).geometry).toMatchObject({ radius: 25 });
  });

  it('morphs through a path as a polygon of matched samples', () => {
    const geometry = shapeshifter().at(2.5).geometry;
    expect(geometry.kind).toBe('path');
    if (geometry.kind === 'path') {
      expect(geometry.d.startsWith('M')).toBe(true);
      expect(geometry.d.match(/L/g)).toHaveLength(255);
    }
  });

  it('does not twist: morphing a shape into itself barely moves any point', () => {
    const square: Geometry = rect(0, 0, 100, 100, 10);
    const asPath = pathGeometry(
      'M50 0 L100 0 L100 100 L0 100 L0 0 Z'.replace(/(-?\d+)/g, (n) => String(Number(n) - 50)),
    );
    const m = morph([
      { at: 0, shape: square },
      { at: 1, shape: asPath },
    ]);
    const mid = m.at(0.5).geometry;
    const from = sampleOutline(square, 256);
    const points = sampleOutline(mid, 256);
    const maxMove = Math.max(
      ...points.map((p, i) => Math.hypot(p.x - from[i]!.x, p.y - from[i]!.y)),
    );
    expect(maxMove).toBeLessThan(5);
  });

  it('mixes fill in OKLCH and lerps rotation and opacity together with shape', () => {
    const m = shapeshifter();
    const frame = m.at(3.5);
    expect(frame.opacity).toBeCloseTo(0.75, 12);
    expect(frame.rotation).toBeCloseTo(0, 12); // rotation 0 at keys 3 and 4
    expect(m.at(1.5).rotation).toBeCloseTo(45, 12);
    expect(rgbToOklch(parseColor(frame.fill ?? '')).c).toBeGreaterThan(0.1);
  });

  it('is a pure function of t', () => {
    const a = shapeshifter();
    const b = shapeshifter();
    const times = Array.from({ length: 121 }, (_, i) => i / 30);
    const forward = times.map((t) => JSON.stringify(a.at(t)));
    const shuffled = [...times]
      .reverse()
      .map((t) => JSON.stringify(b.at(t)))
      .reverse();
    expect(forward).toEqual(shuffled);
  });

  it('rejects keys out of order', () => {
    expect(() =>
      morph([
        { at: 1, shape: rect(0, 0, 1, 1) },
        { at: 0, shape: rect(0, 0, 1, 1) },
      ]),
    ).toThrow(RangeError);
  });
});

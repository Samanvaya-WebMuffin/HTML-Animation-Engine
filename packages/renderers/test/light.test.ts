import { defaultTheme, parseColor, rect, type LinearGradient } from '@html-animation-engine/core';
import { describe, expect, it } from 'vitest';
import {
  backdrop,
  elevationShadows,
  glowShadows,
  groundShadow,
  lightSweep,
  litFill,
} from '../src/effects/index.js';

const lighting = defaultTheme.lighting;
const box = { x: 0, y: 0, width: 200, height: 100 };

describe('elevationShadows', () => {
  it('stacks one shadow per layer, falling straight down in the shadow colour', () => {
    const shadows = elevationShadows(lighting, 'mid');
    expect(shadows).toHaveLength(lighting.elevation.mid.length);
    for (const [i, shadow] of shadows.entries()) {
      const layer = lighting.elevation.mid[i]!;
      expect(shadow).toMatchObject({ x: 0, y: layer.y, blur: layer.blur });
      expect(parseColor(shadow.color).a).toBeCloseTo(layer.alpha, 2);
    }
  });

  it('spreads and fades as the object lifts', () => {
    const low = elevationShadows(lighting, 'mid', { lift: 1 });
    const high = elevationShadows(lighting, 'mid', { lift: 2 });
    expect(high[1]!.y).toBeGreaterThan(low[1]!.y);
    expect(high[1]!.blur!).toBeGreaterThan(low[1]!.blur!);
    expect(parseColor(high[1]!.color).a).toBeLessThan(parseColor(low[1]!.color).a);
  });
});

describe('glowShadows', () => {
  it('is centred (no offset) and scales with strength', () => {
    const glow = glowShadows(lighting, defaultTheme.colors.lime, { radius: 30, strength: 0.5 });
    expect(glow.every((s) => s.x === 0 && s.y === 0)).toBe(true);
    expect(Math.max(...glow.map((s) => s.blur ?? 0))).toBe(30);
    expect(parseColor(glow[1]!.color).a).toBeCloseTo(lighting.glow * 0.5, 2);
  });
});

describe('litFill', () => {
  it('runs top to bottom, lighter at the top and darker at the bottom', () => {
    const fill = litFill(lighting, defaultTheme.colors.blue, { y: 50, height: 100 });
    expect(fill).toMatchObject({ type: 'linear', x1: 0, y1: 0, x2: 0, y2: 100 });
    const lum = (c: string) => {
      const { r, g, b } = parseColor(c);
      return r + g + b;
    };
    const [top, mid, bottom] = fill.stops.map((s) => lum(s.color));
    expect(top).toBeGreaterThan(mid!);
    expect(bottom).toBeLessThan(mid!);
  });
});

describe('lightSweep', () => {
  it('shows nothing before it starts or after it ends', () => {
    expect(lightSweep('s', rect(0, 0, 200, 100), box, 0, { color: '#fff' })).toBeNull();
    expect(lightSweep('s', rect(0, 0, 200, 100), box, 1, { color: '#fff' })).toBeNull();
  });

  it('keeps stops ordered inside 0–1 and moves the band forward', () => {
    const offsets = [0.01, 0.5, 0.99].map((p) => {
      const node = lightSweep('s', rect(0, 0, 200, 100), box, p, { color: '#fff' })!;
      const band = node.children[0]!;
      const fill = (band as { fill: LinearGradient }).fill;
      const stops = fill.stops.map((s) => s.offset);
      expect(stops.every((o) => o >= 0 && o <= 1)).toBe(true);
      expect([...stops].sort((a, b) => a - b)).toEqual(stops);
      return stops[3]!;
    });
    expect(offsets[0]).toBeLessThan(offsets[1]!);
    expect(offsets[1]).toBeLessThan(offsets[2]!);
  });
});

describe('backdrop and groundShadow', () => {
  it('are pure: the same inputs give the same nodes', () => {
    const make = () =>
      backdrop('bg', lighting, {
        width: 1280,
        height: 720,
        lights: [{ x: 100, y: 100, radius: 300, color: defaultTheme.colors.pink }],
      });
    expect(make()).toEqual(make());
    expect(make().children).toHaveLength(2);
    const shadow = groundShadow('g', { x: 10, y: 20, width: 200, height: 40, color: '#000' });
    expect(shadow.transform).toMatchObject({ x: 10, y: 20, scaleY: 0.2 });
  });
});

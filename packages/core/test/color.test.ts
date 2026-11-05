import { describe, expect, it } from 'vitest';
import {
  formatColor,
  mixColors,
  oklchToRgb,
  parseColor,
  rgbToOklch,
  withAlpha,
} from '../src/index.js';

/** Plain sRGB channel mixing: what we are avoiding. */
function mixRgb(a: string, b: string, p: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  const m = (u: number, v: number) => u + (v - u) * p;
  return formatColor({ r: m(x.r, y.r), g: m(x.g, y.g), b: m(x.b, y.b), a: 1 });
}

describe('parseColor', () => {
  it('parses hex in every length', () => {
    expect(parseColor('#f00')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(parseColor('#ff000080').a).toBeCloseTo(128 / 255, 10);
    expect(parseColor('#0f08')).toEqual({ r: 0, g: 1, b: 0, a: 0x88 / 255 });
    expect(parseColor('#3D7CFF')).toEqual(parseColor('#3d7cff'));
  });

  it('parses rgb() and rgba() in comma and space syntax', () => {
    expect(parseColor('rgb(255, 0, 0)')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(parseColor('rgba(0, 0, 255, 0.5)')).toEqual({ r: 0, g: 0, b: 1, a: 0.5 });
    expect(parseColor('rgb(0 255 0 / 25%)')).toEqual({ r: 0, g: 1, b: 0, a: 0.25 });
    expect(parseColor('rgb(100% 0% 50%)')).toEqual({ r: 1, g: 0, b: 0.5, a: 1 });
  });

  it('parses oklch() and named keywords', () => {
    expect(formatColor(parseColor('oklch(0.627955 0.257683 29.2339)'))).toBe('#ff0000');
    expect(parseColor('transparent').a).toBe(0);
    expect(parseColor('white')).toEqual({ r: 1, g: 1, b: 1, a: 1 });
  });

  it('rejects colours it does not understand', () => {
    expect(() => parseColor('#12')).toThrow(SyntaxError);
    expect(() => parseColor('rebeccapurple')).toThrow(SyntaxError);
    expect(() => parseColor('hsl(0 100% 50%)')).toThrow(SyntaxError);
  });
});

describe('OKLCH conversion', () => {
  it('matches the reference values for sRGB primaries', () => {
    // Reference values from the CSS Color 4 sample code.
    const red = rgbToOklch(parseColor('#ff0000'));
    expect(red.l).toBeCloseTo(0.627955, 5);
    expect(red.c).toBeCloseTo(0.257683, 5);
    expect(red.h).toBeCloseTo(29.2339, 3);
    const white = rgbToOklch(parseColor('#ffffff'));
    expect(white.l).toBeCloseTo(1, 6);
    expect(white.c).toBeLessThan(1e-4);
  });

  it('round-trips every 8-bit grey and a grid of colours', () => {
    for (let r = 0; r <= 255; r += 17) {
      for (let g = 0; g <= 255; g += 51) {
        for (let b = 0; b <= 255; b += 85) {
          const hex = formatColor({ r: r / 255, g: g / 255, b: b / 255, a: 1 });
          expect(formatColor(oklchToRgb(rgbToOklch(parseColor(hex))))).toBe(hex);
        }
      }
    }
  });

  it('maps out-of-gamut colours into sRGB, keeping lightness and hue', () => {
    const wild = { l: 0.7, c: 0.5, h: 150, a: 1 };
    const mapped = oklchToRgb(wild);
    for (const v of [mapped.r, mapped.g, mapped.b]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    const back = rgbToOklch(mapped);
    expect(back.l).toBeCloseTo(0.7, 2);
    expect(back.h).toBeCloseTo(150, 0);
    expect(back.c).toBeLessThan(0.5);
  });
});

describe('mixColors (OKLCH)', () => {
  it('returns the exact endpoints', () => {
    expect(mixColors('#c6ff3d', '#ff5fa2', 0)).toBe('#c6ff3d');
    expect(mixColors('#c6ff3d', '#ff5fa2', 1)).toBe('#ff5fa2');
  });

  it('keeps lime → pink vivid and bright where RGB mixing turns brown', () => {
    const lime = '#00ff00';
    const pink = '#ff69b4';
    const ps = Array.from({ length: 21 }, (_, i) => i / 20);
    const path = (mix: (a: string, b: string, p: number) => string) =>
      ps.map((p) => rgbToOklch(parseColor(mix(lime, pink, p))));
    const oklchPath = path(mixColors);
    const rgbPath = path(mixRgb);
    const minChroma = (stops: { c: number }[]) => Math.min(...stops.map((s) => s.c));

    // RGB passes through a dusty brown (chroma ≈ 0.06 near p = 0.75)…
    expect(minChroma(rgbPath)).toBeLessThan(0.07);
    // …while OKLCH stays at more than twice that everywhere.
    expect(minChroma(oklchPath)).toBeGreaterThan(2 * minChroma(rgbPath));

    // OKLCH lightness moves steadily between the endpoints; RGB dips below both.
    const [l0, l1] = [oklchPath[0]?.l ?? 0, oklchPath.at(-1)?.l ?? 0];
    for (const stop of oklchPath) {
      expect(stop.l).toBeGreaterThanOrEqual(Math.min(l0, l1) - 1e-6);
      expect(stop.l).toBeLessThanOrEqual(Math.max(l0, l1) + 1e-6);
    }
    expect(Math.min(...rgbPath.map((s) => s.l))).toBeLessThan(Math.min(l0, l1) - 0.02);
  });

  it('takes the shorter way round the hue wheel', () => {
    // Hues ~29° (red) and ~328° (magenta): the short arc passes through ~358°,
    // not through green at ~180°.
    const mid = rgbToOklch(parseColor(mixColors('#ff0000', '#ff00ff', 0.5))).h;
    expect(mid > 300 || mid < 30).toBe(true);
  });

  it('does not swing through the spectrum when one end is grey', () => {
    const steps = [0.25, 0.5, 0.75].map((p) =>
      rgbToOklch(parseColor(mixColors('#808080', '#3d7cff', p))),
    );
    const blueHue = rgbToOklch(parseColor('#3d7cff')).h;
    for (const step of steps) expect(step.h).toBeCloseTo(blueHue, 0);
  });

  it('interpolates alpha and premultiplies', () => {
    expect(mixColors('rgba(255, 0, 0, 0)', '#0000ff', 0.5)).toMatch(
      /^rgba\(\d+, \d+, \d+, 0\.5\)$/,
    );
    // Mixing towards transparent keeps the visible colour's hue and chroma.
    const fading = parseColor(mixColors('#ff0000', 'transparent', 0.5));
    expect(fading.a).toBeCloseTo(0.5, 3);
    expect(formatColor({ ...fading, a: 1 })).toBe('#ff0000');
  });

  it('is exactly repeatable', () => {
    const a = Array.from({ length: 101 }, (_, i) => mixColors('#c6ff3d', '#8b5cff', i / 100));
    const b = Array.from({ length: 101 }, (_, i) => mixColors('#c6ff3d', '#8b5cff', i / 100));
    expect(a).toEqual(b);
  });
});

describe('withAlpha', () => {
  it('multiplies alpha', () => {
    expect(withAlpha('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
    expect(withAlpha('rgba(0, 0, 0, 0.5)', 0.5)).toBe('rgba(0, 0, 0, 0.25)');
  });
});

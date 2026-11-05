import { describe, expect, it } from 'vitest';
import {
  cubicBezier,
  defaultTheme,
  linear,
  reverseEase,
  spring,
  springSettleTime,
  springValue,
  steps,
  type Ease,
  type SpringOptions,
} from '../src/index.js';

const SAMPLES = Array.from({ length: 1001 }, (_, i) => i / 1000);

/** Independent reference: solve x(s) = p by pure bisection to 1e-12. */
function referenceBezier(x1: number, y1: number, x2: number, y2: number) {
  const bez = (s: number, a: number, b: number) =>
    3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s;
  return (p: number) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (bez(mid, x1, x2) < p) lo = mid;
      else hi = mid;
    }
    return bez((lo + hi) / 2, y1, y2);
  };
}

const CURVES: [string, [number, number, number, number]][] = [
  ['ease', [0.25, 0.1, 0.25, 1]],
  ['ease-in-out', [0.42, 0, 0.58, 1]],
  ['expo-out', [0.16, 1, 0.3, 1]],
  ['steep (flat slope at ends, hard for Newton)', [1, 0, 0, 1]],
  ['zero x1', [0, 0.5, 0, 1]],
  ['overshoot', [0.34, 1.56, 0.64, 1]],
];

describe('cubicBezier', () => {
  it.each(CURVES)('%s hits both endpoints exactly', (_name, args) => {
    const ease = cubicBezier(...args);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(-0.5)).toBe(0);
    expect(ease(1.5)).toBe(1);
  });

  it.each(CURVES)('%s matches an independent bisection solver', (_name, args) => {
    const ease = cubicBezier(...args);
    const reference = referenceBezier(...args);
    for (const p of SAMPLES) expect(ease(p)).toBeCloseTo(reference(p), 5);
  });

  it('matches the CSS "ease" value at p = 0.5', () => {
    expect(cubicBezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024033877399112, 6);
  });

  it('is monotonic when y1, y2 are within [0, 1]', () => {
    for (const [, args] of CURVES.filter(([, [, y1, , y2]]) => y1 >= 0 && y1 <= 1 && y2 <= 1)) {
      expectMonotonic(cubicBezier(...args));
    }
  });

  it('rejects x control points outside [0, 1]', () => {
    expect(() => cubicBezier(-0.1, 0, 1, 1)).toThrow(RangeError);
    expect(() => cubicBezier(0, 0, 1.1, 1)).toThrow(RangeError);
  });

  it('treats a diagonal curve as linear', () => {
    expect(cubicBezier(0.3, 0.3, 0.7, 0.7)(0.42)).toBe(0.42);
  });
});

function expectMonotonic(ease: Ease) {
  let previous = -Infinity;
  for (const p of SAMPLES) {
    const value = ease(p);
    expect(value).toBeGreaterThanOrEqual(previous - 1e-12);
    previous = value;
  }
}

describe('steps', () => {
  it('jump-end steps down at the start of each interval', () => {
    const ease = steps(4);
    expect([0, 0.24, 0.25, 0.5, 0.99, 1].map(ease)).toEqual([0, 0, 0.25, 0.5, 0.75, 1]);
  });

  it('jump-start, jump-none and jump-both follow CSS', () => {
    expect([0, 0.3, 1].map(steps(2, 'jump-start'))).toEqual([0.5, 0.5, 1]);
    expect([0, 0.49, 0.5, 1].map(steps(2, 'jump-none'))).toEqual([0, 0, 1, 1]);
    expect([0, 0.5, 1].map(steps(2, 'jump-both'))).toEqual([1 / 3, 2 / 3, 1]);
  });

  it('lands on the right step despite floating-point error', () => {
    expect(steps(10)(0.3)).toBe(0.3);
  });

  it('is monotonic', () => expectMonotonic(steps(7)));
});

/** RK4 integration of m·x'' = -k·(x - 1) - c·x', as an independent check. */
function integrateSpring(options: Required<Omit<SpringOptions, 'precision'>>, until: number) {
  const { stiffness: k, damping: c, mass: m, velocity } = options;
  const dt = 1 / 20000;
  let x = 0;
  let v = velocity;
  const accel = (px: number, pv: number) => (-k * (px - 1) - c * pv) / m;
  for (let t = 0; t < until - 1e-12; t += dt) {
    const k1x = v;
    const k1v = accel(x, v);
    const k2x = v + (dt / 2) * k1v;
    const k2v = accel(x + (dt / 2) * k1x, v + (dt / 2) * k1v);
    const k3x = v + (dt / 2) * k2v;
    const k3v = accel(x + (dt / 2) * k2x, v + (dt / 2) * k2v);
    const k4x = v + dt * k3v;
    const k4v = accel(x + dt * k3x, v + dt * k3v);
    x += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    v += (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
  }
  return x;
}

const REGIMES: [string, Required<Omit<SpringOptions, 'precision'>>][] = [
  ['underdamped', { stiffness: 400, damping: 22, mass: 1, velocity: 0 }],
  ['critically damped', { stiffness: 100, damping: 20, mass: 1, velocity: 0 }],
  ['overdamped', { stiffness: 100, damping: 60, mass: 1, velocity: 0 }],
  ['underdamped with initial velocity', { stiffness: 170, damping: 12, mass: 2, velocity: 4 }],
];

describe('spring', () => {
  it.each(REGIMES)('%s closed form matches numerical integration', (_name, options) => {
    for (const t of [0.05, 0.1, 0.25, 0.5, 1]) {
      expect(springValue(t, options)).toBeCloseTo(integrateSpring(options, t), 6);
    }
  });

  it.each(REGIMES)('%s settles: stays within precision after its settle time', (_name, options) => {
    const settle = springSettleTime(options);
    for (let t = settle; t < settle + 5; t += 0.001) {
      expect(Math.abs(springValue(t, options) - 1)).toBeLessThan(0.001);
    }
  });

  it('as an ease, hits 0 and 1 exactly and lasts its settle time', () => {
    const ease = spring({ stiffness: 400, damping: 22 });
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease.duration).toBe(springSettleTime({ stiffness: 400, damping: 22 }));
    expect(ease.duration).toBeGreaterThan(0.3);
    expect(ease.duration).toBeLessThan(1);
  });

  it('underdamped overshoots; critically and overdamped never do', () => {
    const peak = (options: SpringOptions) => Math.max(...SAMPLES.map((p) => spring(options)(p)));
    expect(peak({ stiffness: 400, damping: 22 })).toBeGreaterThan(1.05);
    expect(peak({ stiffness: 100, damping: 20 })).toBeLessThanOrEqual(1);
    expect(peak({ stiffness: 100, damping: 60 })).toBeLessThanOrEqual(1);
  });

  it('is exactly repeatable', () => {
    const a = SAMPLES.map(spring({ stiffness: 300, damping: 10 }));
    const b = SAMPLES.map(spring({ stiffness: 300, damping: 10 }));
    expect(a).toEqual(b);
  });

  it('rejects springs that never settle', () => {
    expect(() => springSettleTime({ stiffness: 100, damping: 0 })).toThrow(RangeError);
  });
});

describe('easing tokens', () => {
  const { easing } = defaultTheme;

  it.each(Object.entries(easing))('%s hits both endpoints exactly', (_name, ease) => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it.each(['linear', 'enter', 'exit', 'camera', 'wipe'] as const)('%s is monotonic', (name) => {
    expectMonotonic(easing[name]);
  });

  it('snap overshoots', () => {
    expect(Math.max(...SAMPLES.map(easing.snap))).toBeGreaterThan(1.05);
  });

  it('reverseEase turns ease-out into ease-in', () => {
    const easeIn = reverseEase(easing.enter);
    expect(easeIn(0)).toBe(0);
    expect(easeIn(1)).toBe(1);
    expect(easeIn(0.2)).toBeLessThan(0.2);
    expect(linear(0.3)).toBe(0.3);
  });
});

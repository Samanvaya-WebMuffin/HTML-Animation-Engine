import { describe, expect, it } from 'vitest';
import { createNoise, createRng, hashString, random, seedToInt } from '../src/index.js';

const draw = (seed: number | string, n = 1000) => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    expect(draw(42)).toEqual(draw(42));
    expect(draw('logo-reveal')).toEqual(draw('logo-reveal'));
  });

  it('produces different sequences for different seeds, even adjacent ones', () => {
    expect(draw(1, 10)).not.toEqual(draw(2, 10));
    expect(draw('a', 10)).not.toEqual(draw('b', 10));
    expect(draw(1.5, 10)).not.toEqual(draw(1, 10));
  });

  it('pins the first outputs, so a change to the generator is caught', () => {
    expect(draw(42, 3).map((v) => v.toFixed(12))).toMatchInlineSnapshot(`
      [
        "0.095480083954",
        "0.369531449862",
        "0.028820459964",
      ]
    `);
  });

  it('is roughly uniform in [0, 1)', () => {
    const values = draw(7, 20000);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeCloseTo(0.5, 1);
    const buckets = new Array<number>(10).fill(0);
    for (const v of values) buckets[Math.floor(v * 10)]!++;
    for (const count of buckets) expect(count).toBeGreaterThan(1800);
  });

  it('has helpers that stay in range and are repeatable', () => {
    const rng = createRng(3);
    for (let i = 0; i < 1000; i++) {
      const n = rng.int(-2, 2);
      expect(Number.isInteger(n) && n >= -2 && n <= 2).toBe(true);
      const r = rng.range(10, 20);
      expect(r >= 10 && r < 20).toBe(true);
    }
    const items = ['a', 'b', 'c', 'd', 'e'];
    expect(createRng(9).shuffle(items)).toEqual(createRng(9).shuffle(items));
    expect([...createRng(9).shuffle(items)].sort()).toEqual(items);
    expect(items.includes(createRng(1).pick(items))).toBe(true);
    const gaussians = Array.from({ length: 5000 }, () => rng.gaussian(10, 2));
    const mean = gaussians.reduce((a, b) => a + b, 0) / gaussians.length;
    expect(mean).toBeCloseTo(10, 0);
  });

  it('forks into independent, repeatable streams', () => {
    const a = createRng(5).fork('stars');
    const b = createRng(5).fork('stars');
    const c = createRng(5).fork('dust');
    expect(a.next()).toBe(b.next());
    expect(createRng(5).fork('stars').next()).not.toBe(c.next());
  });
});

describe('random (stateless)', () => {
  it('depends only on seed and keys, not on call order', () => {
    const forward = Array.from({ length: 50 }, (_, i) => random(123, 'particle', i));
    const backward = Array.from({ length: 50 }, (_, i) =>
      random(123, 'particle', 49 - i),
    ).reverse();
    expect(forward).toEqual(backward);
  });

  it('separates keys', () => {
    expect(random(1, 'x', 0)).not.toBe(random(1, 'y', 0));
    expect(random(1, 0, 1)).not.toBe(random(1, 1, 0));
  });

  it('hashes strings to stable 32-bit integers', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
    expect(seedToInt('hello')).toBe(hashString('hello'));
    expect(hashString('hello')).toBeGreaterThanOrEqual(0);
    expect(hashString('hello')).toBeLessThan(2 ** 32);
    expect(() => seedToInt(Number.NaN)).toThrow(RangeError);
  });
});

describe('createNoise', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = createNoise(1);
    const b = createNoise(1);
    const c = createNoise(2);
    for (let i = 0; i < 100; i++) {
      const x = i * 0.137;
      const y = i * 0.071;
      expect(a.noise2(x, y)).toBe(b.noise2(x, y));
      expect(a.noise3(x, y, 0.5)).toBe(b.noise3(x, y, 0.5));
    }
    expect(a.noise2(0.3, 0.7)).not.toBe(c.noise2(0.3, 0.7));
  });

  it('stays within [-1, 1] and is smooth', () => {
    const noise = createNoise('range');
    let previous = noise.noise2(0, 0);
    for (let i = 1; i < 5000; i++) {
      const value = noise.noise2(i * 0.01, i * 0.003);
      expect(Math.abs(value)).toBeLessThanOrEqual(1);
      expect(Math.abs(value - previous)).toBeLessThan(0.1);
      previous = value;
      expect(Math.abs(noise.noise3(i * 0.02, 1, i * 0.005))).toBeLessThanOrEqual(1);
      expect(Math.abs(noise.fbm2(i * 0.01, 2))).toBeLessThanOrEqual(1);
    }
  });

  it('loops seamlessly: loop(0) === loop(1), with independent channels', () => {
    const noise = createNoise('loop');
    for (const channel of [0, 1, 2])
      expect(noise.loop(1, 1.5, channel)).toBe(noise.loop(0, 1.5, channel));
    expect(noise.loop(0.25, 1, 0)).not.toBe(noise.loop(0.25, 1, 1));
  });
});

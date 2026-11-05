import { hashKeys, seedToInt, type Seed } from './hash.js';

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  /** Normally distributed number (Box–Muller). */
  gaussian(mean?: number, deviation?: number): number;
  /** A uniformly chosen element. */
  pick<T>(items: readonly T[]): T;
  /** A shuffled copy (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** An independent generator derived from this seed and `key`. */
  fork(key: number | string): Rng;
}

/**
 * Seeded generator (sfc32, seeded through splitmix32). Stateful: create it
 * inside `render` or `setup`, never at module scope, so each frame starts
 * from the same state.
 */
export function createRng(seed: Seed): Rng {
  const base = seedToInt(seed);
  let s = base;
  const splitmix = () => {
    s = (s + 0x9e3779b9) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = splitmix();
  let b = splitmix();
  let c = splitmix();
  let d = splitmix();

  const nextUint = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  // Discard the first outputs to decorrelate nearby seeds.
  for (let i = 0; i < 12; i++) nextUint();

  const next = () => nextUint() / 0x100000000;
  const rng: Rng = {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    gaussian(mean = 0, deviation = 1) {
      const u = 1 - next();
      const v = next();
      return mean + deviation * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    pick(items) {
      if (items.length === 0) throw new RangeError('rng.pick: empty array.');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    shuffle(items) {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j] as (typeof copy)[number], copy[i] as (typeof copy)[number]];
      }
      return copy;
    },
    fork: (key) => createRng(hashKeys(base, [key])),
  };
  return rng;
}

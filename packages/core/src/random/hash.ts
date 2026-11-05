/** A seed may be a number or a string (strings are hashed). */
export type Seed = number | string;

/** MurmurHash3 finaliser: avalanches all 32 bits. */
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** FNV-1a over UTF-16 code units, then avalanched. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return fmix32(h);
}

/** Normalises a seed to an unsigned 32-bit integer. */
export function seedToInt(seed: Seed): number {
  if (typeof seed === 'string') return hashString(seed);
  if (!Number.isFinite(seed)) throw new RangeError(`Invalid seed ${seed}.`);
  // Fold the integer and fractional parts so that 1.5 and 1 differ.
  const whole = Math.floor(seed);
  return fmix32((whole ^ Math.round((seed - whole) * 0x7fffffff)) >>> 0);
}

/** Combines a seed with any number of keys into one 32-bit hash. */
export function hashKeys(seed: Seed, keys: readonly (number | string)[]): number {
  let h = seedToInt(seed);
  for (const key of keys) {
    h = fmix32((h ^ seedToInt(key)) + 0x9e3779b9);
  }
  return h;
}

/**
 * Stateless random number in [0, 1) for `seed` and `keys`. The same inputs
 * always give the same output, so it is safe to call inside `render(t)`:
 * `random(ctx.seed, 'particle', i)`.
 */
export function random(seed: Seed, ...keys: (number | string)[]): number {
  return hashKeys(seed, keys) / 0x100000000;
}

import type { Seed } from './hash.js';
import { createRng } from './rng.js';

export interface Noise {
  /** 1D noise in about [-1, 1]. */
  noise1(x: number): number;
  /** 2D simplex noise in about [-1, 1]. */
  noise2(x: number, y: number): number;
  /** 3D simplex noise in about [-1, 1]. */
  noise3(x: number, y: number, z: number): number;
  /** Fractal (fBm) 2D noise: `octaves` layers, each at double frequency and `gain` amplitude. */
  fbm2(x: number, y: number, octaves?: number, gain?: number): number;
  /**
   * Noise that loops: `p` in [0, 1] travels once round a circle in noise
   * space, so `loop(0) === loop(1)`. `radius` sets how much it varies over a
   * loop; `channel` picks an independent loop (e.g. one per particle).
   */
  loop(p: number, radius?: number, channel?: number): number;
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;

const GRAD3 = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
] as const;

/**
 * Seeded simplex noise (after Stefan Gustavson's reference implementation).
 * Uses only arithmetic and `Math.floor`, so it is exactly repeatable.
 */
export function createNoise(seed: Seed): Noise {
  const rng = createRng(seed);
  const base = rng.shuffle(Array.from({ length: 256 }, (_, i) => i));
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = base[i & 255] as number;
    permMod12[i] = (perm[i] as number) % 12;
  }
  const grad = (index: number) => GRAD3[permMod12[index] as number] as readonly number[];

  const noise2 = (xin: number, yin: number): number => {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1];
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const corner = (x: number, y: number, gi: number) => {
      const falloff = 0.5 - x * x - y * y;
      if (falloff < 0) return 0;
      const g = grad(gi);
      return falloff ** 4 * ((g[0] as number) * x + (g[1] as number) * y);
    };
    const n0 = corner(x0, y0, ii + (perm[jj] as number));
    const n1 = corner(x1, y1, ii + i1 + (perm[jj + j1] as number));
    const n2 = corner(x2, y2, ii + 1 + (perm[jj + 1] as number));
    return 70 * (n0 + n1 + n2);
  };

  const noise3 = (xin: number, yin: number, zin: number): number => {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);
    let i1: number, j1: number, k1: number, i2: number, j2: number, k2: number;
    if (x0 >= y0) {
      if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0];
      else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1];
      else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1];
    } else if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1];
    else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1];
    else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0];

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    const corner = (x: number, y: number, z: number, gi: number) => {
      const falloff = 0.6 - x * x - y * y - z * z;
      if (falloff < 0) return 0;
      const g = grad(gi);
      return falloff ** 4 * ((g[0] as number) * x + (g[1] as number) * y + (g[2] as number) * z);
    };
    const p = (a: number) => perm[a] as number;
    const n0 = corner(x0, y0, z0, ii + p(jj + p(kk)));
    const n1 = corner(x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3, ii + i1 + p(jj + j1 + p(kk + k1)));
    const n2 = corner(
      x0 - i2 + 2 * G3,
      y0 - j2 + 2 * G3,
      z0 - k2 + 2 * G3,
      ii + i2 + p(jj + j2 + p(kk + k2)),
    );
    const n3 = corner(
      x0 - 1 + 3 * G3,
      y0 - 1 + 3 * G3,
      z0 - 1 + 3 * G3,
      ii + 1 + p(jj + 1 + p(kk + 1)),
    );
    return 32 * (n0 + n1 + n2 + n3);
  };

  return {
    noise1: (x) => noise2(x, 0.5),
    noise2,
    noise3,
    fbm2(x, y, octaves = 4, gain = 0.5) {
      let sum = 0;
      let amplitude = 1;
      let frequency = 1;
      let norm = 0;
      for (let o = 0; o < octaves; o++) {
        sum += amplitude * noise2(x * frequency, y * frequency);
        norm += amplitude;
        amplitude *= gain;
        frequency *= 2;
      }
      return sum / norm;
    },
    loop(p, radius = 1, channel = 0) {
      const angle = 2 * Math.PI * (p - Math.floor(p));
      return noise3(Math.cos(angle) * radius, Math.sin(angle) * radius, channel * 7.31);
    },
  };
}

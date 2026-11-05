/**
 * Flash-safety analysis after WCAG 2.3.1 ("Three Flashes or Below
 * Threshold"). A *flash* is a pair of opposing changes in relative luminance
 * of at least 10 % where the darker state is below 0.80. A region fails when
 * it flashes more than 3 times in any one-second window.
 *
 * WCAG only counts flashes that cover a large enough area: 25 % of a 10°
 * visual field, about 341 × 256 px at 1024 × 768, i.e. a third of each screen
 * dimension. So frames are analysed in regions of that size (a third of the
 * width by a third of the height), overlapping in steps of a sixth, using each
 * region's mean relative luminance. A full-contrast flash covering a quarter
 * of a region moves its mean by ~0.25 and is caught; a small flicker, such as
 * a ticking digit, is diluted below the 10 % threshold, as WCAG intends.
 *
 * Works on raw RGBA bytes, so it runs in the browser or in Node.
 */

export interface FlashOptions {
  /** Frame width and height in pixels of the RGBA buffers you will push. */
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  /** Cells per row and column. Default 6. */
  readonly grid?: number;
  /** Region size in cells (regions slide one cell at a time). Default 2 (a third of the frame). */
  readonly window?: number;
  /** Minimum luminance change that counts. Default 0.1 (WCAG). */
  readonly threshold?: number;
  /** Flashes allowed per second before warning. Default 3 (WCAG). */
  readonly maxFlashesPerSecond?: number;
}

export interface FlashWarning {
  /** Region in pixels. */
  readonly region: { x: number; y: number; width: number; height: number };
  /** Flashes counted in the worst one-second window. */
  readonly flashes: number;
  /** Start time in seconds of that window. */
  readonly at: number;
}

export interface FlashReport {
  readonly safe: boolean;
  readonly frames: number;
  /** Highest flash count in any region and any one-second window. */
  readonly maxFlashesPerSecond: number;
  /** One entry per failing region (its worst window). */
  readonly warnings: readonly FlashWarning[];
}

export interface FlashDetector {
  /** Adds the next frame (RGBA bytes, row-major, `width × height × 4`). */
  push(rgba: ArrayLike<number>): void;
  report(): FlashReport;
}

const LINEAR = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

/** WCAG relative luminance of an 8-bit sRGB colour. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * (LINEAR[r] ?? 0) + 0.7152 * (LINEAR[g] ?? 0) + 0.0722 * (LINEAR[b] ?? 0);
}

interface RegionState {
  /** Luminance of the last turning point. */
  extreme: number;
  /** +1 rising, -1 falling, 0 not yet moving. */
  direction: number;
  /** Frame indices of counted transitions. */
  transitions: number[];
}

export function createFlashDetector(options: FlashOptions): FlashDetector {
  const { width, height, fps } = options;
  const grid = options.grid ?? 6;
  const span = options.window ?? 2;
  const regionsPerSide = grid - span + 1;
  const threshold = options.threshold ?? 0.1;
  const maxFlashes = options.maxFlashesPerSecond ?? 3;
  const cellW = width / grid;
  const cellH = height / grid;
  const regions: RegionState[] = [];
  let frame = 0;

  const means = new Float64Array(grid * grid);
  const counts = new Uint32Array(grid * grid);

  return {
    push(rgba) {
      if (rgba.length !== width * height * 4) {
        throw new RangeError(`flash: expected ${width * height * 4} bytes, got ${rgba.length}.`);
      }
      means.fill(0);
      counts.fill(0);
      for (let y = 0; y < height; y++) {
        const row = Math.min(grid - 1, Math.floor(y / cellH)) * grid;
        for (let x = 0; x < width; x++) {
          const cell = row + Math.min(grid - 1, Math.floor(x / cellW));
          const i = (y * width + x) * 4;
          means[cell] =
            (means[cell] ?? 0) +
            relativeLuminance(rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0);
          counts[cell] = (counts[cell] ?? 0) + 1;
        }
      }
      for (let cell = 0; cell < grid * grid; cell++) {
        means[cell] = (means[cell] ?? 0) / Math.max(1, counts[cell] ?? 0);
      }
      for (let region = 0; region < regionsPerSide * regionsPerSide; region++) {
        const col0 = region % regionsPerSide;
        const row0 = Math.floor(region / regionsPerSide);
        let sum = 0;
        for (let r = row0; r < row0 + span; r++) {
          for (let c = col0; c < col0 + span; c++) sum += means[r * grid + c] ?? 0;
        }
        const luminance = sum / (span * span);
        const state = regions[region];
        if (!state) {
          regions[region] = { extreme: luminance, direction: 0, transitions: [] };
          continue;
        }
        const delta = luminance - state.extreme;
        const direction = Math.sign(delta);
        if (state.direction !== 0 && direction === state.direction) {
          state.extreme = luminance; // still moving the same way: extend
        } else if (Math.abs(delta) >= threshold && Math.min(luminance, state.extreme) < 0.8) {
          state.transitions.push(frame);
          state.direction = direction;
          state.extreme = luminance;
        }
      }
      frame++;
    },

    report() {
      const window = Math.max(1, Math.round(fps));
      const warnings: FlashWarning[] = [];
      let worstOverall = 0;
      regions.forEach((state, region) => {
        let worst = 0;
        let worstStart = 0;
        let lo = 0;
        for (let hi = 0; hi < state.transitions.length; hi++) {
          while ((state.transitions[hi] ?? 0) - (state.transitions[lo] ?? 0) >= window) lo++;
          const flashes = Math.floor((hi - lo + 1) / 2);
          if (flashes > worst) {
            worst = flashes;
            worstStart = state.transitions[lo] ?? 0;
          }
        }
        worstOverall = Math.max(worstOverall, worst);
        if (worst > maxFlashes) {
          const col = region % regionsPerSide;
          const row = Math.floor(region / regionsPerSide);
          warnings.push({
            region: {
              x: Math.round(col * cellW),
              y: Math.round(row * cellH),
              width: Math.round(cellW * span),
              height: Math.round(cellH * span),
            },
            flashes: worst,
            at: worstStart / fps,
          });
        }
      });
      return {
        safe: warnings.length === 0,
        frames: frame,
        maxFlashesPerSecond: worstOverall,
        warnings,
      };
    },
  };
}

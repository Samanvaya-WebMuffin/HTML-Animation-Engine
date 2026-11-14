/**
 * Output resolution presets (landscape): the frame is scaled to fit inside
 * these bounds, turned to match the composition, so a portrait composition
 * gets the portrait size ('4k' → 2160 × 3840 for 9:16).
 */
export const RESOLUTIONS = {
  '4k': { width: 3840, height: 2160 },
  '1440p': { width: 2560, height: 1440 },
  '1080p': { width: 1920, height: 1080 },
  '720p': { width: 1280, height: 720 },
} as const;

export type ResolutionName = keyof typeof RESOLUTIONS;

export function isResolutionName(value: string): value is ResolutionName {
  return value in RESOLUTIONS;
}

/**
 * Scale factor that fits a `width × height` composition inside a preset
 * (UHD for '4k'), preserving its aspect ratio, in the composition's own
 * orientation. 1280 × 720 renders at 3× (3840 × 2160), 720 × 1280 at 3×
 * (2160 × 3840), 1080 × 1080 at 2× (2160 × 2160).
 */
export function scaleFor(width: number, height: number, resolution: ResolutionName): number {
  const { width: long, height: short } = RESOLUTIONS[resolution];
  const [bw, bh] = height > width ? [short, long] : [long, short];
  return Math.min(bw / width, bh / height);
}

/** Output pixel size for a composition at `scale`, rounded down to even numbers (yuv420p). */
export function outputSize(width: number, height: number, scale: number) {
  const even = (v: number) => Math.max(2, Math.floor((v * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}
